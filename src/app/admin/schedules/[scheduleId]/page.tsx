import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, MonitorPlay, Plus, Trash2 } from "lucide-react";
import { addScheduleItem, deleteScheduleItem, moveScheduleItem, setScheduleStatus, updateSchedule, updateScheduleItem } from "@/app/admin/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "Asia/Kolkata" });

export default async function EditSchedulePage({ params }: { params: Promise<{ scheduleId: string }> }) {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const membership = await getMembership();
  if (!membership) return null;
  const { scheduleId } = await params;
  const supabase = await createClient();
  const [{ data: schedule, error }, { data: songs, error: songsError }] = await Promise.all([
    supabase.from("schedules").select("id, title, service_date, venue, description, status, updated_at, schedule_items(id, item_type, title, position, leader_name, duration_minutes, public_content, song_id, updated_at, song:songs(title))")
      .eq("id", scheduleId).eq("church_id", membership.churchId).maybeSingle(),
    supabase.from("songs").select("id, title, language").eq("church_id", membership.churchId).order("title").limit(200),
  ]);
  if (error) throw new Error(`Unable to load service: ${error.message}`);
  if (songsError) throw new Error(`Unable to load songbook: ${songsError.message}`);
  if (!schedule) notFound();
  const items = [...(schedule.schedule_items ?? [])].sort((a, b) => a.position - b.position);
  const itemIds = items.map((item) => item.id);
  const { data: notes, error: notesError } = itemIds.length
    ? await supabase.from("schedule_item_notes").select("schedule_item_id, notes").in("schedule_item_id", itemIds)
    : { data: [], error: null };
  if (notesError) throw new Error(`Unable to load private service notes: ${notesError.message}`);
  const notesByItem = new Map((notes ?? []).map((note) => [note.schedule_item_id, note.notes]));
  const totalMinutes = items.reduce((total, item) => total + (item.duration_minutes ?? 0), 0);

  return <>
    <p className="eyebrow">SERVICE PROGRAMME · <span className={`status-pill status-${schedule.status}`}>{schedule.status}</span></p>
    <h1>{schedule.title}</h1>
    <p>{dateFormatter.format(new Date(`${schedule.service_date}T12:00:00+05:30`))}{schedule.venue ? ` · ${schedule.venue}` : ""}</p>
    {schedule.description && <p className="section-description">{schedule.description}</p>}
    <form className="form-stack schedule-edit-form" action={updateSchedule} data-dirty-form>
      <input type="hidden" name="schedule_id" value={schedule.id} />
      <input type="hidden" name="expected_updated_at" value={schedule.updated_at} />
      <label htmlFor="schedule-title">Service title</label><input id="schedule-title" name="title" defaultValue={schedule.title} required maxLength={200} />
      <label htmlFor="schedule-date">Date</label><input id="schedule-date" type="date" name="service_date" defaultValue={schedule.service_date} required />
      <label htmlFor="schedule-venue">Venue</label><input id="schedule-venue" name="venue" defaultValue={schedule.venue ?? ""} maxLength={200} />
      <label htmlFor="schedule-description">Description</label><textarea id="schedule-description" name="description" defaultValue={schedule.description ?? ""} rows={3} maxLength={2000} />
      <button className="button button-secondary">Save service details</button>
    </form>
    <div className="schedule-actions">
      <Link className="button button-secondary" href={`/admin/schedules/${schedule.id}/preview`}><Eye size={15} /> Preview slides</Link>
      <form><input type="hidden" name="schedule_id" value={schedule.id} /><input type="hidden" name="status" value={schedule.status === "published" ? "draft" : "published"} /><ConfirmButton action={setScheduleStatus} message={schedule.status === "published" ? "Unpublish this service? It will no longer be publicly visible." : "Publish this service for public viewing?"} className="button button-primary">{schedule.status === "published" ? <><EyeOff size={15} /> Unpublish</> : <><Eye size={15} /> Publish service</>}</ConfirmButton></form>
    </div>
    <div className="admin-subheading"><div><p className="eyebrow">PROGRAMME</p><h2>Items <span className="muted">· {items.length}</span></h2></div><Link className="text-link" href={`/admin/schedules/${schedule.id}/preview`}><MonitorPlay size={15} style={{ verticalAlign: "middle", marginRight: 5 }} />Slide preview</Link></div>
    {items.length ? <div className="section-admin-list">{items.map((item, index) => {
      const song = Array.isArray(item.song) ? item.song[0] : item.song;
      return <article className="section-admin-card" key={item.id}>
      <div className="section-admin-heading"><div><h3>{song?.title ?? item.title}</h3><p className="muted">{item.item_type.replaceAll("_", " ")}{item.leader_name ? ` · ${item.leader_name}` : ""}{item.duration_minutes != null ? ` · ${item.duration_minutes} min` : ""}</p></div>
        <div className="mini-actions">
          <form action={moveScheduleItem}><input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="direction" value="-1" /><button className="icon-button" aria-label="Move item up" disabled={index === 0}><ArrowUp size={15} /></button></form>
          <form action={moveScheduleItem}><input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="direction" value="1" /><button className="icon-button" aria-label="Move item down" disabled={index === items.length - 1}><ArrowDown size={15} /></button></form>
          <form><input type="hidden" name="item_id" value={item.id} /><ConfirmButton action={deleteScheduleItem} message="Remove this programme item? The song itself will remain in the library." className="icon-button danger"><Trash2 size={15} /></ConfirmButton></form>
        </div>
      </div>
      <form className="form-stack schedule-item-edit-form" action={updateScheduleItem} data-dirty-form>
        <input type="hidden" name="schedule_id" value={schedule.id} /><input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="expected_updated_at" value={item.updated_at} />
        <label htmlFor={`item-type-${item.id}`}>Type</label><select id={`item-type-${item.id}`} name="item_type" defaultValue={item.item_type}><option value="song">Song</option><option value="worship">Worship</option><option value="prayer">Prayer</option><option value="sermon">Sermon</option><option value="scripture_reading">Scripture reading</option><option value="announcement">Announcement</option><option value="communion">Communion</option><option value="offering">Offering</option><option value="other">Other</option></select>
        <label htmlFor={`item-song-${item.id}`}>Song</label><select id={`item-song-${item.id}`} name="song_id" defaultValue={item.song_id ?? ""}><option value="">No song selected</option>{songs?.map((song) => <option key={song.id} value={song.id}>{song.title} · {song.language}</option>)}</select>
        <label htmlFor={`item-title-${item.id}`}>Programme title <span className="muted">(for non-song items)</span></label><input id={`item-title-${item.id}`} name="title" defaultValue={item.song_id ? "" : item.title} maxLength={200} />
        <label htmlFor={`item-leader-${item.id}`}>Leader / speaker</label><input id={`item-leader-${item.id}`} name="leader_name" defaultValue={item.leader_name ?? ""} maxLength={200} />
        <label htmlFor={`item-duration-${item.id}`}>Estimated minutes</label><input id={`item-duration-${item.id}`} name="duration_minutes" type="number" min="0" max="1440" defaultValue={item.duration_minutes ?? ""} />
        <label htmlFor={`item-public-${item.id}`}>Public / display content</label><textarea id={`item-public-${item.id}`} name="public_content" defaultValue={item.public_content ?? ""} maxLength={5000} rows={3} />
        <label htmlFor={`item-note-${item.id}`}>Internal note <span className="muted">(owners only)</span></label><textarea id={`item-note-${item.id}`} name="notes" defaultValue={notesByItem.get(item.id) ?? ""} maxLength={2000} rows={2} />
        <button className="button button-secondary">Save programme item</button>
      </form>
    </article>;
    })}</div> : <div className="empty-state">Add songs and programme items to build the service.</div>}
    {totalMinutes > 0 && <p className="muted" style={{ fontSize: 12 }}>Estimated duration: {Math.floor(totalMinutes / 60) ? `${Math.floor(totalMinutes / 60)} hr ` : ""}{totalMinutes % 60} min</p>}
    <h2 className="admin-section-title"><Plus size={18} /> Add programme item</h2>
    <form className="form-stack admin-form" action={addScheduleItem} data-dirty-form>
      <input type="hidden" name="schedule_id" value={schedule.id} />
      <label htmlFor="item_type">Type</label><select id="item_type" name="item_type" defaultValue="song"><option value="song">Song</option><option value="worship">Worship</option><option value="prayer">Prayer</option><option value="sermon">Sermon</option><option value="scripture_reading">Scripture reading</option><option value="announcement">Announcement</option><option value="communion">Communion</option><option value="offering">Offering</option><option value="other">Other</option></select>
      <label htmlFor="song_id">Song <span className="muted">(choose for a song item)</span></label><select id="song_id" name="song_id" defaultValue=""><option value="">Select a song</option>{songs?.map((song) => <option key={song.id} value={song.id}>{song.title} · {song.language}</option>)}</select>
      <label htmlFor="title">Programme title <span className="muted">(required except for song items)</span></label><input id="title" name="title" maxLength={200} />
      <label htmlFor="leader_name">Leader / speaker</label><input id="leader_name" name="leader_name" maxLength={200} />
      <label htmlFor="duration_minutes">Estimated minutes</label><input id="duration_minutes" name="duration_minutes" type="number" min="0" max="1440" />
      <label htmlFor="public_content">Display or public content <span className="muted">(scripture, announcement text, etc.)</span></label><textarea id="public_content" name="public_content" maxLength={5000} rows={4} />
      <label htmlFor="notes">Internal note <span className="muted">(owners only)</span></label><textarea id="notes" name="notes" maxLength={2000} rows={3} />
      <button className="button button-primary">Add programme item</button>
    </form>
  </>;
}
