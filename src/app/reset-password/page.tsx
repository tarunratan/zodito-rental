'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [done, setDone]             = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase puts the access_token in the URL hash on redirect
    // Calling getSession() will pick it up automatically
    const supabase = createSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(!!data.session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push('/sign-in'), 2000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="font-display font-bold text-2xl mb-2">Password reset!</h1>
        <p className="text-muted">Redirecting you to sign in…</p>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted">Verifying reset link…</p>
        <p className="text-sm text-danger mt-4">
          If this takes too long, the link may have expired.{' '}
          <Link href="/forgot-password" className="text-accent underline">Request a new one</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="font-display font-bold text-3xl tracking-tight mb-1">Set new password</h1>
      <p className="text-muted text-sm mb-8">Choose a strong password for your account.</p>
      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">New password</label>
          <input
            type="password" required minLength={6}
            value={password} onChange={e => setPassword(e.target.value)}
            className="input w-full" placeholder="Min 6 characters"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Confirm new password</label>
          <input
            type="password" required
            value={confirm} onChange={e => setConfirm(e.target.value)}
            className="input w-full" placeholder="••••••••"
          />
        </div>
        {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
        <button type="submit" disabled={loading} className="btn-accent w-full">
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}
