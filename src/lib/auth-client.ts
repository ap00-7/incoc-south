export type AuthMembership = {
  churchId: string;
  role: "owner" | "viewer";
};
import { notifyDataChanged } from "@/spa/data-events";

type AuthSnapshot = {
  userId: string;
  membership: AuthMembership | null;
};

let authSnapshot: AuthSnapshot | null = null;

export function setAuthSnapshot(userId: string | null, membership: AuthMembership | null) {
  if (authSnapshot?.userId !== userId || authSnapshot?.membership?.role !== membership?.role) {
    notifyDataChanged();
  }
  authSnapshot = userId ? { userId, membership } : null;
}

export async function requireOwner() {
  if (!authSnapshot?.membership || authSnapshot.membership.role !== "owner") {
    throw new Error("Owner access is required. Sign in again and retry.");
  }
  return {
    user: { id: authSnapshot.userId },
    churchId: authSnapshot.membership.churchId,
    role: authSnapshot.membership.role,
  };
}
