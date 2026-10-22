import { useState } from "react";
import { inviteMember, updateMemberRole } from "@/lib/actions/members";
import { Dropdown } from "@/components/dropdown";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { useFormAction } from "@/components/use-form-action";

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
  const { error, formAction } = useFormAction(updateMemberRole);
  const [selectedRole, setSelectedRole] = useState(role);
  return (
    <form action={formAction}>
      <input type="hidden" name="user_id" value={userId} />
      <Dropdown
        name="role"
        value={selectedRole}
        options={[
          { value: "viewer", label: "Viewer" },
          { value: "owner", label: "Owner" },
        ]}
        onValueChange={(value) => setSelectedRole(value as "viewer" | "owner")}
        aria-label={`Role for ${displayName}`}
        disabled={disabled}
      />
      <PendingSubmitButton className="button button-secondary" pendingLabel="Saving…" disabled={disabled}>Save role</PendingSubmitButton>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

export function InviteMemberForm() {
  const { error, formAction } = useFormAction(inviteMember);
  const [role, setRole] = useState("viewer");
  return (
    <form className="form-stack admin-form" action={formAction}>
      <label htmlFor="display_name">Name</label>
      <input id="display_name" name="display_name" required maxLength={100} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required />
      <label htmlFor="role">Role</label>
      <Dropdown
        id="role"
        name="role"
        value={role}
        options={[
          { value: "viewer", label: "Viewer" },
          { value: "owner", label: "Owner" },
        ]}
        onValueChange={setRole}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <PendingSubmitButton pendingLabel="Sending invitation…">Send invitation</PendingSubmitButton>
    </form>
  );
}
