"use client";

import { Link } from "react-router-dom";
import { type ReactNode } from "react";
import { loadSong } from "@/lib/song-cache";

export function CachedSongLink({
  songId,
  children,
  updatedAt,
  className,
  href,
  onClick,
}: {
  songId: string;
  children: ReactNode;
  updatedAt: string;
  className?: string;
  href?: string;
  onClick?: () => void;
}) {
  const prefetchSong = () => {
    void loadSong(songId, updatedAt).catch(() => {
      // The destination reports the error if the user follows the link.
    });
  };

  return (
    <Link
      className={className}
      to={href ?? `/song/${songId}`}
      onMouseEnter={prefetchSong}
      onFocus={prefetchSong}
      onTouchStart={prefetchSong}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
