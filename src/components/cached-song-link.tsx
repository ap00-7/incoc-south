"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { loadSong } from "@/lib/song-cache";

export function CachedSongLink({
  songId,
  children,
  updatedAt,
  className,
  href,
}: {
  songId: string;
  children: ReactNode;
  updatedAt: string;
  className?: string;
  href?: string;
}) {
  const [intent, setIntent] = useState(false);
  const prefetchSong = () => {
    setIntent(true);
    void loadSong(songId, updatedAt).catch(() => {
      // The destination reports the error if the user follows the link.
    });
  };

  return (
    <Link
      className={className}
      href={href ?? `/song/${songId}`}
      prefetch={intent ? true : undefined}
      onMouseEnter={prefetchSong}
      onFocus={prefetchSong}
      onTouchStart={prefetchSong}
    >
      {children}
    </Link>
  );
}
