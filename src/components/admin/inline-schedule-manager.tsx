import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  addScheduleItem,
  deleteScheduleItem,
  moveScheduleItem,
  setScheduleStatus,
  updateSchedule,
  updateScheduleItem,
} from "@/app/admin/actions";
import { ConfirmButton } from "@/components/confirm-button";

type SongOption = { id: string; title: string; language: string };
type ScheduleItem = {
  id: string;
  item_type: string;
  title: string;
  position: number;
  leader_name: string | null;
  duration_minutes: number | null;
  public_content: string | null;
  song_id: string | null;
  updated_at: string;
  song: { title: string } | { title: string }[] | null;
  notes?: string;
};

export function InlineScheduleManager({
  schedule,
  items,
  songs,
  returnTo,
}: {
  schedule: {
    id: string;
    title: string;
    service_date: string;
    venue: string | null;
    description: string | null;
    status: "draft" | "published";
    updated_at: string;
  };
  items: ScheduleItem[];
  songs: SongOption[];
  returnTo: string;
}) {
  return (
    <details className="inline-owner-editor">
      <summary>Manage service and slides</summary>
      <form className="form-stack schedule-edit-form" action={updateSchedule} data-dirty-form>
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="schedule_id" value={schedule.id} />
        <input type="hidden" name="expected_updated_at" value={schedule.updated_at} />
        <label htmlFor={`title-${schedule.id}`}>Service title</label>
        <input id={`title-${schedule.id}`} name="title" defaultValue={schedule.title} required maxLength={200} />
        <label htmlFor={`date-${schedule.id}`}>Date</label>
        <input id={`date-${schedule.id}`} type="date" name="service_date" defaultValue={schedule.service_date} required />
        <label htmlFor={`venue-${schedule.id}`}>Venue</label>
        <input id={`venue-${schedule.id}`} name="venue" defaultValue={schedule.venue ?? ""} maxLength={200} />
        <label htmlFor={`description-${schedule.id}`}>Description</label>
        <textarea id={`description-${schedule.id}`} name="description" defaultValue={schedule.description ?? ""} rows={3} maxLength={2000} />
        <button className="button button-secondary">Save service details</button>
      </form>

      <form className="schedule-actions" action={setScheduleStatus}>
        <input type="hidden" name="schedule_id" value={schedule.id} />
        <input type="hidden" name="status" value={schedule.status === "published" ? "draft" : "published"} />
        <input type="hidden" name="return_to" value={returnTo} />
        <ConfirmButton
          action={setScheduleStatus}
          message={schedule.status === "published" ? "Unpublish this service?" : "Publish this service for public viewing?"}
          className="button button-primary"
        >
          {schedule.status === "published" ? "Unpublish service" : "Publish service"}
        </ConfirmButton>
      </form>

      <h3 className="inline-owner-heading">Programme and slide content</h3>
      {items.length ? <ol className="inline-programme-list">
        {items.map((item, index) => {
          const relatedSong = Array.isArray(item.song) ? item.song[0] : item.song;
          return <li className="inline-programme-item" key={item.id}>
            <div className="inline-programme-actions">
              <strong>{relatedSong?.title ?? item.title}</strong>
              <div className="mini-actions">
                <form action={moveScheduleItem}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="direction" value="-1" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button className="icon-button" aria-label="Move item up" disabled={index === 0}><ArrowUp size={15} /></button>
                </form>
                <form action={moveScheduleItem}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="direction" value="1" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button className="icon-button" aria-label="Move item down" disabled={index === items.length - 1}><ArrowDown size={15} /></button>
                </form>
                <form>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <ConfirmButton action={deleteScheduleItem} message="Remove this programme item?" className="icon-button danger"><Trash2 size={15} /></ConfirmButton>
                </form>
              </div>
            </div>
            <form className="form-stack schedule-item-edit-form" action={updateScheduleItem} data-dirty-form>
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="schedule_id" value={schedule.id} />
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="expected_updated_at" value={item.updated_at} />
              <label htmlFor={`type-${item.id}`}>Type</label>
              <select id={`type-${item.id}`} name="item_type" defaultValue={item.item_type}>
                {["song", "worship", "prayer", "sermon", "scripture_reading", "announcement", "communion", "offering", "other"].map((type) =>
                  <option key={type} value={type}>{type.replaceAll("_", " ")}</option>,
                )}
              </select>
              <label htmlFor={`song-${item.id}`}>Song</label>
              <select id={`song-${item.id}`} name="song_id" defaultValue={item.song_id ?? ""}>
                <option value="">No song selected</option>
                {songs.map((song) => <option key={song.id} value={song.id}>{song.title} · {song.language}</option>)}
              </select>
              <label htmlFor={`item-title-${item.id}`}>Programme title (for non-song items)</label>
              <input id={`item-title-${item.id}`} name="title" defaultValue={item.song_id ? "" : item.title} maxLength={200} />
              <label htmlFor={`leader-${item.id}`}>Leader / speaker</label>
              <input id={`leader-${item.id}`} name="leader_name" defaultValue={item.leader_name ?? ""} maxLength={200} />
              <label htmlFor={`duration-${item.id}`}>Estimated minutes</label>
              <input id={`duration-${item.id}`} name="duration_minutes" type="number" min="0" max="1440" defaultValue={item.duration_minutes ?? ""} />
              <label htmlFor={`public-${item.id}`}>Public / slide content</label>
              <textarea id={`public-${item.id}`} name="public_content" defaultValue={item.public_content ?? ""} rows={3} maxLength={5000} />
              <label htmlFor={`notes-${item.id}`}>Internal note (owners only)</label>
              <textarea id={`notes-${item.id}`} name="notes" defaultValue={item.notes ?? ""} rows={2} maxLength={2000} />
              <button className="button button-secondary">Save programme item</button>
            </form>
          </li>;
        })}
      </ol> : <p className="muted">No programme items yet.</p>}

      <details className="inline-add-item">
        <summary>Add programme item</summary>
        <form className="form-stack schedule-item-edit-form" action={addScheduleItem} data-dirty-form>
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="schedule_id" value={schedule.id} />
          <label htmlFor={`new-type-${schedule.id}`}>Type</label>
          <select id={`new-type-${schedule.id}`} name="item_type" defaultValue="song">
            {["song", "worship", "prayer", "sermon", "scripture_reading", "announcement", "communion", "offering", "other"].map((type) =>
              <option key={type} value={type}>{type.replaceAll("_", " ")}</option>,
            )}
          </select>
          <label htmlFor={`new-song-${schedule.id}`}>Song</label>
          <select id={`new-song-${schedule.id}`} name="song_id" defaultValue="">
            <option value="">Select a song</option>
            {songs.map((song) => <option key={song.id} value={song.id}>{song.title} · {song.language}</option>)}
          </select>
          <label htmlFor={`new-title-${schedule.id}`}>Programme title (for non-song items)</label>
          <input id={`new-title-${schedule.id}`} name="title" maxLength={200} />
          <label htmlFor={`new-leader-${schedule.id}`}>Leader / speaker</label>
          <input id={`new-leader-${schedule.id}`} name="leader_name" maxLength={200} />
          <label htmlFor={`new-duration-${schedule.id}`}>Estimated minutes</label>
          <input id={`new-duration-${schedule.id}`} name="duration_minutes" type="number" min="0" max="1440" />
          <label htmlFor={`new-public-${schedule.id}`}>Public / slide content</label>
          <textarea id={`new-public-${schedule.id}`} name="public_content" rows={3} maxLength={5000} />
          <label htmlFor={`new-notes-${schedule.id}`}>Internal note (owners only)</label>
          <textarea id={`new-notes-${schedule.id}`} name="notes" rows={2} maxLength={2000} />
          <button className="button button-primary">Add programme item</button>
        </form>
      </details>
    </details>
  );
}
