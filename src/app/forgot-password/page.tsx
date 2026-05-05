'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="text-5xl mb-4">📧</div>
        <h1 className="font-display font-bold text-2xl mb-2">Check your email</h1>
        <p className="text-muted mb-6">
          We sent a password reset link to <strong>{email}</strong>. It expires in 1 hour.
        </p>
        <p className="text-sm text-muted">
          Didn&apos;t receive it?{' '}
          <button onClick={() => setSent(false)} className="text-accent hover:underline font-medium">
            Try again
          </button>
        </p>
        <Link href="/sign-in" className="block mt-6 text-sm text-muted hover:text-primary">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <Link href="/sign-in" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1 mb-8">
        ← Back to sign in
      </Link>
      <h1 className="font-display font-bold text-3xl tracking-tight mb-1">Forgot password?</h1>
      <p className="text-muted text-sm mb-8">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input w-full"
            placeholder="you@example.com"
          />
        </div>
        {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
        <button type="submit" disabled={loading} className="btn-accent w-full">
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </div>
  );
}
