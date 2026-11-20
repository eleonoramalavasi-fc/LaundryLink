-- RLS + security cleanup (follows the Supabase advisor report)
--  * drop the unused btree_gist extension (left over from the old bookings table)
--  * lock down who can call the helper functions through the API
--  * rewrite every policy: auth.uid() wrapped in a subquery (evaluated once per query,
--    not once per row) and no overlapping permissive policies on the same action

drop extension if exists btree_gist;

-- Function privileges ---------------------------------------------------------
-- handle_new_user() is only a trigger function; nobody should call it via the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
-- is_admin() is used inside policies, so signed-in users need it; anonymous users do not.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- profiles --------------------------------------------------------------------
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles update own"        on public.profiles;
drop policy if exists "profiles admin update"      on public.profiles;

create policy "profiles select" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- One update policy: you can edit your own row (but never change your own role);
-- admins can edit anyone.
create policy "profiles update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (
    public.is_admin()
    or (
      id = (select auth.uid())
      and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
    )
  );
-- No insert policy: profiles are created by the on_auth_user_created trigger.
-- No delete policy: profiles are removed when the auth user is deleted (cascade).

create index if not exists profiles_residence_idx on public.profiles (residence_id);

-- residences (public read, admin write) ----------------------------------------
drop policy if exists "residences read"  on public.residences;
drop policy if exists "residences admin" on public.residences;

create policy "residences select" on public.residences
  for select to anon, authenticated using (true);
create policy "residences insert" on public.residences
  for insert to authenticated with check (public.is_admin());
create policy "residences update" on public.residences
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "residences delete" on public.residences
  for delete to authenticated using (public.is_admin());

-- usage_estimates (public read, admin write) -----------------------------------
drop policy if exists "estimates read"  on public.usage_estimates;
drop policy if exists "estimates admin" on public.usage_estimates;

create policy "estimates select" on public.usage_estimates
  for select to anon, authenticated using (true);
create policy "estimates insert" on public.usage_estimates
  for insert to authenticated with check (public.is_admin());
create policy "estimates update" on public.usage_estimates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "estimates delete" on public.usage_estimates
  for delete to authenticated using (public.is_admin());

-- sessions (private to the owner) -----------------------------------------------
drop policy if exists "sessions own" on public.sessions;
create policy "sessions own" on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- notifications (private to the owner) --------------------------------------------
drop policy if exists "notifications own" on public.notifications;
create policy "notifications own" on public.notifications
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
