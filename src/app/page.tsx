import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, MonitorPlay } from "lucide-react";
import { PageShell } from "@/components/page-shell";

const experiences = [
  { href: "/songbook", icon: BookOpen, label: "Explore the songbook", text: "Find songs and follow their lyric sections in the order they were written." },
  { href: "/schedule", icon: CalendarDays, label: "View services", text: "See upcoming published services and their programme." },
  { href: "/login", icon: MonitorPlay, label: "Prepare a service", text: "Authorized owners can manage songs, services, and presentations." },
];

export default function Home() {
  return (
    <PageShell>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">INDIAN CHURCH OF CHRIST · SOUTH SECTOR</p>
          <h1>Gather with purpose.<br /><span>Worship together.</span></h1>
          <p className="hero-description">A shared place to prepare services, keep worship songs close, and make every gathering easier to lead.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/songbook">Browse the songbook <ArrowRight size={16} /></Link>
            <Link className="text-link" href="/schedule">View services</Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="cross-symbol"><span /></div>
          <p>WORSHIP · FELLOWSHIP · SERVICE</p>
        </div>
      </section>
      <section className="experience-section">
        <div className="section-intro"><p className="eyebrow">A PLACE FOR EVERY PART</p><h2>Everything for the gathering</h2></div>
        <div className="experience-grid">
          {experiences.map(({ href, icon: Icon, label, text }) => (
            <Link href={href} className="experience-card" key={href}>
              <span className="experience-icon"><Icon size={20} /></span>
              <h3>{label}</h3><p>{text}</p><span className="card-arrow"><ArrowRight size={17} /></span>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
