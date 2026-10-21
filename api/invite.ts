import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { Database } from "../src/lib/supabase/database.types";

type ApiRequest = IncomingMessage & { body?: unknown };
type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

const inviteSchema = z.object({
  email: z.string().trim().email(),
  display_name: z.string().trim().min(1).max(100),
  role: z.enum(["owner", "viewer"]),
});

export default async function inviteMember(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email, display name, and role." });

  const authorization = req.headers.authorization;
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return res.status(401).json({ error: "Sign in as an owner to invite members." });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    return res.status(503).json({ error: "Member invitations are not configured on the server." });
  }

  const authenticatedClient = createSupabaseClient<Database>(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userResult, error: authError } = await authenticatedClient.auth.getUser();
  if (authError || !userResult.user) return res.status(401).json({ error: "Your sign-in session is invalid. Sign in again." });

  const { data: membership, error: membershipError } = await authenticatedClient
    .from("church_members")
    .select("church_id, role, church:churches!inner(slug)")
    .eq("user_id", userResult.user.id)
    .eq("church.slug", "incoc-south")
    .maybeSingle();
  if (membershipError) return res.status(500).json({ error: `Unable to verify owner access: ${membershipError.message}` });
  if (membership?.role !== "owner") return res.status(403).json({ error: "Only church owners can invite members." });

  const siteOrigin = getSiteOrigin(req);
  if (!siteOrigin) return res.status(500).json({ error: "The invitation callback URL is not configured correctly." });
  const admin = createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { display_name: parsed.data.display_name },
    redirectTo: `${siteOrigin}/auth/callback?next=/account/setup`,
  });
  if (inviteError) return res.status(400).json({ error: `Unable to invite member: ${inviteError.message}` });
  if (!invite.user) return res.status(500).json({ error: "The invitation was sent without a user record. Check Supabase Auth logs." });

  const { error: insertError } = await admin.from("church_members").insert({
    church_id: membership.church_id,
    user_id: invite.user.id,
    role: parsed.data.role,
  });
  if (insertError) {
    return res.status(500).json({
      error: `The invitation was sent, but membership could not be assigned: ${insertError.message}`,
    });
  }
  return res.status(200).json({ success: true });
}

function getSiteOrigin(req: ApiRequest) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const localHost = req.headers.host;
  const originValue = configuredOrigin
    ?? vercelOrigin
    ?? (localHost && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(localHost) ? `http://${localHost}` : null);
  if (!originValue) return null;
  try {
    const origin = new URL(originValue).origin;
    if (new URL(origin).protocol === "https:" || origin.startsWith("http://localhost")) return origin;
  } catch {
    return null;
  }
  return null;
}
