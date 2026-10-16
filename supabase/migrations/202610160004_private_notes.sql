create table public.schedule_item_notes (
  schedule_item_id uuid primary key references public.schedule_items(id) on delete cascade,
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.schedule_item_notes (schedule_item_id, notes)
select id, notes from public.schedule_items where notes is not null;

alter table public.schedule_items drop column notes;
alter table public.songs drop column notes;

create trigger schedule_item_notes_set_updated_at before update on public.schedule_item_notes
for each row execute function public.set_updated_at();

alter table public.schedule_item_notes enable row level security;
grant select, insert, update, delete on public.schedule_item_notes to authenticated;

create policy "Owners can access private service notes"
on public.schedule_item_notes for all to authenticated
using (exists (
  select 1
  from public.schedule_items item
  join public.schedules schedule on schedule.id = item.schedule_id
  where item.id = schedule_item_notes.schedule_item_id
    and public.is_church_owner(schedule.church_id)
))
with check (exists (
  select 1
  from public.schedule_items item
  join public.schedules schedule on schedule.id = item.schedule_id
  where item.id = schedule_item_notes.schedule_item_id
    and public.is_church_owner(schedule.church_id)
));
