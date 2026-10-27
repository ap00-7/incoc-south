-- INCOC South multi-collection announcement migration.
-- Run this whole script once in Supabase SQL Editor. It checks the known
-- legacy dataset before changing anything and rolls back if it differs.

begin;

lock table public.announcement_collections, public.announcement_items
  in access exclusive mode;

do $preflight$
declare
  church_total integer;
  collection_total integer;
  item_total integer;
  south_item_total integer;
  collection_pk text;
begin
  select count(*) into church_total
  from public.churches
  where id = '3e2726c7-9380-4880-9fea-7d419dca8129'::uuid
    and slug = 'incoc-south'
    and name = 'Indian Church of Christ';

  if church_total <> 1 then
    raise exception 'The INCOC South church record differs from the verified record. No changes were made.';
  end if;

  select pg_get_constraintdef(oid) into collection_pk
  from pg_constraint
  where conrelid = 'public.announcement_collections'::regclass
    and contype = 'p';

  if collection_pk <> 'PRIMARY KEY (church_id)' then
    raise exception 'Expected the legacy announcement_collections primary key on church_id; found %. No changes were made.', collection_pk;
  end if;

  select count(*) into collection_total
  from public.announcement_collections;

  if collection_total <> 0 then
    raise exception 'Expected an empty announcement_collections table based on the reported diagnostics; found % rows. No changes were made.', collection_total
      using hint = 'Stop here and review the existing collections before deciding whether an initial South collection is needed.';
  end if;

  select count(*) into item_total
  from public.announcement_items;

  select count(*) into south_item_total
  from public.announcement_items
  where church_id = '3e2726c7-9380-4880-9fea-7d419dca8129'::uuid;

  if item_total <> 3 or south_item_total <> 3 then
    raise exception 'Expected exactly the three reported INCOC South announcement items; found % total items and % South items. No changes were made.', item_total, south_item_total;
  end if;

  if exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.announcement_collections'::regclass
      and conrelid not in (
        'public.announcement_items'::regclass,
        'public.announcement_collections'::regclass
      )
  ) then
    raise exception 'Another table references announcement_collections. No changes were made; that foreign key needs review before replacing its primary key.';
  end if;
end
$preflight$;

alter table public.announcement_collections
  add column id uuid default gen_random_uuid(),
  add column is_published boolean not null default false;

alter table public.announcement_items
  add column collection_id uuid;

do $create_initial_collection$
declare
  initial_collection_id uuid;
  assigned_item_count integer;
begin
  insert into public.announcement_collections (
    church_id,
    collection_name,
    is_published
  )
  values (
    '3e2726c7-9380-4880-9fea-7d419dca8129'::uuid,
    'Indian Church of Christ',
    true
  )
  returning id into initial_collection_id;

  update public.announcement_items
  set collection_id = initial_collection_id
  where church_id = '3e2726c7-9380-4880-9fea-7d419dca8129'::uuid;

  get diagnostics assigned_item_count = row_count;
  if assigned_item_count <> 3 then
    raise exception 'Expected to assign all three existing announcements; assigned %. The transaction will be rolled back.', assigned_item_count;
  end if;
end
$create_initial_collection$;

alter table public.announcement_items
  alter column collection_id set not null;

-- No foreign keys reference announcement_collections in the reported schema.
-- Preserve its church foreign key and replace only the single-church primary key.
alter table public.announcement_collections
  drop constraint announcement_collections_pkey,
  add constraint announcement_collections_pkey primary key (id),
  add constraint announcement_collections_id_church_id_key unique (id, church_id);

alter table public.announcement_items
  add constraint announcement_items_collection_id_fkey
  foreign key (collection_id, church_id)
  references public.announcement_collections (id, church_id)
  on delete cascade;

-- Titles are optional in the app; allow the existing empty-title item while
-- retaining the 200-character upper limit.
alter table public.announcement_items
  drop constraint announcement_items_title_check,
  add constraint announcement_items_title_check
  check (char_length(btrim(title)) <= 200);

alter table public.announcement_collections enable row level security;
alter table public.announcement_items enable row level security;

grant select on public.announcement_collections, public.announcement_items
  to anon, authenticated;
grant insert, update, delete on public.announcement_collections, public.announcement_items
  to authenticated;

-- The reported database has no policies on these tables. Recreate only the
-- four expected announcement policies. Drop/recreate by name so an existing
-- copy cannot make the transaction fail or leave a stale publication policy.
drop policy if exists "Owners manage announcement collections"
  on public.announcement_collections;
drop policy if exists "Owners manage announcements"
  on public.announcement_items;
drop policy if exists "Public can read INCOC South announcement collection"
  on public.announcement_collections;
drop policy if exists "Public can read INCOC South announcements"
  on public.announcement_items;

create policy "Owners manage announcement collections"
  on public.announcement_collections
  for all to authenticated
  using (public.is_church_owner(church_id))
  with check (public.is_church_owner(church_id));

create policy "Owners manage announcements"
  on public.announcement_items
  for all to authenticated
  using (public.is_church_owner(church_id))
  with check (public.is_church_owner(church_id));

create policy "Public can read INCOC South announcement collection"
  on public.announcement_collections
  for select to anon, authenticated
  using (public.is_public_incoc_south(church_id) and is_published);

create policy "Public can read INCOC South announcements"
  on public.announcement_items
  for select to anon, authenticated
  using (
    public.is_public_incoc_south(church_id)
    and exists (
      select 1
      from public.announcement_collections collection
      where collection.id = announcement_items.collection_id
        and collection.church_id = announcement_items.church_id
        and collection.is_published
    )
  );

-- Emit payload-free notifications so hidden/deleted collections also refresh
-- viewers, while RLS continues to control which data their subsequent query sees.
create or replace function public.announcement_broadcast_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_church_id uuid;
begin
  if tg_op = 'DELETE' then
    target_church_id := old.church_id;
  else
    target_church_id := new.church_id;
  end if;

  perform realtime.send(
    pg_catalog.jsonb_build_object('table', tg_table_name),
    'announcement-change',
    'announcements:' || target_church_id::text,
    false
  );

  if tg_op = 'UPDATE' and old.church_id is distinct from new.church_id then
    perform realtime.send(
      pg_catalog.jsonb_build_object('table', tg_table_name),
      'announcement-change',
      'announcements:' || old.church_id::text,
      false
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.announcement_broadcast_change_v1()
  from public, anon, authenticated;

drop trigger if exists announcement_collections_realtime_broadcast_v1
  on public.announcement_collections;
create trigger announcement_collections_realtime_broadcast_v1
  after insert or update or delete on public.announcement_collections
  for each row execute function public.announcement_broadcast_change_v1();

drop trigger if exists announcement_items_realtime_broadcast_v1
  on public.announcement_items;
create trigger announcement_items_realtime_broadcast_v1
  after insert or update or delete on public.announcement_items
  for each row execute function public.announcement_broadcast_change_v1();

do $realtime_publication$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'The supabase_realtime publication is unavailable. The transaction will be rolled back.';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcement_collections'
  ) then
    execute 'alter publication supabase_realtime add table public.announcement_collections';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcement_items'
  ) then
    execute 'alter publication supabase_realtime add table public.announcement_items';
  end if;
end
$realtime_publication$;

commit;
