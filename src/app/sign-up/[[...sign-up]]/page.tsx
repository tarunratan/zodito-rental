'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone || null,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Email confirmation is disabled — user is signed in immediately
      router.push('/');
      router.refresh();
      return;
    }

    // Email confirmation is enabled — show prompt
    setEmailSent(true);
    setLoading(false);
  }

  if (emailSent) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="text-5xl mb-4">📬</div>
        <h1 className="font-display font-bold text-2xl tracking-tight mb-2">Check your inbox</h1>
        <p className="text-muted text-sm mb-6">
          We sent a confirmation link to <strong>{form.email}</strong>.<br />
          Click it to activate your account, then sign in.
        </p>
        <Link href="/sign-in" className="btn-accent inline-block">Go to Sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="font-display font-bold text-3xl tracking-tight mb-1">Create account</h1>
      <p className="text-muted text-sm mb-8">Start renting bikes in minutes</p>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">First name</label>
            <input required value={form.first_name} onChange={field('first_name')} className="input w-full" placeholder="Ravi" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Last name</label>
            <input required value={form.last_name} onChange={field('last_name')} className="input w-full" placeholder="Kumar" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" required value={form.email} onChange={field('email')} className="input w-full" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone <span className="text-muted font-normal">(optional)</span></label>
          <input type="tel" value={form.phone} onChange={field('phone')} className="input w-full" placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input type="password" required minLength={8} value={form.password} onChange={field('password')} className="input w-full" placeholder="Min 8 characters" />
        </div>
        {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
        <button type="submit" disabled={loading} className="btn-accent w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-sm text-center text-muted">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-accent hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
