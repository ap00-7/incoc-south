import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function NotFound() {
  return <main className="not-found">
    <div className="not-found-theme"><ThemeToggle /></div>
    <p className="eyebrow">NOT FOUND</p>
    <h1>This page isn’t here</h1>
    <p className="muted">It may have been moved, or you may not have permission to view it.</p>
    <Link className="button button-primary" href="/">Return to INCOC South</Link>
  </main>;
}
