import { Link, type LinkProps } from "react-router-dom";
import { type ReactNode } from "react";
import { loadSong } from "@/lib/song-cache";

export function CachedSongLink({
  songId,
  children,
  updatedAt,
  className,
  href,
  state,
  onClick,
}: {
  songId: string;
  children: ReactNode;
  updatedAt: string;
  className?: string;
  href?: string;
  state?: LinkProps["state"];
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
      state={state}
      onMouseEnter={prefetchSong}
      onFocus={prefetchSong}
      onTouchStart={prefetchSong}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
