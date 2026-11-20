-- Rework for the LaundryLink design: crowd forecast + planned sessions + cycle timers.
-- (LaundryLink never reserves a machine, so the earlier machine-booking tables are removed.)

drop view  if exists public.booking_slots;
drop table if exists public.bookings;
drop table if exists public.machines;
drop table if exists public.locations;
drop type  if exists public.booking_status;
drop type  if exists public.machine_status;
drop type  if exists public.machine_type;

create type public.session_kind   as enum ('wash', 'dry', 'both');
create type public.session_status as enum ('planned', 'active', 'collected');

-- residences: the places a user can pick (washer/dryer counts + typical usage)
create table public.residences (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  washer_count   int  not null check (washer_count > 0),
  dryer_count    int  not null default 0 check (dryer_count >= 0),
  typical_in_use int  not null default 0 check (typical_in_use >= 0),
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now()
);

-- usage_estimates: expected crowd (0-1) per weekday (0 = Monday) and hour
create table public.usage_estimates (
  weekday     smallint not null check (weekday between 0 and 6),
  hour_of_day smallint not null check (hour_of_day between 0 and 23),
  crowd       numeric(4,3) not null check (crowd between 0 and 1.5),
  primary key (weekday, hour_of_day)
);

-- profiles: swap the unused "unit" column for the design's settings
alter table public.profiles drop column if exists unit;
alter table public.profiles
  add column residence_id      uuid references public.residences (id) on delete set null,
  add column reminders_default boolean not null default true,
  add column default_kind      public.session_kind not null default 'wash';

-- sessions: planned sessions, running timers and collected history in one table
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  status           public.session_status not null,
  kind             public.session_kind not null default 'wash',
  machine_label    text,
  cycle_label      text,
  planned_start    timestamptz,
  duration_minutes int not null check (duration_minutes > 0),
  started_at       timestamptz,
  ends_at          timestamptz,
  collected_at     timestamptz,
  remind_5         boolean not null default true,
  remind_end       boolean not null default true,
  remind_collect   boolean not null default true,
  notified_5       boolean not null default false,
  notified_end     boolean not null default false,
  notified_collect boolean not null default false,
  created_at       timestamptz not null default now()
);
create index sessions_user_status_idx on public.sessions (user_id, status);

-- notifications: in-app notification feed
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Row level security
alter table public.residences       enable row level security;
alter table public.usage_estimates  enable row level security;
alter table public.sessions         enable row level security;
alter table public.notifications    enable row level security;

create policy "residences read"  on public.residences      for select to anon, authenticated using (true);
create policy "estimates read"   on public.usage_estimates for select to anon, authenticated using (true);
create policy "residences admin" on public.residences
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "estimates admin"  on public.usage_estimates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "sessions own" on public.sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications own" on public.notifications
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Seed data
insert into public.residences (name, washer_count, dryer_count, typical_in_use, sort_order) values
  ('CIUP Residence, Paris', 12, 0, 7, 0),
  ('Collège d''Espagne', 6, 0, 2, 1),
  ('Collège franco-britannique', 12, 0, 7, 2),
  ('Collège néerlandais', 9, 0, 7, 3),
  ('Fondation Abreu de Grancher', 8, 0, 4, 4),
  ('Fondation Avicenne (Maison de l''Iran)', 14, 0, 9, 5),
  ('Fondation Biermans-Lapôtre', 11, 0, 4, 6),
  ('Fondation danoise', 10, 0, 6, 7),
  ('Fondation des États-Unis', 16, 0, 12, 8),
  ('Fondation Deutsch de la Meurthe', 6, 0, 3, 9),
  ('Fondation hellénique', 12, 0, 8, 10),
  ('Fondation suisse', 9, 0, 3, 11),
  ('Fondation Victor Lyon', 8, 0, 4, 12),
  ('Maison de Cuba', 14, 0, 11, 13),
  ('Maison de l''Afrique (Fondation Lucien Paye)', 11, 0, 5, 14),
  ('Maison de l''Argentine', 10, 0, 7, 15),
  ('Maison de l''Asie du Sud-Est', 16, 0, 6, 16),
  ('Maison de l''Inde', 6, 0, 3, 17),
  ('Maison de la Tunisie', 12, 0, 9, 18),
  ('Maison de Norvège', 9, 0, 4, 19),
  ('Maison des étudiants arméniens', 8, 0, 5, 20),
  ('Maison des étudiants asiatiques (Fondation Teilhard de Chardin)', 14, 0, 5, 21),
  ('Maison des étudiants canadiens', 11, 0, 6, 22),
  ('Maison des étudiants suédois', 10, 0, 8, 23),
  ('Maison des industries agricoles et alimentaires', 16, 0, 7, 24),
  ('Maison des Provinces de France', 6, 0, 4, 25),
  ('Maison du Brésil', 12, 0, 4, 26),
  ('Maison du Japon', 9, 0, 5, 27),
  ('Maison du Liban', 8, 0, 6, 28),
  ('Maison du Maroc', 14, 0, 6, 29),
  ('Maison du Mexique', 11, 0, 7, 30),
  ('Maison Heinrich Heine', 10, 0, 4, 31),
  ('Maison internationale', 16, 0, 9, 32),
  ('Résidence André Honnorat', 2, 2, 1, 33),
  ('Résidence André-de-Gouveia', 6, 0, 5, 34),
  ('Résidence Julie-Victoire Daubié', 2, 2, 1, 35),
  ('Résidence Lucien Paye', 12, 0, 5, 36);

insert into public.usage_estimates (weekday, hour_of_day, crowd) values
(0, 7, 0.050),
(0, 8, 0.050),
(0, 9, 0.052),
(0, 10, 0.064),
(0, 11, 0.105),
(0, 12, 0.240),
(0, 13, 0.241),
(0, 14, 0.190),
(0, 15, 0.163),
(0, 16, 0.193),
(0, 17, 0.276),
(0, 18, 0.403),
(0, 19, 0.527),
(0, 20, 0.580),
(0, 21, 0.527),
(0, 22, 0.403),
(0, 23, 0.276),
(1, 7, 0.210),
(1, 8, 0.210),
(1, 9, 0.212),
(1, 10, 0.224),
(1, 11, 0.265),
(1, 12, 0.320),
(1, 13, 0.321),
(1, 14, 0.270),
(1, 15, 0.243),
(1, 16, 0.273),
(1, 17, 0.356),
(1, 18, 0.483),
(1, 19, 0.607),
(1, 20, 0.660),
(1, 21, 0.607),
(1, 22, 0.483),
(1, 23, 0.356),
(2, 7, 0.180),
(2, 8, 0.180),
(2, 9, 0.182),
(2, 10, 0.194),
(2, 11, 0.235),
(2, 12, 0.290),
(2, 13, 0.291),
(2, 14, 0.241),
(2, 15, 0.219),
(2, 16, 0.259),
(2, 17, 0.365),
(2, 18, 0.526),
(2, 19, 0.683),
(2, 20, 0.750),
(2, 21, 0.683),
(2, 22, 0.526),
(2, 23, 0.365),
(3, 7, 0.180),
(3, 8, 0.180),
(3, 9, 0.182),
(3, 10, 0.194),
(3, 11, 0.235),
(3, 12, 0.290),
(3, 13, 0.291),
(3, 14, 0.240),
(3, 15, 0.216),
(3, 16, 0.249),
(3, 17, 0.342),
(3, 18, 0.483),
(3, 19, 0.621),
(3, 20, 0.680),
(3, 21, 0.621),
(3, 22, 0.483),
(3, 23, 0.342),
(4, 7, 0.150),
(4, 8, 0.150),
(4, 9, 0.152),
(4, 10, 0.164),
(4, 11, 0.205),
(4, 12, 0.260),
(4, 13, 0.261),
(4, 14, 0.210),
(4, 15, 0.183),
(4, 16, 0.213),
(4, 17, 0.296),
(4, 18, 0.423),
(4, 19, 0.547),
(4, 20, 0.600),
(4, 21, 0.547),
(4, 22, 0.423),
(4, 23, 0.296),
(5, 7, 0.224),
(5, 8, 0.233),
(5, 9, 0.255),
(5, 10, 0.299),
(5, 11, 0.373),
(5, 12, 0.477),
(5, 13, 0.592),
(5, 14, 0.685),
(5, 15, 0.724),
(5, 16, 0.701),
(5, 17, 0.642),
(5, 18, 0.585),
(5, 19, 0.545),
(5, 20, 0.499),
(5, 21, 0.426),
(5, 22, 0.341),
(5, 23, 0.274),
(6, 7, 0.230),
(6, 8, 0.246),
(6, 9, 0.282),
(6, 10, 0.349),
(6, 11, 0.455),
(6, 12, 0.598),
(6, 13, 0.752),
(6, 14, 0.874),
(6, 15, 0.924),
(6, 16, 0.890),
(6, 17, 0.802),
(6, 18, 0.706),
(6, 19, 0.627),
(6, 20, 0.549),
(6, 21, 0.453),
(6, 22, 0.354),
(6, 23, 0.280);
