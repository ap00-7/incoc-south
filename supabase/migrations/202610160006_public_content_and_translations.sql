begin;

alter table public.song_sections
  add column if not exists translation text,
  add column if not exists translation_language text;

revoke all privileges on table
  public.churches,
  public.profiles,
  public.church_members,
  public.songs,
  public.song_sections,
  public.schedules,
  public.schedule_items,
  public.presentation_sessions,
  public.presentation_links,
  public.schedule_item_notes
from anon;

grant select on public.churches to anon;

create policy "Public can identify INCOC South church"
on public.churches for select to anon, authenticated
using (slug = 'incoc-south');

grant usage on schema public to anon;
grant select on public.songs, public.song_sections, public.schedules, public.schedule_items to anon;

create or replace function public.is_public_incoc_south(target_church uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.churches church
    where church.id = target_church
      and church.slug = 'incoc-south'
  );
$$;

revoke all on function public.is_public_incoc_south(uuid) from public, anon, authenticated;
grant execute on function public.is_public_incoc_south(uuid) to anon, authenticated;

create policy "Public can read INCOC South songs"
on public.songs for select to anon, authenticated
using (public.is_public_incoc_south(church_id));

create policy "Public can read INCOC South song sections"
on public.song_sections for select to anon, authenticated
using (exists (
  select 1 from public.songs song
  where song.id = song_sections.song_id
    and public.is_public_incoc_south(song.church_id)
));

create policy "Public can read published INCOC South schedules"
on public.schedules for select to anon, authenticated
using (status = 'published' and public.is_public_incoc_south(church_id));

create policy "Public can read items in published INCOC South schedules"
on public.schedule_items for select to anon, authenticated
using (exists (
  select 1 from public.schedules schedule
  where schedule.id = schedule_items.schedule_id
    and schedule.church_id = schedule_items.church_id
    and schedule.status = 'published'
    and public.is_public_incoc_south(schedule.church_id)
));

commit;
