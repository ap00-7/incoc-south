begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-rls-test@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Test Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'viewer-rls-test@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Test Viewer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'other-owner-rls-test@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Other Church Owner"}', now(), now());

insert into public.churches (id, name, slug)
values ('50000000-0000-0000-0000-000000000001', 'RLS isolation test', 'rls-test-tenant');

insert into public.church_members (church_id, user_id, role)
select id, '10000000-0000-0000-0000-000000000001', 'owner'::public.member_role
from public.churches where slug = 'incoc-south';
insert into public.church_members (church_id, user_id, role)
select id, '10000000-0000-0000-0000-000000000002', 'viewer'::public.member_role
from public.churches where slug = 'incoc-south';
insert into public.church_members (church_id, user_id, role)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'owner');

insert into public.songs (id, church_id, title, language, created_by)
select '20000000-0000-0000-0000-000000000001', id, 'Visible song', 'English', '10000000-0000-0000-0000-000000000001'
from public.churches where slug = 'incoc-south';
insert into public.songs (id, church_id, title, language, created_by)
select '20000000-0000-0000-0000-000000000002', id, 'Other tenant song', 'English', '10000000-0000-0000-0000-000000000003'
from public.churches where slug = 'rls-test-tenant';

insert into public.schedules (id, church_id, title, service_date, status, created_by)
select '30000000-0000-0000-0000-000000000001', id, 'Published test service', current_date, 'published', '10000000-0000-0000-0000-000000000001'
from public.churches where slug = 'incoc-south';
insert into public.schedules (id, church_id, title, service_date, status, created_by)
select '30000000-0000-0000-0000-000000000002', id, 'Private draft service', current_date, 'draft', '10000000-0000-0000-0000-000000000001'
from public.churches where slug = 'incoc-south';
insert into public.schedules (id, church_id, title, service_date, status, created_by)
select '30000000-0000-0000-0000-000000000003', id, 'Other church service', current_date, 'published', '10000000-0000-0000-0000-000000000003'
from public.churches where slug = 'rls-test-tenant';

insert into public.schedule_items (id, schedule_id, church_id, item_type, title, position, song_id)
select '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', id, 'song', 'Visible song', 0, '20000000-0000-0000-0000-000000000001'
from public.churches where slug = 'incoc-south';
insert into public.schedule_item_notes (schedule_item_id, notes)
values ('40000000-0000-0000-0000-000000000001', 'Confidential owner note');
insert into public.presentation_sessions (schedule_id, current_item_id, updated_by)
values ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.songs), 1::bigint, 'viewer reads only songs from their church');
select is((select count(*) from public.schedules where status = 'published'), 1::bigint, 'viewer reads only published schedules from their church');
select is((select count(*) from public.schedules where status = 'draft'), 0::bigint, 'viewer cannot read draft schedules');
select is((select count(*) from public.schedule_item_notes), 0::bigint, 'viewer cannot read owner-only service notes');
select is((select count(*) from public.church_members where user_id = '10000000-0000-0000-0000-000000000003'), 0::bigint, 'viewer cannot read another church membership');
select throws_ok(
  $$insert into public.songs (church_id, title, language, created_by)
    select id, 'Unauthorized song', 'English', '10000000-0000-0000-0000-000000000002'
    from public.churches where slug = 'incoc-south'$$,
  '42501',
  'viewer cannot create songs'
);
select throws_ok(
  $$insert into public.church_members (church_id, user_id, role)
    select id, '10000000-0000-0000-0000-000000000002', 'owner'
    from public.churches where slug = 'incoc-south'$$,
  '42501',
  'viewer cannot create or elevate memberships'
);
with changed as (
  update public.church_members set role = 'owner'
  where user_id = '10000000-0000-0000-0000-000000000002'
  returning id
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot promote their own membership');
with changed as (
  update public.presentation_sessions set is_active = true
  where schedule_id = '30000000-0000-0000-0000-000000000001'
  returning id
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot control synchronized presentation');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.schedules where status = 'draft'), 1::bigint, 'owner can read draft schedules');
select is((select count(*) from public.schedule_item_notes), 1::bigint, 'owner can read private service notes');
with changed as (
  update public.church_members set role = 'viewer'
  where user_id = '10000000-0000-0000-0000-000000000001'
  returning id
)
select is((select count(*) from changed), 0::bigint, 'owner cannot change their own membership');
with changed as (
  update public.church_members set role = 'owner'
  where user_id = '10000000-0000-0000-0000-000000000002'
  returning id
)
select is((select count(*) from changed), 1::bigint, 'owner can update another member role');
insert into public.church_members (church_id, user_id, role)
select id, '10000000-0000-0000-0000-000000000003', 'viewer'
from public.churches where slug = 'incoc-south';
select is((select count(*) from public.church_members where user_id = '10000000-0000-0000-0000-000000000003'), 2::bigint, 'owner can add an existing Auth user to their church');
delete from public.church_members
where church_id = (select id from public.churches where slug = 'incoc-south')
  and user_id = '10000000-0000-0000-0000-000000000003';
select is((select count(*) from public.church_members where user_id = '10000000-0000-0000-0000-000000000003'), 1::bigint, 'owner can remove a member without affecting another church');
update public.presentation_sessions
set is_active = true, current_slide_index = 1, updated_by = '10000000-0000-0000-0000-000000000001'
where schedule_id = '30000000-0000-0000-0000-000000000001';
select is((select is_active from public.presentation_sessions where schedule_id = '30000000-0000-0000-0000-000000000001'), true, 'owner can control synchronized presentation');
select throws_ok(
  $$insert into public.church_members (church_id, user_id, role)
    values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'viewer')$$,
  '42501',
  'owner cannot manage memberships in another church'
);
select throws_ok(
  $$delete from public.songs where id = '20000000-0000-0000-0000-000000000001'$$,
  '23503',
  'song referenced by a schedule cannot be deleted'
);
select throws_ok(
  $$insert into public.schedule_items (schedule_id, church_id, item_type, title, position, song_id)
    select '30000000-0000-0000-0000-000000000001', church.id, 'song', 'Cross-church song', 1, '20000000-0000-0000-0000-000000000002'
    from public.churches church where church.slug = 'incoc-south'$$,
  '23503',
  'schedule items cannot reference another church song'
);
select throws_ok(
  $$insert into public.schedule_items (schedule_id, church_id, item_type, title, position)
    select '30000000-0000-0000-0000-000000000001', id, 'prayer', 'Duplicate position', 0
    from public.churches where slug = 'incoc-south'$$,
  '23505',
  'programme item positions must be unique within a schedule'
);
select throws_ok(
  $$insert into public.schedule_items (schedule_id, church_id, item_type, title, position)
    select '30000000-0000-0000-0000-000000000001', id, 'prayer', 'Negative position', -1
    from public.churches where slug = 'incoc-south'$$,
  '23514',
  'programme item positions cannot be negative'
);
select throws_ok(
  $$insert into public.schedule_items (schedule_id, church_id, item_type, title, position, song_id)
    select '30000000-0000-0000-0000-000000000001', id, 'prayer', 'Invalid song relation', 1, '20000000-0000-0000-0000-000000000001'
    from public.churches where slug = 'incoc-south'$$,
  '23514',
  'non-song programme items cannot reference a song'
);

select * from finish();
rollback;
