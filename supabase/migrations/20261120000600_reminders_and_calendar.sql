-- Configurable reminders + "add to calendar".
--   * several reminders per timer ("N minutes before it ends"), chosen by the user
--   * several reminders before a planned session starts (also written into the calendar event)
--   * session_calendar_event(): builds the calendar event + a .ics file (with VALARM reminders)
-- Replaces the old single "5 minutes before" flag.

------------------------------------------------------------------------------
-- 1. Helpers
------------------------------------------------------------------------------
-- A reminder list is valid if it has at most 5 entries, each between lo and hi minutes.
create or replace function public._offsets_ok(a int[], lo int, hi int)
returns boolean language sql immutable set search_path = '' as $$
  select a is not null and cardinality(a) <= 5
     and not exists (select 1 from unnest(a) o where o is null or o < lo or o > hi)
$$;

-- Normalise (distinct, largest first) and validate. NULL in -> NULL out (meaning "not provided").
create or replace function public._clean_offsets(p_in int[], p_lo int, p_hi int)
returns int[] language plpgsql immutable set search_path = '' as $$
declare r int[];
begin
  if p_in is null then return null; end if;
  select coalesce(array_agg(x.o order by x.o desc), '{}'::int[]) into r
    from (select distinct o from unnest(p_in) o where o is not null) x;
  if not public._offsets_ok(r, p_lo, p_hi) then
    raise exception 'Choose up to 5 reminders, each between % and % minutes.', p_lo, p_hi;
  end if;
  return r;
end $$;

create or replace function public._fmt_minutes(n int)
returns text language sql immutable set search_path = '' as $$
  select case
    when n < 60 then n || ' min'
    when n % 60 = 0 then (n / 60) || ' h'
    else (n / 60) || ' h ' || (n % 60) || ' min'
  end
$$;

create or replace function public._ics_escape(t text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(coalesce(t, ''), E'\\', E'\\\\'), ';', E'\\;'), ',', E'\\,'), E'\n', E'\\n')
$$;

------------------------------------------------------------------------------
-- 2. Columns
------------------------------------------------------------------------------
-- profile defaults (the app lets users edit these in Settings)
alter table public.profiles
  add column default_remind_minutes int[] not null default '{5}'
    check (public._offsets_ok(default_remind_minutes, 1, 60)),
  add column default_lead_minutes int[] not null default '{30}'
    check (public._offsets_ok(default_lead_minutes, 5, 1440));

-- sessions: the view selects s.*, so it has to be rebuilt around the column change
drop view public.my_sessions;

alter table public.sessions
  add column remind_minutes       int[] not null default '{5}',   -- timer: minutes before it ends
  add column fired_remind_minutes int[] not null default '{}',
  add column lead_minutes         int[] not null default '{30}',  -- planned: minutes before it starts
  add column fired_lead_minutes   int[] not null default '{}';
update public.sessions set remind_minutes = case when remind_5 then array[5] else '{}'::int[] end;
alter table public.sessions drop column remind_5, drop column notified_5;

create view public.my_sessions with (security_invoker = true) as
  select s.*,
    case s.status
      when 'planned'   then 'planned'
      when 'collected' then 'collected'
      else case when s.ends_at <= now() then 'finished' else 'running' end
    end as phase,
    case when s.status = 'active' then greatest(0, extract(epoch from s.ends_at - now()))::int end as seconds_remaining,
    case when s.status = 'active' then extract(epoch from s.ends_at - s.started_at)::int end as total_seconds
  from public.sessions s;
revoke all on public.my_sessions from anon;
grant select on public.my_sessions to authenticated;

------------------------------------------------------------------------------
-- 3. Session functions (new signatures)
------------------------------------------------------------------------------
drop function public.plan_session(date, int, public.session_kind, text, int, boolean);
drop function public.update_planned_session(uuid, date, int, public.session_kind, text, int, boolean);
drop function public.start_timer(text, text, public.session_kind, int, int, uuid);
drop function public.set_session_reminders(uuid, boolean);

create function public.plan_session(
  p_day date, p_hour int, p_kind public.session_kind, p_cycle text, p_minutes int,
  p_lead_minutes int[] default null, p_remind_minutes int[] default null)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare u uuid := public._require_user(); r public.sessions; pr public.profiles;
begin
  if p_minutes not between 10 and 180 then raise exception 'Duration must be between 10 and 180 minutes.'; end if;
  select p.* into pr from public.profiles p where p.id = u;
  insert into public.sessions (user_id, status, kind, cycle_label, planned_start, duration_minutes,
                               lead_minutes, remind_minutes, remind_end, remind_collect)
  values (u, 'planned', p_kind, p_cycle, public._slot_start(p_day, p_hour), p_minutes,
          coalesce(public._clean_offsets(p_lead_minutes, 5, 1440), pr.default_lead_minutes),
          coalesce(public._clean_offsets(p_remind_minutes, 1, 60), pr.default_remind_minutes),
          pr.reminders_default, pr.reminders_default)
  returning * into r;
  return r;
end $$;

create function public.update_planned_session(
  p_id uuid, p_day date, p_hour int, p_kind public.session_kind, p_cycle text, p_minutes int,
  p_lead_minutes int[] default null, p_remind_minutes int[] default null)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare u uuid := public._require_user(); r public.sessions;
begin
  if p_minutes not between 10 and 180 then raise exception 'Duration must be between 10 and 180 minutes.'; end if;
  update public.sessions s
     set planned_start = public._slot_start(p_day, p_hour), kind = p_kind, cycle_label = p_cycle,
         duration_minutes = p_minutes,
         lead_minutes = coalesce(public._clean_offsets(p_lead_minutes, 5, 1440), s.lead_minutes),
         remind_minutes = coalesce(public._clean_offsets(p_remind_minutes, 1, 60), s.remind_minutes),
         fired_lead_minutes = '{}'
   where s.id = p_id and s.user_id = u and s.status = 'planned'
  returning * into r;
  if not found then raise exception 'Planned session not found.'; end if;
  return r;
end $$;

-- Start a timer (fresh, or from a planned session). Reminder times that are longer than
-- the cycle itself are dropped.
create function public.start_timer(
  p_machine text, p_cycle text, p_kind public.session_kind, p_minutes int,
  p_time_scale int default 1, p_from_planned uuid default null, p_remind_minutes int[] default null)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare
  u uuid := public._require_user();
  r public.sessions;
  pr public.profiles;
  v_secs int;
  v_given int[] := public._clean_offsets(p_remind_minutes, 1, 60);
begin
  if p_minutes not between 1 and 240 then raise exception 'Duration must be between 1 and 240 minutes.'; end if;
  if p_time_scale not in (1, 60) then raise exception 'Invalid timer speed.'; end if;
  if length(btrim(coalesce(p_machine, ''))) = 0 then raise exception 'Machine name is required.'; end if;
  v_secs := greatest(1, round(p_minutes * 60.0 / p_time_scale))::int;
  select p.* into pr from public.profiles p where p.id = u;

  if p_from_planned is not null then
    update public.sessions s
       set status = 'active', machine_label = p_machine, cycle_label = p_cycle, kind = p_kind,
           duration_minutes = p_minutes, started_at = now(), ends_at = now() + make_interval(secs => v_secs),
           time_scale = p_time_scale, notified_end = false, notified_collect = false,
           remind_minutes = array(select o from unnest(coalesce(v_given, s.remind_minutes)) o
                                  where o * 60 < v_secs order by o desc),
           fired_remind_minutes = '{}'
     where s.id = p_from_planned and s.user_id = u and s.status = 'planned'
    returning * into r;
    if not found then raise exception 'Planned session not found.'; end if;
  else
    insert into public.sessions (user_id, status, kind, machine_label, cycle_label, duration_minutes,
                                 started_at, ends_at, time_scale, remind_minutes, remind_end, remind_collect)
    values (u, 'active', p_kind, p_machine, p_cycle, p_minutes, now(), now() + make_interval(secs => v_secs),
            p_time_scale,
            array(select o from unnest(coalesce(v_given, pr.default_remind_minutes)) o
                  where o * 60 < v_secs order by o desc),
            pr.reminders_default, pr.reminders_default)
    returning * into r;
  end if;
  return r;
end $$;

-- Change a session's reminders. NULL = leave that part unchanged.
create function public.set_session_reminders(
  p_id uuid, p_remind_minutes int[] default null, p_remind_end boolean default null, p_remind_collect boolean default null)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare u uuid := public._require_user(); r public.sessions; v_new int[] := public._clean_offsets(p_remind_minutes, 1, 60);
begin
  update public.sessions s
     set remind_minutes = coalesce(v_new, s.remind_minutes),
         -- reminders whose moment already passed are marked sent, so adding one mid-cycle
         -- does not fire it retroactively
         fired_remind_minutes = case
           when v_new is null then s.fired_remind_minutes
           when s.status = 'active' then array(select o from unnest(v_new) o
                  where o = any (s.fired_remind_minutes) or s.ends_at - now() <= o * interval '1 minute')
           else '{}'::int[] end,
         remind_end = coalesce(p_remind_end, s.remind_end),
         remind_collect = coalesce(p_remind_collect, s.remind_collect)
   where s.id = p_id and s.user_id = u and s.status in ('planned', 'active')
  returning * into r;
  if not found then raise exception 'Session not found.'; end if;
  return r;
end $$;

------------------------------------------------------------------------------
-- 4. Reminder job (runs every 10 s via pg_cron)
------------------------------------------------------------------------------
create or replace function public.process_reminders()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- A. "Laundry in N min": reminders before a planned session starts.
  --    If several are due at once (e.g. planned at short notice) only one notification is sent.
  with cand as (
    select s.id,
           array(select o from unnest(s.lead_minutes) o
                 where not (o = any (s.fired_lead_minutes))
                   and s.planned_start - now() <= o * interval '1 minute') as due
    from public.sessions s
    where s.status = 'planned' and s.planned_start > now()
  ), upd as (
    update public.sessions s set fired_lead_minutes = s.fired_lead_minutes || c.due
      from cand c where s.id = c.id and cardinality(c.due) > 0
    returning s.user_id, s.cycle_label, s.planned_start
  )
  insert into public.notifications (user_id, title, body)
  select u.user_id,
         'Laundry in ' || public._fmt_minutes(greatest(1, ceil(extract(epoch from u.planned_start - now()) / 60))::int),
         'Planned ' || coalesce(u.cycle_label, 'laundry') || ' at '
           || to_char(u.planned_start at time zone coalesce(
                (select r.timezone from public.residences r join public.profiles p on p.residence_id = r.id
                  where p.id = u.user_id), 'Europe/Paris'), 'HH24:MI')
           || '. Head to the laundry room.'
  from upd u
  where coalesce((select p.reminders_default from public.profiles p where p.id = u.user_id), true);

  -- B. "Washer 4 ends in N min": the user's chosen reminders before a timer ends
  with cand as (
    select s.id,
           array(select o from unnest(s.remind_minutes) o
                 where not (o = any (s.fired_remind_minutes))
                   and o * 60 < extract(epoch from s.ends_at - s.started_at)
                   and s.ends_at - now() <= o * interval '1 minute') as due
    from public.sessions s
    where s.status = 'active' and s.ends_at > now()
  ), upd as (
    update public.sessions s set fired_remind_minutes = s.fired_remind_minutes || c.due
      from cand c where s.id = c.id and cardinality(c.due) > 0
    returning s.user_id, s.machine_label, s.ends_at
  )
  insert into public.notifications (user_id, title, body)
  select u.user_id,
         u.machine_label || ' ends in ' || public._fmt_minutes(greatest(1, ceil(extract(epoch from u.ends_at - now()) / 60))::int),
         'Head back to the laundry room.'
  from upd u
  where coalesce((select p.reminders_default from public.profiles p where p.id = u.user_id), true);

  -- C. finished
  with due as (
    update public.sessions s set notified_end = true
     where s.status = 'active' and not s.notified_end and s.ends_at <= now()
    returning s.user_id, s.machine_label, s.remind_end
  )
  insert into public.notifications (user_id, title, body)
  select d.user_id, d.machine_label || ' has finished', 'Your clothes are ready to collect.'
  from due d
  where d.remind_end and coalesce((select p.reminders_default from public.profiles p where p.id = d.user_id), true);

  -- D. still not collected 10 minutes later (scaled in demo mode)
  with due as (
    update public.sessions s set notified_collect = true
     where s.status = 'active' and s.notified_end and not s.notified_collect
       and (now() - s.ends_at) * s.time_scale >= interval '10 minutes'
    returning s.user_id, s.machine_label, s.remind_collect
  )
  insert into public.notifications (user_id, title, body)
  select d.user_id, 'Clothes still in ' || d.machine_label, 'Collect them so others can use the machine.'
  from due d
  where d.remind_collect and coalesce((select p.reminders_default from public.profiles p where p.id = d.user_id), true);
end $$;

------------------------------------------------------------------------------
-- 5. Calendar event for a planned session or a running timer
------------------------------------------------------------------------------
-- Runs as the caller, so row-level security makes sure you can only export your own sessions.
create function public.session_calendar_event(p_id uuid)
returns table (title text, description text, location text, starts_at timestamptz, ends_at timestamptz,
               alarm_minutes int[], ics text)
language plpgsql stable set search_path = '' as $$
declare
  s public.sessions;
  v_title text; v_desc text; v_start timestamptz; v_end timestamptz; v_alarms int[];
  v_loc text := (public.current_residence()).name;
  crlf constant text := E'\r\n';
  v_ics text;
  v_fmt constant text := 'YYYYMMDD"T"HH24MISS"Z"';
begin
  select x.* into s from public.sessions x where x.id = p_id;
  if not found then raise exception 'Session not found.'; end if;

  if s.status = 'planned' then
    v_title  := 'Laundry · ' || coalesce(s.cycle_label, 'planned session');
    v_start  := s.planned_start;
    v_end    := v_start + make_interval(mins => s.duration_minutes);
    v_alarms := s.lead_minutes;
    v_desc   := 'Planned in LaundryLink. No machine is reserved - machines are first come, first served.';
  elsif s.status = 'active' then
    v_title  := 'Collect your laundry · ' || coalesce(s.machine_label, 'machine');
    v_start  := s.ends_at;
    v_end    := v_start + interval '15 minutes';
    v_alarms := array(select o from unnest(s.remind_minutes || 0) o order by o desc);
    v_desc   := 'Your ' || coalesce(s.cycle_label, 'cycle') || ' finishes now. Started in LaundryLink.';
  else
    raise exception 'Only planned sessions and running timers can be added to a calendar.';
  end if;

  v_ics :=
    'BEGIN:VCALENDAR' || crlf || 'VERSION:2.0' || crlf || 'PRODID:-//LaundryLink//EN' || crlf ||
    'CALSCALE:GREGORIAN' || crlf || 'METHOD:PUBLISH' || crlf || 'BEGIN:VEVENT' || crlf ||
    'UID:' || s.id || '@laundrylink' || crlf ||
    'DTSTAMP:' || to_char(now() at time zone 'UTC', v_fmt) || crlf ||
    'DTSTART:' || to_char(v_start at time zone 'UTC', v_fmt) || crlf ||
    'DTEND:'   || to_char(v_end at time zone 'UTC', v_fmt) || crlf ||
    'SUMMARY:' || public._ics_escape(v_title) || crlf ||
    'DESCRIPTION:' || public._ics_escape(v_desc) || crlf ||
    'LOCATION:' || public._ics_escape(v_loc) || crlf ||
    coalesce((select string_agg(
        'BEGIN:VALARM' || crlf || 'ACTION:DISPLAY' || crlf ||
        'DESCRIPTION:' || public._ics_escape(v_title) || crlf ||
        'TRIGGER:' || case when o = 0 then 'PT0S' else '-PT' || o || 'M' end || crlf ||
        'END:VALARM' || crlf, '' order by o desc)
      from unnest(v_alarms) o), '') ||
    'END:VEVENT' || crlf || 'END:VCALENDAR' || crlf;

  return query select v_title, v_desc, v_loc, v_start, v_end, v_alarms, v_ics;
end $$;

------------------------------------------------------------------------------
-- 6. Privileges
------------------------------------------------------------------------------
revoke all on function
  public._offsets_ok(int[], int, int), public._clean_offsets(int[], int, int), public._fmt_minutes(int),
  public._ics_escape(text),
  public.plan_session(date, int, public.session_kind, text, int, int[], int[]),
  public.update_planned_session(uuid, date, int, public.session_kind, text, int, int[], int[]),
  public.start_timer(text, text, public.session_kind, int, int, uuid, int[]),
  public.set_session_reminders(uuid, int[], boolean, boolean),
  public.session_calendar_event(uuid),
  public.process_reminders()
  from public, anon, authenticated;

-- pure helpers used by constraints / the calendar export
grant execute on function public._offsets_ok(int[], int, int) to anon, authenticated;
grant execute on function public._ics_escape(text) to authenticated;

grant execute on function
  public.plan_session(date, int, public.session_kind, text, int, int[], int[]),
  public.update_planned_session(uuid, date, int, public.session_kind, text, int, int[], int[]),
  public.start_timer(text, text, public.session_kind, int, int, uuid, int[]),
  public.set_session_reminders(uuid, int[], boolean, boolean),
  public.session_calendar_event(uuid)
  to authenticated;
-- process_reminders() and the other helpers: only the database owner / scheduler can run them.
