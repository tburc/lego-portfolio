drop policy if exists "Users can add to their collection"
  on public.collection_items;

revoke insert on table public.collection_items from anon, authenticated;

comment on table public.collection_items is
  'User collection records. Manual client-side inserts are disabled until ownership verification is implemented.';
