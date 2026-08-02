-- club2k / project_foobar — Supabase schema
--
-- RECONSTRUCTED from application code (server/db.ts, server/storeCache.ts,
-- lib/storage.ts, app/api/**). Nothing was previously checked in, so verify
-- against the live project with `npx supabase db pull` before trusting it as
-- the source of truth.
--
-- Safe to run top-to-bottom on a fresh project. Idempotent where practical.
--
-- Access model: the game server and all Next.js API routes use the SERVICE ROLE
-- key (server/db.ts), which bypasses RLS entirely. The browser only ever reads
-- `profiles` directly (username lookup / uniqueness check) via the anon key.
-- So RLS is enabled everywhere and policies are granted only for that one read
-- path plus the public store catalogue.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- One row per auth user. Created by the on_auth_user_created trigger below;
-- server/db.ts upsertProfile() also insert-ignores on every join as a backstop.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text unique,
  xp         integer not null default 0,
  currency   integer not null default 0,
  level      integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- The sign-up screen checks username availability with the anon key BEFORE a
-- session exists (components/AuthScreen.tsx), so this read must be public.
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies: all writes go through the service role.

-- Populate profiles from the username passed in signUp() user metadata
-- (options.data.username in components/AuthScreen.tsx).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, nullif(new.raw_user_meta_data ->> 'username', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- homes
-- ---------------------------------------------------------------------------
-- One persisted home room per user. `map_json` is a MapConfig (server/types.ts),
-- including its placedObjects array and logic graph.
--
-- `placed_objects` is LEGACY: server/db.ts loadHomeData() folds it into
-- map_json.placedObjects on read and rewrites the row. Kept so existing rows
-- still migrate; drop it once every row has been read at least once.
create table if not exists public.homes (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  map_json       jsonb not null,
  placed_objects jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.homes enable row level security;
-- Intentionally no policies — service-role access only.

-- ---------------------------------------------------------------------------
-- store_items
-- ---------------------------------------------------------------------------
-- Catalogue of purchasable GLB models. Rows are created by the admin panel
-- (app/api/admin/store/route.ts), which generates the uuid itself and uploads
-- the model/thumbnail to the `store-assets` bucket first.
create table if not exists public.store_items (
  id            uuid primary key,
  name          text not null,
  model_url     text not null,
  price         integer not null default 0,
  thumbnail_url text,
  category      text not null default 'furniture',
  created_at    timestamptz not null default now()
);

-- loadAllStoreItems() / initStoreCache() order by created_at.
create index if not exists store_items_created_at_idx
  on public.store_items (created_at);

alter table public.store_items enable row level security;

-- The catalogue is public information (name, price, model URL); reads currently
-- go through service-role API routes, but this keeps a direct client read safe.
drop policy if exists "store items are publicly readable" on public.store_items;
create policy "store items are publicly readable"
  on public.store_items for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- inventory
-- ---------------------------------------------------------------------------
-- Which users own which store items. Composite PK enforces "own at most once",
-- which spend_currency() relies on.
create table if not exists public.inventory (
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     uuid not null references public.store_items (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists inventory_user_id_idx on public.inventory (user_id);

alter table public.inventory enable row level security;
-- Intentionally no policies — service-role access only.

-- ---------------------------------------------------------------------------
-- RPC: add_xp_and_currency
-- ---------------------------------------------------------------------------
-- Called from server/db.ts addXpAndCurrency() on every XP flush (~5s per
-- player). Increments both counters atomically and recomputes level.
--
-- LEVEL FORMULA must stay in sync with computeLevel() in server/xp.ts:
--   floor(sqrt(xp / 250)) + 1
create or replace function public.add_xp_and_currency(
  p_user_id  uuid,
  p_xp       integer,
  p_currency integer
)
returns table (out_xp integer, out_currency integer, out_level integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.profiles p
     set xp       = p.xp + p_xp,
         currency = p.currency + p_currency,
         level    = floor(sqrt((p.xp + p_xp)::numeric / 250))::integer + 1
   where p.id = p_user_id
  returning p.xp, p.currency, p.level;

  if not found then
    raise exception 'profile_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: spend_currency
-- ---------------------------------------------------------------------------
-- Called from server/db.ts spendCurrency() via POST /api/store/buy.
-- Atomic: locks the profile row, checks balance, deducts, grants the item.
-- Returns the new balance.
--
-- Error contract consumed by app/api/store/buy/route.ts:
--   'insufficient_funds'  -> 402
--   'profile_not_found'   -> 404
-- Re-buying an already-owned item is a no-op that returns the current balance
-- (rather than a new error code the route would surface as a 500).
create or replace function public.spend_currency(
  p_user_id uuid,
  p_item_id uuid,
  p_price   integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_owned   boolean;
begin
  select currency into v_balance
    from public.profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  select exists (
    select 1 from public.inventory
     where user_id = p_user_id and item_id = p_item_id
  ) into v_owned;

  if v_owned then
    return v_balance;
  end if;

  if v_balance < p_price then
    raise exception 'insufficient_funds';
  end if;

  update public.profiles
     set currency = currency - p_price
   where id = p_user_id
  returning currency into v_balance;

  insert into public.inventory (user_id, item_id)
  values (p_user_id, p_item_id)
  on conflict do nothing;

  return v_balance;
end;
$$;

-- Both RPCs are only ever called with the service-role key. Revoke the default
-- EXECUTE grant so a leaked anon key can't mint currency or free items.
revoke execute on function public.add_xp_and_currency(uuid, integer, integer) from anon, authenticated;
revoke execute on function public.spend_currency(uuid, uuid, integer)        from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: store-assets bucket
-- ---------------------------------------------------------------------------
-- lib/storage.ts uploads to models/<id>.glb and thumbnails/<id>.<ext>, then
-- hands out getPublicUrl() links — so the bucket must be public. Uploads and
-- deletes happen with the service-role key from app/api/admin/store/route.ts.
insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "store assets are publicly readable" on storage.objects;
create policy "store assets are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'store-assets');
