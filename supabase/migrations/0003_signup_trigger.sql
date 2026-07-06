-- Chekkam: auto-create a profiles row for every new auth.users row.
-- Fixes the gap flagged in README.md ("add a trigger for this in production").
-- Needed for the new self-serve /signup flow and for admin-created users alike.
-- Additive only: does not touch RLS, PostGIS, or any existing table/policy.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, new.raw_user_meta_data->>'display_name', 'citizen')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
