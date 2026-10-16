create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'viewer');
create type public.schedule_status as enum ('draft', 'published');
create type public.schedule_item_type as enum (
  'song', 'worship', 'prayer', 'sermon', 'scripture_reading',
  'announcement', 'communion', 'offering', 'other'
);
create type public.song_section_type as enum (
  'verse', 'chorus', 'pre_chorus', 'bridge', 'intro', 'outro', 'other'
);

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.churches (name, slug)
values ('Indian Church of Christ', 'incoc-south')
on conflict (slug) do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.church_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (church_id, user_id)
);
create index church_members_user_church_idx on public.church_members(user_id, church_id);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  language text not null check (length(trim(language)) > 0),
  author text,
  source text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, church_id)
);
create index songs_church_title_idx on public.songs(church_id, lower(title));
create index songs_church_language_idx on public.songs(church_id, language);

create table public.song_sections (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  section_type public.song_section_type not null default 'verse',
  label text,
  position integer not null check (position >= 0),
  lyrics text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_id, position)
);
create index song_sections_song_order_idx on public.song_sections(song_id, position);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  service_date date not null,
  venue text,
  description text,
  status public.schedule_status not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (id, church_id)
);
create index schedules_church_date_idx on public.schedules(church_id, service_date desc);
create index schedules_church_status_date_idx on public.schedules(church_id, status, service_date);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null,
  church_id uuid not null,
  item_type public.schedule_item_type not null,
  title text not null check (length(trim(title)) > 0),
  song_id uuid,
  position integer not null check (position >= 0),
  leader_name text,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  notes text,
  public_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, id),
  unique (schedule_id, position),
  foreign key (schedule_id, church_id) references public.schedules(id, church_id) on delete cascade,
  foreign key (song_id, church_id) references public.songs(id, church_id) on delete restrict,
  check ((item_type = 'song' and song_id is not null) or (item_type <> 'song' and song_id is null))
);
create index schedule_items_schedule_order_idx on public.schedule_items(schedule_id, position);

create table public.presentation_sessions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null unique references public.schedules(id) on delete cascade,
  current_item_id uuid,
  current_slide_index integer not null default 0 check (current_slide_index >= 0),
  is_active boolean not null default false,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (schedule_id, current_item_id)
    references public.schedule_items(schedule_id, id) on delete set null (current_item_id)
);

create table public.presentation_links (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger churches_set_updated_at before update on public.churches
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger songs_set_updated_at before update on public.songs
for each row execute function public.set_updated_at();
create trigger song_sections_set_updated_at before update on public.song_sections
for each row execute function public.set_updated_at();
create trigger schedules_set_updated_at before update on public.schedules
for each row execute function public.set_updated_at();
create trigger schedule_items_set_updated_at before update on public.schedule_items
for each row execute function public.set_updated_at();
create trigger presentation_sessions_set_updated_at before update on public.presentation_sessions
for each row execute function public.set_updated_at();

create or replace function public.is_church_member(target_church uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_members m
    where m.church_id = target_church and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_church_owner(target_church uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_members m
    where m.church_id = target_church
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;
create trigger auth_user_profile after insert on auth.users
for each row execute function public.create_profile_for_user();

alter table public.churches enable row level security;
alter table public.profiles enable row level security;
alter table public.church_members enable row level security;
alter table public.songs enable row level security;
alter table public.song_sections enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_items enable row level security;
alter table public.presentation_sessions enable row level security;
alter table public.presentation_links enable row level security;

create policy "Members can view their church"
on public.churches for select to authenticated
using (public.is_church_member(id));
create policy "Owners can update their church"
on public.churches for update to authenticated
using (public.is_church_owner(id)) with check (public.is_church_owner(id));

create policy "Users can view permitted profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.church_members mine
    join public.church_members theirs on theirs.church_id = mine.church_id
    where mine.user_id = (select auth.uid())
      and mine.role = 'owner'
      and theirs.user_id = profiles.id
  )
);
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Members can view church membership"
on public.church_members for select to authenticated
using (user_id = (select auth.uid()) or public.is_church_owner(church_id));
create policy "Owners can add other members"
on public.church_members for insert to authenticated
with check (public.is_church_owner(church_id) and user_id <> (select auth.uid()));
create policy "Owners can update other members"
on public.church_members for update to authenticated
using (public.is_church_owner(church_id) and user_id <> (select auth.uid()))
with check (public.is_church_owner(church_id) and user_id <> (select auth.uid()));
create policy "Owners can remove other members"
on public.church_members for delete to authenticated
using (public.is_church_owner(church_id) and user_id <> (select auth.uid()));

create policy "Members can read songs"
on public.songs for select to authenticated using (public.is_church_member(church_id));
create policy "Owners can create songs"
on public.songs for insert to authenticated
with check (public.is_church_owner(church_id) and created_by = (select auth.uid()));
create policy "Owners can update songs"
on public.songs for update to authenticated
using (public.is_church_owner(church_id)) with check (public.is_church_owner(church_id));
create policy "Owners can delete unreferenced songs"
on public.songs for delete to authenticated using (public.is_church_owner(church_id));

create policy "Members can read song sections"
on public.song_sections for select to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_sections.song_id and public.is_church_member(s.church_id)
));
create policy "Owners can add song sections"
on public.song_sections for insert to authenticated
with check (exists (
  select 1 from public.songs s
  where s.id = song_sections.song_id and public.is_church_owner(s.church_id)
));
create policy "Owners can update song sections"
on public.song_sections for update to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_sections.song_id and public.is_church_owner(s.church_id)
))
with check (exists (
  select 1 from public.songs s
  where s.id = song_sections.song_id and public.is_church_owner(s.church_id)
));
create policy "Owners can delete song sections"
on public.song_sections for delete to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_sections.song_id and public.is_church_owner(s.church_id)
));

create policy "Members can read published schedules or own drafts"
on public.schedules for select to authenticated
using (public.is_church_member(church_id) and (status = 'published' or public.is_church_owner(church_id)));
create policy "Owners can create schedules"
on public.schedules for insert to authenticated
with check (public.is_church_owner(church_id) and created_by = (select auth.uid()));
create policy "Owners can update schedules"
on public.schedules for update to authenticated
using (public.is_church_owner(church_id)) with check (public.is_church_owner(church_id));
create policy "Owners can delete schedules"
on public.schedules for delete to authenticated using (public.is_church_owner(church_id));

create policy "Members can read items for visible schedules"
on public.schedule_items for select to authenticated
using (exists (
  select 1 from public.schedules s
  where s.id = schedule_items.schedule_id
    and s.church_id = schedule_items.church_id
    and public.is_church_member(s.church_id)
    and (s.status = 'published' or public.is_church_owner(s.church_id))
));
create policy "Owners can manage schedule items"
on public.schedule_items for all to authenticated
using (public.is_church_owner(church_id))
with check (public.is_church_owner(church_id));

create policy "Members can read presentation sessions"
on public.presentation_sessions for select to authenticated
using (exists (
  select 1 from public.schedules s
  where s.id = presentation_sessions.schedule_id
    and public.is_church_member(s.church_id)
    and (s.status = 'published' or public.is_church_owner(s.church_id))
));
create policy "Owners can control presentation sessions"
on public.presentation_sessions for all to authenticated
using (exists (
  select 1 from public.schedules s
  where s.id = presentation_sessions.schedule_id and public.is_church_owner(s.church_id)
))
with check (exists (
  select 1 from public.schedules s
  where s.id = presentation_sessions.schedule_id
    and public.is_church_owner(s.church_id)
    and updated_by = (select auth.uid())
));

create policy "Owners can manage restricted links"
on public.presentation_links for all to authenticated
using (exists (
  select 1 from public.schedules s
  where s.id = presentation_links.schedule_id and public.is_church_owner(s.church_id)
))
with check (exists (
  select 1 from public.schedules s
  where s.id = presentation_links.schedule_id and public.is_church_owner(s.church_id)
));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'songs') then
      alter publication supabase_realtime add table public.songs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedules') then
      alter publication supabase_realtime add table public.schedules;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'presentation_sessions') then
      alter publication supabase_realtime add table public.presentation_sessions;
    end if;
  end if;
end;
$$;
