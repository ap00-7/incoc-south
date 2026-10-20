import type { Metadata } from "next";
import { OwnerSessionProvider } from "@/components/owner-session-status";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "INCOC South",
    template: "%s | INCOC South",
  },
  description:
    "Church service management, worship songs, lyrics, and projector presentations for Indian Church of Christ, South Sector.",
  icons: { icon: [{ url: "/incoc-mark.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark">
      <body>
        <OwnerSessionProvider configured={isSupabaseConfigured()}>
          {children}
        </OwnerSessionProvider>
      </body>
    </html>
  );
}
