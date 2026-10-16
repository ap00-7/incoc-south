import type { Metadata } from "next";
import { Suspense } from "react";
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
        <Suspense fallback={<div className="route-loading" role="status">Loading INCOC South…</div>}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
