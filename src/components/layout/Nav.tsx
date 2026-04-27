'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { isMockMode } from '@/lib/mock';

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [kyc, setKyc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (isMockMode()) { setLoaded(true); return; }

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
    setUser(null); setRole(null); setKyc(null);
    setMenuOpen(false);
    router.push('/');
    router.refresh();
  }

  const isSignedIn = isMockMode() || !!user;
  const effectiveRole = isMockMode() ? 'customer' : role;

  const navLinks = isSignedIn ? (
    <>
      <NavLink href="/my-bookings" onClick={() => setMenuOpen(false)}>My Bookings</NavLink>
      {(kyc === 'not_submitted' || kyc === null) && (
        <NavLink href="/kyc" accent onClick={() => setMenuOpen(false)}>Verify ID</NavLink>
      )}
      {kyc === 'rejected' && (
        <NavLink href="/kyc" warning onClick={() => setMenuOpen(false)}>⚠ Re-submit KYC</NavLink>
      )}
      {effectiveRole === 'vendor' && (
        <NavLink href="/vendor" onClick={() => setMenuOpen(false)}>Vendor Dashboard</NavLink>
      )}
      {effectiveRole === 'admin' && (
        <NavLink href="/admin" onClick={() => setMenuOpen(false)}>Admin</NavLink>
      )}
      {effectiveRole !== 'vendor' && effectiveRole !== 'admin' && (
        <NavLink href="/vendor/signup" onClick={() => setMenuOpen(false)}>List Your Bike</NavLink>
      )}
    </>
  ) : null;

  return (
    <>
      <nav className="bg-primary h-16 px-4 md:px-6 flex items-center justify-between sticky top-0 z-[100]">
        <Link href="/" className="flex flex-col">
          <div className="font-display font-bold text-[18px] text-white tracking-tight">
            Zodito<span className="text-accent">Rentals</span>
          </div>
          <div className="text-[11px] text-white/45 uppercase tracking-[1.5px] mt-[1px]">
            Renting Made Easy
          </div>
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex gap-6 list-none">{navLinks}</ul>

        <div className="flex gap-2.5 items-center">
          {/* Desktop auth buttons */}
          {!loaded ? null : isSignedIn && !isMockMode() ? (
            <button onClick={handleSignOut} className="hidden md:block btn-outline-light text-sm">
              Sign out
            </button>
          ) : !isMockMode() ? (
            <>
              <Link href="/sign-in" className="hidden md:block btn-outline-light">Login</Link>
              <Link href="/sign-up" className="hidden md:block btn-accent">Sign Up</Link>
            </>
          ) : null}

          {/* Hamburger — mobile only */}
          <button
            className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            <span className={`block w-5 h-0.5 bg-white transition-transform origin-center ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white transition-transform origin-center ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[99] flex flex-col" onClick={() => setMenuOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Menu panel */}
          <div
            className="absolute top-16 left-0 right-0 bg-primary border-b border-white/10 shadow-xl py-3 px-4 flex flex-col gap-1"
            onClick={e => e.stopPropagation()}
          >
            {isSignedIn ? (
              <>
                <MobileNavLink href="/my-bookings" onClick={() => setMenuOpen(false)}>My Bookings</MobileNavLink>
                {(kyc === 'not_submitted' || kyc === null) && (
                  <MobileNavLink href="/kyc" onClick={() => setMenuOpen(false)} accent>Verify ID</MobileNavLink>
                )}
                {kyc === 'rejected' && (
                  <MobileNavLink href="/kyc" onClick={() => setMenuOpen(false)} warning>⚠ Re-submit KYC</MobileNavLink>
                )}
                {effectiveRole === 'vendor' && (
                  <MobileNavLink href="/vendor" onClick={() => setMenuOpen(false)}>Vendor Dashboard</MobileNavLink>
                )}
                {effectiveRole === 'admin' && (
                  <MobileNavLink href="/admin" onClick={() => setMenuOpen(false)}>Admin</MobileNavLink>
                )}
                {effectiveRole !== 'vendor' && effectiveRole !== 'admin' && (
                  <MobileNavLink href="/vendor/signup" onClick={() => setMenuOpen(false)}>List Your Bike</MobileNavLink>
                )}
                <div className="border-t border-white/10 mt-2 pt-2">
                  <button onClick={handleSignOut} className="w-full text-left text-white/70 hover:text-white text-sm font-medium py-2.5 px-2 rounded-lg hover:bg-white/10 transition-colors">
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <MobileNavLink href="/sign-in" onClick={() => setMenuOpen(false)}>Login</MobileNavLink>
                <MobileNavLink href="/sign-up" onClick={() => setMenuOpen(false)} accent>Sign Up</MobileNavLink>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({ href, children, accent, warning, onClick }: { href: string; children: React.ReactNode; accent?: boolean; warning?: boolean; onClick?: () => void }) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className={`text-sm font-medium transition-colors ${accent ? 'text-accent hover:text-accent-hover' : warning ? 'text-warning hover:text-warning/80' : 'text-white/75 hover:text-white'}`}
      >
        {children}
      </Link>
    </li>
  );
}

function MobileNavLink({ href, children, accent, warning, onClick }: { href: string; children: React.ReactNode; accent?: boolean; warning?: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-sm font-medium py-2.5 px-2 rounded-lg hover:bg-white/10 transition-colors block ${accent ? 'text-accent' : warning ? 'text-warning' : 'text-white/80'}`}
    >
      {children}
    </Link>
  );
}
