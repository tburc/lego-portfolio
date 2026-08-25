create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_number text not null,
  name text not null,
  item_type text not null check (item_type in ('set', 'minifigure')),
  estimated_value numeric(12, 2) not null default 0 check (estimated_value >= 0),
  image_url text,
  year integer,
  pieces integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collection_items_user_created_idx
  on public.collection_items (user_id, created_at desc);

alter table public.collection_items enable row level security;

drop policy if exists "Users can read their collection" on public.collection_items;
create policy "Users can read their collection"
  on public.collection_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add to their collection" on public.collection_items;
create policy "Users can add to their collection"
  on public.collection_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their collection" on public.collection_items;
create policy "Users can update their collection"
  on public.collection_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete from their collection" on public.collection_items;
create policy "Users can delete from their collection"
  on public.collection_items for delete
  using (auth.uid() = user_id);

create or replace function public.set_collection_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists collection_items_updated_at on public.collection_items;
create trigger collection_items_updated_at
before update on public.collection_items
for each row execute function public.set_collection_item_updated_at();
