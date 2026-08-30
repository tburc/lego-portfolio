alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is
  'Version of the Terms and Privacy notice the user affirmatively accepted.';

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_version text := new.raw_user_meta_data ->> 'terms_version';
begin
  if accepted_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then accepted_version := null; end if;

  insert into public.profiles (id, username, terms_version, terms_accepted_at)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'collector'
    ),
    accepted_version,
    case when accepted_version is not null then now() else null end
  )
  on conflict (id) do update
  set username = excluded.username,
      terms_version = coalesce(public.profiles.terms_version, excluded.terms_version),
      terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
      updated_at = now();

  return new;
end;
$$;

revoke execute on function public.sync_auth_user_profile() from public, anon, authenticated;

create or replace function public.accept_current_terms(accepted_version text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if accepted_version is null or accepted_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid terms version';
  end if;

  update public.profiles
  set terms_version = accepted_version,
      terms_accepted_at = now()
  where id = auth.uid();

  if not found then raise exception 'Profile not found'; end if;
end;
$$;

revoke execute on function public.accept_current_terms(text) from public, anon;
grant execute on function public.accept_current_terms(text) to authenticated;
