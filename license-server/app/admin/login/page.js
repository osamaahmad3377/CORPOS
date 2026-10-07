import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth.js';
import LoginForm from './LoginForm.js';

export const metadata = { title: 'Sign in - CorePOS Licenses' };

export default async function LoginPage() {
  const store = await cookies();
  if (verifySessionToken(store.get(SESSION_COOKIE)?.value)) redirect('/admin');
  return (
    <main className="center-page">
      <div className="card narrow">
        <h1 className="brand">CorePOS <span>Licenses</span></h1>
        <p className="muted">Sign in to manage product keys.</p>
        <LoginForm />
      </div>
    </main>
  );
}
