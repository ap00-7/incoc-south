import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function AccessDeniedPage() {
  return <PageShell><div className="content-wrap">
    <p className="eyebrow">ACCESS RESTRICTED</p><h1 className="detail-title">This account does not have access</h1>
    <p className="section-description">INCOC South access is limited to members invited by an authorized church owner. Contact your church owner if you believe this is a mistake.</p>
    <div className="schedule-actions"><Link className="button button-primary" href="/">Return home</Link></div>
  </div></PageShell>;
}
