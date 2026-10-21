import type { Metadata } from "next";
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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("incoc-south-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}}catch{}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
