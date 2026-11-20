-- LaundryLink initial schema
create extension if not exists btree_gist;

-- Enums
create type public.user_role      as enum ('resident', 'admin');
create type public.machine_type   as enum ('washer', 'dryer');
create type public.machine_status as enum ('active', 'out_of_service');
create type public.booking_status as enum ('confirmed', 'cancelled');

-- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  unit         text,
  role         public.user_role not null default 'resident',
  created_at   timestamptz not null default now()
);

-- locations
create table public.locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text,
  open_time    time not null default '08:00',
  close_time   time not null default '22:00',
  slot_minutes int  not null default 120 check (slot_minutes > 0),
  created_at   timestamptz not null default now()
);

-- machines
create table public.machines (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name        text not null,
  type        public.machine_type not null,
  status      public.machine_status not null default 'active',
  created_at  timestamptz not null default now()
);
create index machines_location_idx on public.machines (location_id);

-- bookings
create table public.bookings (
  id         uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     public.booking_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- no overlapping confirmed bookings on the same machine
  constraint bookings_no_overlap exclude using gist (
    machine_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'confirmed')
);
create index bookings_user_idx on public.bookings (user_id);

-- Helpers
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Public-safe view: who booked what, without exposing other profile data
create view public.booking_slots with (security_invoker = false) as
  select b.id, b.machine_id, b.user_id, b.starts_at, b.ends_at, b.status, p.display_name
  from public.bookings b
  join public.profiles p on p.id = b.user_id
  where b.status = 'confirmed';
grant select on public.booking_slots to authenticated;

-- Row level security
alter table public.profiles  enable row level security;
alter table public.locations enable row level security;
alter table public.machines  enable row level security;
alter table public.bookings  enable row level security;

-- profiles: read/update own; admins read all. Role changes are admin-only.
create policy "profiles read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "profiles admin update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- locations / machines: everyone signed in reads, admins write
create policy "locations read" on public.locations for select to authenticated using (true);
create policy "locations admin write" on public.locations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "machines read" on public.machines for select to authenticated using (true);
create policy "machines admin write" on public.machines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- bookings: own rows (admins: all); insert only as yourself on active machines
create policy "bookings read own or admin" on public.bookings
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "bookings insert own" on public.bookings
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.machines m where m.id = machine_id and m.status = 'active')
  );
create policy "bookings update own or admin" on public.bookings
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
