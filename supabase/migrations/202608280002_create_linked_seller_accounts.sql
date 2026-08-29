create table if not exists public.linked_marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace text not null check (marketplace in ('ebay', 'bricklink', 'brickowl')),
  external_username text,
  external_store_name text,
  external_store_url text,
  currency_code text not null default 'USD' check (char_length(currency_code) = 3),
  status text not null default 'connected' check (status in ('connected', 'error')),
  share_listings_publicly boolean not null default true,
  inventory_count integer not null default 0 check (inventory_count >= 0),
  matched_set_count integer not null default 0 check (matched_set_count >= 0),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, marketplace)
);

create table if not exists public.linked_marketplace_credentials (
  account_id uuid primary key references public.linked_marketplace_accounts(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  encryption_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_listings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.linked_marketplace_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace text not null check (marketplace in ('ebay', 'bricklink', 'brickowl')),
  external_listing_id text not null,
  external_item_id text,
  set_num text references public.lego_sets(set_num) on delete set null,
  title text not null,
  item_type text not null default 'other' check (item_type in ('set', 'minifigure', 'part', 'gear', 'other')),
  item_condition text not null default 'other' check (item_condition in ('new', 'used', 'other')),
  quantity integer not null default 1 check (quantity >= 0),
  unit_price numeric(12, 2) check (unit_price is null or unit_price >= 0),
  currency_code text check (currency_code is null or char_length(currency_code) = 3),
  listing_url text,
  image_url text,
  is_active boolean not null default true,
  public_reference jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (account_id, external_listing_id)
);

alter table public.marketplace_listings
  add column if not exists linked_account_id uuid
  references public.linked_marketplace_accounts(id) on delete cascade;

create index if not exists linked_marketplace_accounts_user_idx
  on public.linked_marketplace_accounts(user_id);

create index if not exists seller_listings_user_active_idx
  on public.seller_listings(user_id, is_active);

create index if not exists seller_listings_set_active_idx
  on public.seller_listings(set_num, is_active)
  where set_num is not null;

create index if not exists marketplace_listings_linked_account_idx
  on public.marketplace_listings(linked_account_id)
  where linked_account_id is not null;

alter table public.linked_marketplace_accounts enable row level security;
alter table public.linked_marketplace_credentials enable row level security;
alter table public.seller_listings enable row level security;

drop policy if exists "Users can read their linked marketplace accounts"
  on public.linked_marketplace_accounts;
create policy "Users can read their linked marketplace accounts"
  on public.linked_marketplace_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their seller listings"
  on public.seller_listings;
create policy "Users can read their seller listings"
  on public.seller_listings
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Credentials intentionally have no client-access policy. Only Edge Functions using
-- the service-role key can read or write the encrypted API-key rows.
revoke all on table public.linked_marketplace_credentials from anon, authenticated;
grant select on table public.linked_marketplace_accounts to authenticated;
grant select on table public.seller_listings to authenticated;

create or replace function public.touch_linked_marketplace_account_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists linked_marketplace_accounts_touch_updated_at
  on public.linked_marketplace_accounts;
create trigger linked_marketplace_accounts_touch_updated_at
before update on public.linked_marketplace_accounts
for each row execute function public.touch_linked_marketplace_account_updated_at();
