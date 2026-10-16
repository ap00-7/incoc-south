alter table public.church_members
  add constraint church_members_profile_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.churches, public.profiles, public.church_members, public.songs,
  public.song_sections, public.schedules, public.schedule_items,
  public.presentation_sessions, public.presentation_links
to authenticated;
