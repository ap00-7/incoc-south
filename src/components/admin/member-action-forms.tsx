"use client";

import { inviteMember, updateMemberRole } from "@/app/admin/members/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { useServerFormAction } from "@/components/use-server-form-action";

export function MemberRoleForm({
  userId,
  displayName,
  role,
  disabled,
}: {
  userId: string;
  displayName: string;
  role: "owner" | "viewer";
  disabled: boolean;
}) {
  const { error, formAction } = useServerFormAction(updateMemberRole);
  return (
    <form action={formAction}>
      <input type="hidden" name="user_id" value={userId} />
      <select name="role" aria-label={`Role for ${displayName}`} defaultValue={role} disabled={disabled}>
        <option value="viewer">Viewer</option>
        <option value="owner">Owner</option>
      </select>
      <PendingSubmitButton className="button button-secondary" pendingLabel="Saving…" disabled={disabled}>Save role</PendingSubmitButton>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

export function InviteMemberForm() {
  const { error, formAction } = useServerFormAction(inviteMember);
  return (
    <form className="form-stack admin-form" action={formAction}>
      <label htmlFor="display_name">Name</label>
      <input id="display_name" name="display_name" required maxLength={100} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required />
      <label htmlFor="role">Role</label>
      <select id="role" name="role" defaultValue="viewer">
        <option value="viewer">Viewer</option>
        <option value="owner">Owner</option>
      </select>
      {error && <p className="form-error" role="alert">{error}</p>}
      <PendingSubmitButton pendingLabel="Sending invitation…">Send invitation</PendingSubmitButton>
    </form>
  );
}
