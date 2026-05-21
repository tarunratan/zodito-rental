'use client';

/**
 * Password reset — OTP-first flow.
 *
 * Three inline steps on the same page:
 *   1. email      → resetPasswordForEmail(email) sends the recovery email
 *                   (Supabase's default template includes both a link AND a
 *                   6-digit OTP token).
 *   2. otp        → verifyOtp({ email, token, type: 'recovery' }) creates a
 *                   server session for the user.
 *   3. password   → updateUser({ password }) sets the new password.
 *
 * The email-link path still works for users who clicked through before:
 * /auth/callback exchanges the code, then redirects to /reset-password
 * which now just sets the password against the live session.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type Step = 'email' | 'otp' | 'password' | 'done';

// Next.js requires components reading useSearchParams() to live under a
// Suspense boundary for static export to succeed. The page export is the
// boundary; the actual content moved into ForgotPasswordInner.
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-6 py-16" />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function ForgotPasswordInner() {
  const router    = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep]     = useState<Step>('email');
  const [email, setEmail]   = useState('');
  const [otp, setOtp]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [info, setInfo]     = useState('');

  // /auth/callback bounces error states back here as ?error=…
  useEffect(() => {
    const e = searchParams.get('error');
    if (e) setError(e);
  }, [searchParams]);

  async function sendCode(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const supabase = createSupabaseBrowser();
      // resetPasswordForEmail sends the recovery email. The redirectTo target
      // is now /auth/callback so the link path still works; the OTP token in
      // the same email is what step 2 reads.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) throw error;
      setStep('otp');
      setInfo(`Code sent to ${email}. Check your inbox (and spam).`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (otp.length < 6) { setError('Enter the 6-digit code from your email'); return; }
    setLoading(true);
    setError('');
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp.trim(),
        type: 'recovery',
      });
      if (error) throw error;
      setStep('password');
    } catch (e: any) {
      setError(e?.message ?? 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  }

  async function setNewPassword(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStep('done');
      setTimeout(() => router.push('/sign-in'), 2000);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to set new password');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="font-display font-bold text-2xl mb-2">Password reset!</h1>
        <p className="text-muted">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <Link href="/sign-in" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1 mb-8">
        ← Back to sign in
      </Link>

      {/* Step indicator — gives the user a sense of progress without a full wizard */}
      <div className="flex items-center gap-2 mb-6 text-[11px] font-semibold uppercase tracking-wider">
        <Pill active={step === 'email'}                  done={step !== 'email'}                              label="1 · Email" />
        <span className="text-muted">→</span>
        <Pill active={step === 'otp'}                    done={step === 'password'}                           label="2 · Code" />
        <span className="text-muted">→</span>
        <Pill active={step === 'password'}               done={false}                                          label="3 · New password" />
      </div>

      {step === 'email' && (
        <>
          <h1 className="font-display font-bold text-3xl tracking-tight mb-1">Forgot password?</h1>
          <p className="text-muted text-sm mb-8">
            Enter your email and we&apos;ll send you a 6-digit code.
          </p>
          <form onSubmit={sendCode} className="card p-6 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email address</label>
              <input
                type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                className="input w-full" placeholder="you@example.com"
                autoFocus
              />
            </div>
            {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
            <button type="submit" disabled={loading} className="btn-accent w-full">
              {loading ? 'Sending…' : 'Send 6-digit code'}
            </button>
          </form>
        </>
      )}

      {step === 'otp' && (
        <>
          <h1 className="font-display font-bold text-3xl tracking-tight mb-1">Enter the code</h1>
          <p className="text-muted text-sm mb-8">
            Check your inbox for an email from Zodito Rentals. The code expires in 1 hour.
          </p>
          <form onSubmit={verifyCode} className="card p-6 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">6-digit code</label>
              <input
                type="text" required inputMode="numeric"
                pattern="[0-9]*" maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input w-full text-center text-2xl tracking-[0.5em] font-mono"
                placeholder="••••••"
                autoFocus
                autoComplete="one-time-code"
              />
              <p className="text-[11px] text-muted mt-1">
                Sent to <strong className="text-primary">{email}</strong>{' '}
                <button type="button" onClick={() => setStep('email')} className="text-accent hover:underline">change</button>
              </p>
            </div>
            {info && <p className="text-success text-sm bg-success/10 px-3 py-2 rounded-md">{info}</p>}
            {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
            <button type="submit" disabled={loading || otp.length < 6} className="btn-accent w-full">
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
            <button
              type="button" onClick={() => { setInfo(''); sendCode(); }}
              disabled={loading}
              className="text-sm text-muted hover:text-primary"
            >
              Didn&apos;t receive the code? Resend
            </button>
          </form>
        </>
      )}

      {step === 'password' && (
        <>
          <h1 className="font-display font-bold text-3xl tracking-tight mb-1">Set new password</h1>
          <p className="text-muted text-sm mb-8">Choose a strong password for your account.</p>
          <form onSubmit={setNewPassword} className="card p-6 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">New password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="input w-full pr-10" placeholder="Min 6 characters"
                  autoFocus
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                  tabIndex={-1}
                >
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Confirm new password</label>
              <input
                type={showPw ? 'text' : 'password'} required
                value={confirm} onChange={e => setConfirm(e.target.value)}
                className="input w-full" placeholder="••••••••"
              />
            </div>
            {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
            <button type="submit" disabled={loading} className="btn-accent w-full">
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function Pill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span className={`px-2 py-1 rounded ${active ? 'bg-accent text-white' : done ? 'bg-success/15 text-success' : 'bg-border/40 text-muted'}`}>
      {label}
    </span>
  );
}
