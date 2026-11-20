-- Fix: the "profiles update" policy queried `profiles` from inside its own check, which
-- Postgres rejects ("infinite recursion detected in policy for relation profiles").
-- The policy is now simple, and a trigger stops anyone but admins from changing a role.

drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id then
    raise exception 'A profile id cannot be changed.';
  end if;
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change roles.';
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

revoke all on function public.protect_profile_columns() from public, anon, authenticated;
