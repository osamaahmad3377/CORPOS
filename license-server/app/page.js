import Link from 'next/link';

export default function Home() {
  return (
    <main className="center-page">
      <div className="card narrow">
        <h1 className="brand">CorePOS <span>License Server</span></h1>
        <p className="muted">This server issues and validates CorePOS product keys.</p>
        <Link className="btn primary" href="/admin">Open admin panel</Link>
      </div>
    </main>
  );
}
