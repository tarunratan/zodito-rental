'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

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

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  // Inline "this email is already registered" hint surfaced on blur — saves
  // the user from filling the whole form before discovering the conflict.
  const [emailTaken, setEmailTaken] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);

  // OTP fallback state — the "Check your inbox" screen below offers a
  // 6-digit code input so users whose Supabase confirmation email got
  // delayed/spam-filtered can still verify the account inline.
  const [otp, setOtp]                 = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpInfo, setOtpInfo]         = useState('');
  const [otpError, setOtpError]       = useState('');
  const [resending, setResending]     = useState(false);

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(f => ({ ...f, [key]: e.target.value }));
      if (key === 'email') setEmailTaken(false); // clear hint while typing
    };
  }

  // Translate raw SDK / network errors into copy a user can act on.
  function humanError(err: any): string {
    const msg = String(err?.message ?? err ?? '').toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('network')) {
      return 'Network hiccup — check your connection and try again. If it keeps happening, the Supabase project may be paused (free tier sleeps after inactivity).';
    }
    if (msg.includes('rate') || msg.includes('too many')) {
      return 'Too many attempts. Wait a minute, then try again.';
    }
    if (msg.includes('already') && msg.includes('registered')) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (msg.includes('password') && msg.includes('weak')) {
      return 'Please choose a stronger password (8+ characters, mix of letters/numbers).';
    }
    return err?.message ?? 'Something went wrong. Please try again.';
  }

  // Pre-flight email check on blur — surfaces "already registered" before
  // the user fills the full form. Failures here are non-fatal (we still let
  // them submit and rely on Supabase's signUp to return the canonical error).
  async function checkEmailOnBlur() {
    const email = form.email.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setEmailChecking(true);
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setEmailTaken(!!data.exists);
    } catch {
      // Network failures shouldn't block signup — fall back to server-side.
    } finally {
      setEmailChecking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Re-check at submit time in case the user edited the email after blur
    // or skipped blur entirely (autofill, paste-and-submit). Failures here
    // are non-fatal — we still let Supabase handle it server-side.
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.exists) {
        setEmailTaken(true);
        setError('An account with this email already exists. Try signing in instead.');
        setLoading(false);
        return;
      }
    } catch {
      // Network blip on our endpoint — silently continue to Supabase.
    }

    try {
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
          // Existing email-link flow still goes through this callback. If the
          // user can't click the link they fall back to OTP below.
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });

      if (error) {
        setError(humanError(error));
        if (humanError(error).includes('already exists')) setEmailTaken(true);
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push('/');
        router.refresh();
        return;
      }

      setEmailSent(true);
    } catch (e: any) {
      // Catches network errors thrown by the SDK ("Failed to fetch" etc).
      setError(humanError(e));
    } finally {
      setLoading(false);
    }
  }

  async function verifySignupOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    // OTP length is governed by Supabase project settings (default 6, but
    // configurable). Require at least 4 digits, accept anything reasonable.
    if (otp.length < 4) { setOtpError('Enter the verification code from your email'); return; }
    setOtpVerifying(true);
    setOtpError('');
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.verifyOtp({
        email: form.email,
        token: otp.trim(),
        type: 'signup',
      });
      if (error) throw error;
      // Account confirmed and session established — go straight to home.
      router.push('/');
      router.refresh();
    } catch (e: any) {
      setOtpError(humanError(e));
    } finally {
      setOtpVerifying(false);
    }
  }

  async function resendConfirmation() {
    setResending(true);
    setOtpError('');
    setOtpInfo('');
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: form.email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
      });
      if (error) throw error;
      setOtpInfo(`New code sent to ${form.email}. Check spam if it doesn't arrive in a minute.`);
    } catch (e: any) {
      setOtpError(humanError(e));
    } finally {
      setResending(false);
    }
  }

  if (emailSent) {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📬</div>
          <h1 className="font-display font-bold text-2xl tracking-tight mb-2">Check your inbox</h1>
          <p className="text-muted text-sm">
            We sent a confirmation email to <strong>{form.email}</strong>.<br />
            Either click the link OR enter the verification code below.
          </p>
        </div>

        <form onSubmit={verifySignupOtp} className="card p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Verification code from email</label>
            <input
              type="text" inputMode="numeric"
              pattern="[0-9]*" maxLength={10}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="input w-full text-center text-2xl tracking-[0.3em] font-mono"
              placeholder="Enter the code from your email"
              autoComplete="one-time-code"
              autoFocus
            />
            <p className="text-[11px] text-muted mt-1">
              Didn&apos;t get an email?{' '}
              <button type="button" onClick={resendConfirmation} disabled={resending}
                className="text-accent hover:underline disabled:opacity-60">
                {resending ? 'Resending…' : 'Resend'}
              </button>
            </p>
          </div>
          {otpInfo  && <p className="text-success text-sm bg-success/10 px-3 py-2 rounded-md">{otpInfo}</p>}
          {otpError && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{otpError}</p>}
          <button type="submit" disabled={otpVerifying || otp.length < 4} className="btn-accent w-full">
            {otpVerifying ? 'Verifying…' : 'Verify & sign in'}
          </button>
          <Link href="/sign-in" className="text-sm text-center text-muted hover:text-primary">
            Already confirmed? Sign in
          </Link>
        </form>
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
          <input
            type="email" required
            value={form.email} onChange={field('email')} onBlur={checkEmailOnBlur}
            className={`input w-full ${emailTaken ? 'border-danger' : ''}`}
            placeholder="you@example.com"
          />
          {emailChecking && (
            <p className="text-[11px] text-muted mt-1">Checking…</p>
          )}
          {emailTaken && (
            <p className="text-[11px] text-danger mt-1">
              Already registered — <Link href="/sign-in" className="font-semibold underline hover:no-underline">sign in instead</Link>
              {' '}or <Link href="/forgot-password" className="font-semibold underline hover:no-underline">reset your password</Link>.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone <span className="text-muted font-normal">(optional)</span></label>
          <input type="tel" value={form.phone} onChange={field('phone')} className="input w-full" placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'} required minLength={8}
              value={form.password} onChange={field('password')}
              className="input w-full pr-10" placeholder="Min 8 characters"
            />
            <button
              type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
              tabIndex={-1}
            >
              <EyeIcon open={showPw} />
            </button>
          </div>
        </div>
        {error && <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-md">{error}</p>}
        <button type="submit" disabled={loading} className="btn-accent w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-sm text-center text-muted">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-accent hover:underline font-medium">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
