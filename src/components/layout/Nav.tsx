'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { isMockMode } from '@/lib/mock';

export function Nav() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [kyc, setKyc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isMockMode()) {
      setLoaded(true);
      return;
    }

    const supabase = createSupabaseBrowser();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoaded(true);
      if (data.user) {
        fetch('/api/me/role')
          .then(r => r.json())
          .then(d => { setRole(d.role ?? 'customer'); setKyc(d.kyc_status ?? null); })
          .catch(() => setRole('customer'));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) { setRole(null); setKyc(null); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setKyc(null);
    router.push('/');
    router.refresh();
  }

  const isSignedIn = isMockMode() || !!user;
  const effectiveRole = isMockMode() ? 'customer' : role;

  return (
    <nav className="bg-primary h-16 px-6 flex items-center justify-between sticky top-0 z-[100]">
      <Link href="/" className="flex flex-col">
        <div className="font-display font-bold text-[18px] text-white tracking-tight">
          Zodito<span className="text-accent">Rentals</span>
        </div>
        <div className="text-[11px] text-white/45 uppercase tracking-[1.5px] mt-[1px]">
          Renting Made Easy
        </div>
      </Link>

      <ul className="hidden md:flex gap-6 list-none">
        {isSignedIn && (
          <>
            <li>
              <Link href="/my-bookings" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
                My Bookings
              </Link>
            </li>
            {kyc === 'not_submitted' && (
              <li>
                <Link href="/kyc" className="text-accent hover:text-accent-hover text-sm font-medium transition-colors">
                  Verify ID
                </Link>
              </li>
            )}
            {kyc === 'rejected' && (
              <li>
                <Link href="/kyc" className="text-warning hover:text-warning/80 text-sm font-medium transition-colors">
                  ⚠ Re-submit KYC
                </Link>
              </li>
            )}
            {effectiveRole === 'vendor' && (
              <li>
                <Link href="/vendor" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
                  Vendor Dashboard
                </Link>
              </li>
            )}
            {effectiveRole === 'admin' && (
              <li>
                <Link href="/admin" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
                  Admin
                </Link>
              </li>
            )}
            {effectiveRole !== 'vendor' && effectiveRole !== 'admin' && (
              <li>
                <Link href="/vendor/signup" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
                  List Your Bike
                </Link>
              </li>
            )}
          </>
        )}
      </ul>

      <div className="flex gap-2.5 items-center">
        {!loaded ? null : isSignedIn && !isMockMode() ? (
          <button onClick={handleSignOut} className="btn-outline-light text-sm">
            Sign out
          </button>
        ) : !isMockMode() ? (
          <>
            <Link href="/sign-in" className="btn-outline-light">Login</Link>
            <Link href="/sign-up" className="btn-accent">Sign Up</Link>
          </>
        ) : (
          <>
            <button className="btn-outline-light" disabled title="Sign in disabled in mock mode">Login</button>
            <button className="btn-accent" disabled title="Sign up disabled in mock mode">Sign Up</button>
          </>
        )}
      </div>
    </nav>
  );
}
