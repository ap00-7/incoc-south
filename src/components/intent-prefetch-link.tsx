"use client";

import { Link, type LinkProps } from "react-router-dom";

type Props = Omit<LinkProps, "to"> & { href: string };

export function IntentPrefetchLink({ children, ...props }: Props) {
  const { href, ...linkProps } = props;
  return <Link {...linkProps} to={href} prefetch="intent">{children}</Link>;
}
