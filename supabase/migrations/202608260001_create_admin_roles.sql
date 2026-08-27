create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

comment on table public.user_roles is
  'Server-controlled application roles. Users cannot assign or edit their own role.';

alter table public.user_roles enable row level security;

revoke all on table public.user_roles from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.get_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'total_collection_items', (select count(*) from public.collection_items),
    'active_collectors', (
      select count(distinct user_id)
      from public.collection_items
    ),
    'total_collection_value', (
      select coalesce(sum(estimated_value), 0)
      from public.collection_items
    ),
    'latest_user_at', (select max(created_at) from auth.users)
  );
end;
$$;

revoke execute on function public.get_admin_overview() from public, anon;
grant execute on function public.get_admin_overview() to authenticated;

-- After applying this migration, promote one existing Auth account separately:
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where lower(email) = lower('you@example.com')
-- on conflict (user_id) do update set role = excluded.role;
