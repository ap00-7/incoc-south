import { ConfirmButton } from "@/components/confirm-button";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth";
import { removeMember } from "@/app/admin/members/actions";
import { Trash2 } from "lucide-react";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { InviteMemberForm, MemberRoleForm } from "@/components/admin/member-action-forms";

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
          <MemberRoleForm
            userId={item.user_id}
            displayName={profile?.display_name || "member"}
            role={item.role}
            disabled={item.user_id === current.user.id}
          />
          {item.user_id !== current.user.id && <form><input type="hidden" name="user_id" value={item.user_id} /><ConfirmButton action={removeMember} title="Remove member?" message={`Remove ${profile?.display_name || "this member"} from the church? They will lose access to private content.`} className="icon-button danger"><Trash2 size={15} /></ConfirmButton></form>}
        </div>
      </article>;
      })}
    </div>
    <h2 className="admin-section-title">Invite a member</h2>
    <p className="muted">Supabase sends a sign-in invitation. New members set their password after opening the email link.</p>
    <InviteMemberForm />
    {!process.env.SUPABASE_SERVICE_ROLE_KEY && <p className="notice notice-warning">Set the server-only SUPABASE_SERVICE_ROLE_KEY in your environment to enable invitations. Never expose it in a NEXT_PUBLIC variable.</p>}
  </>;
}
