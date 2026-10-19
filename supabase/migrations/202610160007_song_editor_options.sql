begin;

alter table public.songs
  add column if not exists has_translation boolean not null default false,
  add column if not exists start_with_chorus boolean not null default false;

alter table public.song_sections
  add column if not exists is_hidden boolean not null default false;

update public.songs song
set has_translation = exists (
  select 1
  from public.song_sections section
  where section.song_id = song.id
    and nullif(trim(section.translation), '') is not null
)
where not song.has_translation;

commit;