create or replace function public.move_song_section(target_section uuid, direction integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_song uuid;
  current_position integer;
  neighbor_id uuid;
  neighbor_position integer;
  temporary_position integer;
begin
  if direction not in (-1, 1) then raise exception 'Direction must be -1 or 1'; end if;
  select song_id into target_song from public.song_sections where id = target_section;
  if target_song is null then raise exception 'Section not found'; end if;
  perform 1 from public.songs where id = target_song for update;
  if not exists (
    select 1 from public.songs
    where id = target_song and public.is_church_owner(church_id)
  ) then raise exception 'Owner permission required'; end if;
  select position into current_position from public.song_sections where id = target_section;
  select id, position into neighbor_id, neighbor_position
  from public.song_sections
  where song_id = target_song
    and (case when direction = -1 then position < current_position else position > current_position end)
  order by
    case when direction = -1 then position end desc,
    case when direction = 1 then position end asc
  limit 1;
  if neighbor_id is null then return; end if;
  select coalesce(max(position), 0) + 1 into temporary_position
  from public.song_sections where song_id = target_song;
  update public.song_sections set position = temporary_position where id = target_section;
  update public.song_sections set position = current_position where id = neighbor_id;
  update public.song_sections set position = neighbor_position where id = target_section;
end;
$$;

create or replace function public.move_schedule_item(target_item uuid, direction integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_schedule uuid;
  current_position integer;
  neighbor_id uuid;
  neighbor_position integer;
  temporary_position integer;
begin
  if direction not in (-1, 1) then raise exception 'Direction must be -1 or 1'; end if;
  select schedule_id into target_schedule from public.schedule_items where id = target_item;
  if target_schedule is null then raise exception 'Programme item not found'; end if;
  perform 1 from public.schedules where id = target_schedule for update;
  if not exists (
    select 1 from public.schedules
    where id = target_schedule and public.is_church_owner(church_id)
  ) then raise exception 'Owner permission required'; end if;
  select position into current_position from public.schedule_items where id = target_item;
  select id, position into neighbor_id, neighbor_position
  from public.schedule_items
  where schedule_id = target_schedule
    and (case when direction = -1 then position < current_position else position > current_position end)
  order by
    case when direction = -1 then position end desc,
    case when direction = 1 then position end asc
  limit 1;
  if neighbor_id is null then return; end if;
  select coalesce(max(position), 0) + 1 into temporary_position
  from public.schedule_items where schedule_id = target_schedule;
  update public.schedule_items set position = temporary_position where id = target_item;
  update public.schedule_items set position = current_position where id = neighbor_id;
  update public.schedule_items set position = neighbor_position where id = target_item;
end;
$$;

revoke all on function public.move_song_section(uuid, integer) from public;
revoke all on function public.move_schedule_item(uuid, integer) from public;
grant execute on function public.move_song_section(uuid, integer) to authenticated;
grant execute on function public.move_schedule_item(uuid, integer) to authenticated;
