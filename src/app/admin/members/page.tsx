import { ConfirmButton } from "@/components/confirm-button";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth";
import { inviteMember, removeMember, updateMemberRole } from "@/app/admin/members/actions";
import { Trash2 } from "lucide-react";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function AdminMembersPage() {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const current = await getMembership();
  if (!current) return null;
  const supabase = await createClient();
  const { data: members, error } = await supabase.from("church_members")
    .select("user_id, role, created_at, profile:profiles(display_name)")
    .eq("church_id", current.churchId).order("created_at");
  if (error) throw new Error(`Unable to load church members: ${error.message}`);

  return <>
    <p className="eyebrow">ACCESS CONTROL</p><h1>Members</h1>
    <p>Only invited church members can access the songbook and published services. Assign owner access only to trusted administrators.</p>
    <div className="member-list">
      {members?.map((item) => {
        const profile = Array.isArray(item.profile) ? item.profile[0] : item.profile;
        return <article className="member-row" key={item.user_id}>
        <div><h2>{profile?.display_name || "Church member"}</h2><p>{item.user_id === current.user.id ? "You · " : ""}Added {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(item.created_at))}</p></div>
        <div className="member-actions">
          <form action={updateMemberRole}><input type="hidden" name="user_id" value={item.user_id} /><select name="role" aria-label={`Role for ${profile?.display_name || "member"}`} defaultValue={item.role} disabled={item.user_id === current.user.id}><option value="viewer">Viewer</option><option value="owner">Owner</option></select><button className="button button-secondary" disabled={item.user_id === current.user.id}>Save role</button></form>
          {item.user_id !== current.user.id && <form><input type="hidden" name="user_id" value={item.user_id} /><ConfirmButton action={removeMember} message="Remove this member's church access?" className="icon-button danger"><Trash2 size={15} /></ConfirmButton></form>}
        </div>
      </article>;
      })}
    </div>
    <h2 className="admin-section-title">Invite a member</h2>
    <p className="muted">Supabase sends a sign-in invitation. New members set their password after opening the email link.</p>
    <form className="form-stack admin-form" action={inviteMember}>
      <label htmlFor="display_name">Name</label><input id="display_name" name="display_name" required maxLength={100} />
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" required />
      <label htmlFor="role">Role</label><select id="role" name="role" defaultValue="viewer"><option value="viewer">Viewer</option><option value="owner">Owner</option></select>
      <button className="button button-primary">Send invitation</button>
      {!process.env.SUPABASE_SERVICE_ROLE_KEY && <p className="notice notice-warning">Set the server-only SUPABASE_SERVICE_ROLE_KEY in your environment to enable invitations. Never expose it in a NEXT_PUBLIC variable.</p>}
    </form>
  </>;
}
