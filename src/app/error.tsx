"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <main className="not-found" role="alert">
    <p className="eyebrow">WE COULDN’T LOAD THIS PAGE</p>
    <h1>Something went wrong</h1>
    <p className="muted">Your access or connection may have changed. Try again, and contact a church owner if the problem continues.</p>
    <button className="button button-primary" onClick={() => reset()}>Try again</button>
  </main>;
}
