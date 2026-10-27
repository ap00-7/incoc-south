begin;

alter table public.song_sections
  add column if not exists lyrics_language text;

update public.song_sections section
set lyrics_language = song.language
from public.songs song
where section.song_id = song.id
  and section.lyrics_language is null
  and song.language <> 'Multilingual';

commit;
