import Link from "next/link";
import { BookOpen, CalendarDays, MonitorPlay } from "lucide-react";
import { PageShell } from "@/components/page-shell";

const options = [
  { href: "/songbook", icon: BookOpen, label: "Songs", text: "Browse worship songs and their lyric sections." },
  { href: "/schedule", icon: CalendarDays, label: "Sunday Schedule", text: "See published services and their programmes." },
  { href: "/schedule", icon: MonitorPlay, label: "Slides", text: "Choose a service to open its presentation." },
];

export default function Home() {
  return (
    <PageShell>
      <section className="home-main" aria-labelledby="home-title">
        <p className="eyebrow">INDIAN CHURCH OF CHRIST · SOUTH SECTOR</p>
        <h1 id="home-title">Worship together.</h1>
        <p className="home-description">Choose where you would like to begin.</p>
        <nav className="home-options" aria-label="Explore INCOC South">
          {options.map(({ href, icon: Icon, label, text }) => (
            <Link href={href} className="home-option" key={label}>
              <span className="home-option-icon"><Icon size={21} aria-hidden="true" /></span>
              <span className="home-option-copy"><strong>{label}</strong><span>{text}</span></span>
            </Link>
          ))}
        </nav>
      </section>
    </PageShell>
  );
}
