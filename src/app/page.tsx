import { BookOpen, CalendarDays, MonitorPlay } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";

const options = [
  { href: "/song", icon: BookOpen, label: "Songs", text: "Browse worship songs and their lyric sections." },
  { href: "/schedule", icon: CalendarDays, label: "Sunday Schedule", text: "See services and their programmes." },
  { href: "/slides", icon: MonitorPlay, label: "Slides", text: "Choose a service to open its presentation." },
];

export default function Home() {
  return (
    <PageShell>
      <section className="home-main" aria-labelledby="home-title">
        <h1 id="home-title">Worship together.</h1>
        <nav className="home-options" aria-label="Explore INCOC South">
          {options.map(({ href, icon: Icon, label, text }) => (
            <IntentPrefetchLink href={href} className="home-option" key={label}>
              <span className="home-option-icon"><Icon size={21} aria-hidden="true" /></span>
              <span className="home-option-copy"><strong>{label}</strong><span>{text}</span></span>
            </IntentPrefetchLink>
          ))}
        </nav>
      </section>
    </PageShell>
  );
}
