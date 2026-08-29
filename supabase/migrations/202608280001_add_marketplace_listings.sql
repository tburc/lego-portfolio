create table if not exists public.marketplace_listings (
  marketplace text not null check (marketplace in ('ebay', 'bricklink', 'brickowl')),
  external_listing_id text not null,
  set_num text not null references public.lego_sets(set_num) on delete cascade,
  title text not null,
  item_condition text not null check (item_condition in ('new', 'used', 'other')),
  item_price numeric(12, 2) not null check (item_price >= 0),
  shipping_price numeric(12, 2) check (shipping_price >= 0),
  total_price numeric(12, 2) check (total_price >= 0),
  currency_code text not null check (char_length(currency_code) = 3),
  listing_url text not null,
  image_url text,
  seller_username text,
  seller_feedback_percentage numeric(5, 2),
  buying_options text[] not null default '{}',
  item_location_country text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  item_end_at timestamptz,
  primary key (marketplace, external_listing_id)
);

comment on table public.marketplace_listings is
  'Cached active marketplace offers matched to LEGO catalog set numbers.';

create index if not exists marketplace_listings_set_active_idx
  on public.marketplace_listings (set_num, marketplace, is_active, total_price, item_price);

create index if not exists marketplace_listings_last_seen_idx
  on public.marketplace_listings (marketplace, last_seen_at desc);

create table if not exists public.marketplace_price_snapshots (
  id bigint generated always as identity primary key,
  marketplace text not null check (marketplace in ('ebay', 'bricklink', 'brickowl')),
  set_num text not null references public.lego_sets(set_num) on delete cascade,
  item_condition text not null check (item_condition in ('new', 'used', 'other')),
  currency_code text not null check (char_length(currency_code) = 3),
  lowest_item_price numeric(12, 2) not null check (lowest_item_price >= 0),
  lowest_total_price numeric(12, 2) check (lowest_total_price >= 0),
  average_item_price numeric(12, 2) not null check (average_item_price >= 0),
  listing_count integer not null check (listing_count > 0),
  recorded_at timestamptz not null default now()
);

comment on table public.marketplace_price_snapshots is
  'Historical marketplace price aggregates used for product price charts.';

create index if not exists marketplace_price_snapshots_set_time_idx
  on public.marketplace_price_snapshots (set_num, marketplace, recorded_at desc);

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_price_snapshots enable row level security;

revoke all on table public.marketplace_listings from anon, authenticated;
revoke all on table public.marketplace_price_snapshots from anon, authenticated;

grant select on table public.marketplace_listings to anon, authenticated;
grant select on table public.marketplace_price_snapshots to anon, authenticated;

drop policy if exists "Active marketplace listings are publicly readable"
  on public.marketplace_listings;
create policy "Active marketplace listings are publicly readable"
  on public.marketplace_listings for select
  to anon, authenticated
  using (is_active);

drop policy if exists "Marketplace price history is publicly readable"
  on public.marketplace_price_snapshots;
create policy "Marketplace price history is publicly readable"
  on public.marketplace_price_snapshots for select
  to anon, authenticated
  using (true);
