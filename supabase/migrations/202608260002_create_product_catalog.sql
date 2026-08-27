create table if not exists public.lego_themes (
  id integer primary key,
  name text not null,
  parent_id integer references public.lego_themes(id) on delete set null
);

create table if not exists public.lego_sets (
  set_num text primary key,
  name text not null,
  year integer not null check (year between 1949 and 2200),
  theme_id integer references public.lego_themes(id) on delete set null,
  num_parts integer not null default 0 check (num_parts >= 0),
  image_url text,
  source_name text not null default 'Rebrickable',
  source_url text not null,
  is_featured boolean not null default false,
  is_visible boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lego_sets is
  'Browsable LEGO catalog metadata. Rebrickable catalog data does not include resale pricing.';

create index if not exists lego_sets_visible_year_idx
  on public.lego_sets (is_visible, year desc);

create index if not exists lego_sets_theme_idx
  on public.lego_sets (theme_id);

create index if not exists lego_sets_featured_idx
  on public.lego_sets (is_featured, display_order, year desc)
  where is_visible = true;

create or replace function public.set_lego_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_lego_set_updated_at() from public, anon, authenticated;

drop trigger if exists lego_sets_updated_at on public.lego_sets;
create trigger lego_sets_updated_at
before update on public.lego_sets
for each row execute function public.set_lego_set_updated_at();

alter table public.lego_themes enable row level security;
alter table public.lego_sets enable row level security;

revoke all on table public.lego_themes from anon, authenticated;
revoke all on table public.lego_sets from anon, authenticated;

grant select on table public.lego_themes to anon, authenticated;
grant select on table public.lego_sets to anon, authenticated;
grant insert, update, delete on table public.lego_sets to authenticated;

drop policy if exists "Catalog themes are publicly readable" on public.lego_themes;
create policy "Catalog themes are publicly readable"
  on public.lego_themes for select
  to anon, authenticated
  using (true);

drop policy if exists "Visible catalog sets are publicly readable" on public.lego_sets;
create policy "Visible catalog sets are publicly readable"
  on public.lego_sets for select
  to anon, authenticated
  using (is_visible);

drop policy if exists "Admins can read hidden catalog sets" on public.lego_sets;
create policy "Admins can read hidden catalog sets"
  on public.lego_sets for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can insert catalog sets" on public.lego_sets;
create policy "Admins can insert catalog sets"
  on public.lego_sets for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update catalog sets" on public.lego_sets;
create policy "Admins can update catalog sets"
  on public.lego_sets for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete catalog sets" on public.lego_sets;
create policy "Admins can delete catalog sets"
  on public.lego_sets for delete
  to authenticated
  using ((select public.is_admin()));

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
    'catalog_products', (select count(*) from public.lego_sets),
    'latest_user_at', (select max(created_at) from auth.users)
  );
end;
$$;

revoke execute on function public.get_admin_overview() from public, anon;
grant execute on function public.get_admin_overview() to authenticated;
