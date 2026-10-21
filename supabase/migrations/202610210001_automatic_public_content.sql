begin;

drop policy if exists "Public can read published INCOC South schedules" on public.schedules;
drop policy if exists "Public can read items in published INCOC South schedules" on public.schedule_items;

create policy "Public can read INCOC South schedules"
on public.schedules for select to anon, authenticated
using (public.is_public_incoc_south(church_id));

create policy "Public can read INCOC South schedule items"
on public.schedule_items for select to anon, authenticated
using (exists (
  select 1 from public.schedules schedule
  where schedule.id = schedule_items.schedule_id
    and schedule.church_id = schedule_items.church_id
    and public.is_public_incoc_south(schedule.church_id)
));

update public.schedules
set status = 'published',
    published_at = coalesce(published_at, now())
where public.is_public_incoc_south(church_id);

commit;
