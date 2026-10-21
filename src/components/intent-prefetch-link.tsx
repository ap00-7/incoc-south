"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Link>, "prefetch">;

export function IntentPrefetchLink({ children, ...props }: Props) {
  const [intent, setIntent] = useState(false);
  const prefetchOnIntent = () => setIntent(true);

  return (
    <Link
      {...props}
      prefetch={intent ? true : undefined}
      onMouseEnter={prefetchOnIntent}
      onFocus={prefetchOnIntent}
      onTouchStart={prefetchOnIntent}
    >
      {children}
    </Link>
  );
}
