'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { KycForm } from '@/components/kyc/KycForm';

type Tab = 'profile' | 'kyc' | 'security';

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  profile_photo_url: string | null;
  kyc_status: string;
  role: string;
}

export default function ProfilePageWrapper() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-6 py-16 flex items-center justify-center"><div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" /></div>}>
      <ProfilePage />
    </Suspense>
  );
}

function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab = (searchParams.get('tab') as Tab) || 'profile';

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile edit state
  const [editingName, setEditingName]       = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [firstName, setFirstName]           = useState('');
  const [lastName, setLastName]             = useState('');
  const [address, setAddress]               = useState('');
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/me/profile')
      .then(r => r.json())
      .then(d => {
        if (d.error) { router.push('/sign-in'); return; }
        setProfile(d);
        setFirstName(d.first_name ?? '');
        setLastName(d.last_name ?? '');
        setAddress(d.address ?? '');
      })
      .catch(() => router.push('/sign-in'))
      .finally(() => setLoading(false));
  }, [router]);

  async function saveName() {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName }),
    });
    setSaving(false);
    if (res.ok) {
      setProfile(p => p ? { ...p, first_name: firstName, last_name: lastName } : p);
      setEditingName(false);
      setSaveMsg({ ok: true, text: 'Name updated' });
    } else {
      setSaveMsg({ ok: false, text: 'Failed to update name' });
    }
  }

  async function saveAddress() {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    setSaving(false);
    if (res.ok) {
      setProfile(p => p ? { ...p, address } : p);
      setEditingAddress(false);
      setSaveMsg({ ok: true, text: 'Address updated' });
    } else {
      setSaveMsg({ ok: false, text: 'Failed to update address' });
    }
  }

  const kycStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
    not_submitted: { label: 'Not Submitted',        color: 'text-warning', bg: 'bg-warning/10' },
    pending:       { label: 'Under Review',          color: 'text-info',    bg: 'bg-info/10' },
    approved:      { label: 'Verified',              color: 'text-success', bg: 'bg-success/10' },
    rejected:      { label: 'Rejected — Re-submit',  color: 'text-danger',  bg: 'bg-danger/10' },
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const kycCfg = kycStatusConfig[profile.kyc_status] ?? kycStatusConfig.not_submitted;
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'User';
  const initials = (displayName[0] ?? '?').toUpperCase();

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="grid md:grid-cols-[240px_1fr] gap-6">

        {/* ── Sidebar ── */}
        <aside>
          <div className="card p-5 flex flex-col items-center text-center gap-3 mb-4">
            <div className="w-20 h-20 rounded-full bg-accent/20 border-2 border-accent/40 flex items-center justify-center text-2xl font-bold text-accent">
              {profile.profile_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.profile_photo_url} alt={displayName} className="w-full h-full rounded-full object-cover" />
              ) : initials}
            </div>
            <div>
              <div className="font-display font-semibold text-base">{displayName}</div>
              <div className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full ${kycCfg.bg} ${kycCfg.color}`}>
                {kycCfg.label}
              </div>
            </div>
          </div>

          <nav className="card overflow-hidden">
            <NavItem href="/profile?tab=profile" active={tab === 'profile'} icon="👤" label="Profile" />
            <NavItem href="/profile?tab=kyc"     active={tab === 'kyc'}     icon="🪪" label="ID Verification" />
            <NavItem href="/profile?tab=security" active={tab === 'security'} icon="🔒" label="Security" />
            <div className="border-t border-border">
              <NavItem href="/my-bookings" active={false} icon="📋" label="My Bookings" />
            </div>
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="min-w-0">
          {saveMsg && (
            <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium ${saveMsg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
              {saveMsg.ok ? '✓ ' : '✗ '}{saveMsg.text}
            </div>
          )}

          {/* ── Profile tab ── */}
          {tab === 'profile' && (
            <div className="card p-6">
              <h2 className="font-display font-bold text-xl mb-1">Profile</h2>
              <p className="text-muted text-sm mb-6">Basic Details</p>

              <div className="divide-y divide-border">
                {/* Name */}
                <ProfileRow
                  label="Name"
                  value={displayName === 'User' ? 'Not provided' : displayName}
                  editable
                  onEdit={() => setEditingName(true)}
                >
                  {editingName && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          className="input-field flex-1"
                          placeholder="First name"
                          value={firstName}
                          onChange={e => setFirstName(e.target.value)}
                        />
                        <input
                          className="input-field flex-1"
                          placeholder="Last name"
                          value={lastName}
                          onChange={e => setLastName(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveName} disabled={saving} className="btn-accent px-4 py-1.5 text-sm">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingName(false); setFirstName(profile.first_name ?? ''); setLastName(profile.last_name ?? ''); }} className="px-4 py-1.5 text-sm border border-border rounded-lg">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </ProfileRow>

                {/* Email */}
                <ProfileRow label="Email" value={profile.email ?? 'Not provided'} />

                {/* Phone */}
                <ProfileRow
                  label="Mobile Number"
                  value={profile.phone ?? 'Not provided'}
                  badge={profile.phone ? 'Verified' : undefined}
                />

                {/* Address */}
                <ProfileRow
                  label="Address"
                  value={profile.address || 'Not provided'}
                  editable
                  onEdit={() => setEditingAddress(true)}
                >
                  {editingAddress && (
                    <div className="mt-3 flex flex-col gap-2">
                      <textarea
                        className="input-field w-full resize-none"
                        rows={3}
                        placeholder="Your delivery/home address"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button onClick={saveAddress} disabled={saving} className="btn-accent px-4 py-1.5 text-sm">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingAddress(false); setAddress(profile.address ?? ''); }} className="px-4 py-1.5 text-sm border border-border rounded-lg">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </ProfileRow>
              </div>

              <div className="mt-6 p-4 bg-bg border border-border rounded-xl text-xs text-muted leading-relaxed">
                <p className="font-semibold text-primary mb-1">ℹ What can be edited?</p>
                <p>Name and address can be changed freely. Email and phone are linked to your account login — contact support to update them.</p>
              </div>
            </div>
          )}

          {/* ── KYC tab ── */}
          {tab === 'kyc' && (
            <div className="card p-6">
              <h2 className="font-display font-bold text-xl mb-1">ID Verification</h2>
              <p className="text-muted text-sm mb-6">
                Upload once — we verify before handing over the bike. You can book now and complete this before pickup.
              </p>

              <div className={`p-4 rounded-xl border mb-6 ${kycCfg.bg} border-current/20`}>
                <div className={`font-semibold ${kycCfg.color} flex items-center gap-2`}>
                  <span className="text-lg">
                    {profile.kyc_status === 'approved' ? '✓' : profile.kyc_status === 'rejected' ? '✗' : '⏱'}
                  </span>
                  Status: {kycCfg.label}
                </div>
              </div>

              {profile.kyc_status !== 'approved' && (
                <KycForm currentStatus={profile.kyc_status as any} />
              )}
              {profile.kyc_status === 'approved' && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-semibold text-success text-lg">You&apos;re verified!</p>
                  <p className="text-muted text-sm mt-1">Your identity has been confirmed. Enjoy your rides.</p>
                  <Link href="/" className="btn-accent inline-block mt-4">Browse bikes →</Link>
                </div>
              )}
            </div>
          )}

          {/* ── Security tab ── */}
          {tab === 'security' && (
            <div className="card p-6">
              <h2 className="font-display font-bold text-xl mb-1">Security</h2>
              <p className="text-muted text-sm mb-6">Manage your password and account access.</p>
              <ChangePasswordSection />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function NavItem({ href, active, icon, label }: { href: string; active: boolean; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? 'bg-accent/10 text-accent border-l-2 border-accent'
          : 'text-primary hover:bg-bg border-l-2 border-transparent'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  );
}

function ProfileRow({
  label, value, editable, badge, onEdit, children,
}: {
  label: string;
  value: string;
  editable?: boolean;
  badge?: string;
  onEdit?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted uppercase tracking-wide mb-1">{label}</div>
          <div className="font-medium text-primary flex items-center gap-2">
            {value}
            {badge && (
              <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full font-semibold">
                {badge}
              </span>
            )}
          </div>
        </div>
        {editable && onEdit && (
          <button onClick={onEdit} className="shrink-0 text-sm text-accent hover:underline font-medium">
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ChangePasswordSection() {
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setMsg({ ok: false, text: 'New passwords do not match' }); return; }
    if (next.length < 6)  { setMsg({ ok: false, text: 'Password must be at least 6 characters' }); return; }
    setLoading(true);
    setMsg(null);
    try {
      const supabase = createSupabaseBrowser();
      // Verify current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Not signed in');
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (signInErr) { setMsg({ ok: false, text: 'Current password is incorrect' }); return; }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      setMsg({ ok: true, text: 'Password changed successfully' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? 'Failed to change password' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleChange} className="space-y-4 max-w-sm">
      <div>
        <label className="form-label block mb-1.5">Current password</label>
        <input type="password" required value={current} onChange={e => setCurrent(e.target.value)} className="input-field w-full" />
      </div>
      <div>
        <label className="form-label block mb-1.5">New password</label>
        <input type="password" required value={next} onChange={e => setNext(e.target.value)} className="input-field w-full" minLength={6} />
      </div>
      <div>
        <label className="form-label block mb-1.5">Confirm new password</label>
        <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} className="input-field w-full" />
      </div>
      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {msg.text}
        </div>
      )}
      <button type="submit" disabled={loading} className="btn-accent w-full">
        {loading ? 'Changing…' : 'Change Password'}
      </button>
      <p className="text-xs text-muted text-center">
        Forgot your password?{' '}
        <Link href="/forgot-password" className="text-accent hover:underline">Reset via email →</Link>
      </p>
    </form>
  );
}
