alter table public.collection_items
  add column if not exists purchase_price numeric(12, 2) check (purchase_price >= 0);

update public.collection_items
set purchase_price = estimated_value
where purchase_price is null;

alter table public.collection_items
  alter column purchase_price set default 0,
  alter column purchase_price set not null;

create table if not exists public.collection_value_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_value numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  recorded_at timestamptz not null default now()
);

create index if not exists collection_value_history_user_time_idx
  on public.collection_value_history (user_id, recorded_at);

alter table public.collection_value_history enable row level security;

drop policy if exists "Users can read their value history" on public.collection_value_history;
create policy "Users can read their value history"
  on public.collection_value_history for select
  using (auth.uid() = user_id);

create or replace function public.record_collection_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if tg_op = 'DELETE' then
    owner_id := old.user_id;
  else
    owner_id := new.user_id;
  end if;

  insert into public.collection_value_history (user_id, total_value, total_cost)
  select owner_id,
    coalesce(sum(estimated_value), 0),
    coalesce(sum(purchase_price), 0)
  from public.collection_items
  where user_id = owner_id;

  return null;
end;
$$;

drop trigger if exists record_collection_value_change on public.collection_items;
create trigger record_collection_value_change
after insert or update of estimated_value, purchase_price or delete
on public.collection_items
for each row execute function public.record_collection_value();

insert into public.collection_value_history (user_id, total_value, total_cost)
select user_id, sum(estimated_value), sum(purchase_price)
from public.collection_items
group by user_id;
