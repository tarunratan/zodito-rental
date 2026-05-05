'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="font-display font-bold text-3xl tracking-tight mb-1">Welcome back</h1>
      <p className="text-muted text-sm mb-8">Sign in to your Zodito account</p>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="input w-full" placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            className="input w-full" placeholder="••••••••"
          />
        </div>
        {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
        <button type="submit" disabled={loading} className="btn-accent w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="flex flex-col gap-1.5 text-center">
          <p className="text-sm text-muted">
            No account?{' '}
            <Link href="/sign-up" className="text-accent hover:underline font-medium">
              Create one
            </Link>
          </p>
          <p className="text-sm text-muted">
            <Link href="/forgot-password" className="text-accent hover:underline font-medium">
              Forgot password?
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
