'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { isMockMode } from '@/lib/mock';

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [kyc, setKyc] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false); }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  useEffect(() => {
    if (isMockMode()) { setLoaded(true); return; }

    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoaded(true);
      if (data.user) {
        fetch('/api/me/role')
          .then(r => r.json())
          .then(d => {
            setRole(d.role ?? 'customer');
            setKyc(d.kyc_status ?? null);
            setFirstName(d.first_name ?? null);
          })
          .catch(() => setRole('customer'));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        router.push('/reset-password');
        return;
      }
      setUser(session?.user ?? null);
      if (!session?.user) { setRole(null); setKyc(null); setFirstName(null); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null); setRole(null); setKyc(null); setFirstName(null);
    setMenuOpen(false); setUserMenuOpen(false);
    router.push('/');
    router.refresh();
  }

  const isSignedIn = isMockMode() || !!user;
  const effectiveRole = isMockMode() ? 'customer' : role;
  const displayName = firstName ?? user?.email?.split('@')[0] ?? 'Account';
  const showListBike = effectiveRole !== 'vendor' && effectiveRole !== 'admin';

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

        {/* Desktop centre links — always visible */}
        <ul className="hidden md:flex gap-6 list-none items-center">
          {/* Partner with Us — hover flyout */}
          <li className="flex items-center h-16 relative group">
            <span className="flex items-center gap-1 text-sm font-medium text-white/75 group-hover:text-white transition-colors cursor-default select-none">
              Partner with Us
              <span className="text-white/40 text-[10px] ml-0.5">▾</span>
            </span>
            {/* Dropdown — no gap so hover stays active as mouse moves down */}
            <div className="absolute top-16 left-0 hidden group-hover:block z-50 w-72">
              <div className="bg-white border border-border rounded-xl shadow-xl overflow-hidden">
                <div className="px-4 pt-3.5 pb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Partner Program</span>
                </div>
                <Link
                  href="/earn"
                  className="flex items-start gap-3 px-4 py-3 hover:bg-bg transition-colors group/link"
                >
                  <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-base shrink-0">
                    💰
                  </div>
                  <div>
                    <div className="font-semibold text-primary text-sm group-hover/link:text-accent transition-colors">
                      Earn with Us
                    </div>
                    <div className="text-xs text-muted mt-0.5 leading-snug">
                      List your bike, earn 80% of every rental
                    </div>
                  </div>
                </Link>
                <div className="mx-4 border-t border-border" />
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-[11px] text-muted">50+ active partners · ₹6,000+/month avg</span>
                  <Link href="/earn" className="text-[11px] font-semibold text-accent hover:underline">
                    Learn more →
                  </Link>
                </div>
              </div>
            </div>
          </li>
        </ul>

        <div className="flex gap-2.5 items-center">
          {!loaded ? null : isSignedIn && !isMockMode() ? (
            /* ── User name dropdown (desktop) ── */
            <div ref={userMenuRef} className="hidden md:block relative">
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-2 text-sm font-medium text-white/85 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/10"
              >
                <span className="w-7 h-7 rounded-full bg-accent/30 border border-accent/50 flex items-center justify-center text-xs font-bold text-white uppercase">
                  {displayName[0] ?? '?'}
                </span>
                <span className="max-w-[120px] truncate">{displayName}</span>
                <span className="text-white/50 text-[10px]">{userMenuOpen ? '▲' : '▼'}</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-border rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
                  <Link
                    href="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-primary hover:bg-bg transition-colors"
                  >
                    👤 My Profile
                  </Link>
                  <Link
                    href="/my-bookings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-primary hover:bg-bg transition-colors"
                  >
                    📋 My Bookings
                  </Link>
                  {(kyc === 'not_submitted' || kyc === null) && (
                    <Link
                      href="/profile?tab=kyc"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-accent font-medium hover:bg-bg transition-colors"
                    >
                      🪪 Verify ID
                    </Link>
                  )}
                  {kyc === 'rejected' && (
                    <Link
                      href="/profile?tab=kyc"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger font-medium hover:bg-bg transition-colors"
                    >
                      ⚠ Re-submit KYC
                    </Link>
                  )}
                  {effectiveRole === 'vendor' && (
                    <Link
                      href="/vendor"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-primary hover:bg-bg transition-colors"
                    >
                      🏪 Vendor Dashboard
                    </Link>
                  )}
                  {effectiveRole === 'admin' && (
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-primary hover:bg-bg transition-colors"
                    >
                      ⚙ Admin
                    </Link>
                  )}
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted hover:text-danger hover:bg-bg transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
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
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute top-16 left-0 right-0 bg-primary border-b border-white/10 shadow-xl py-3 px-4 flex flex-col gap-1"
            onClick={e => e.stopPropagation()}
          >
            {isSignedIn ? (
              <>
                {/* Name header */}
                <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
                  <span className="w-8 h-8 rounded-full bg-accent/30 border border-accent/50 flex items-center justify-center text-sm font-bold text-white uppercase">
                    {displayName[0] ?? '?'}
                  </span>
                  <span className="text-white font-semibold text-sm truncate">{displayName}</span>
                </div>
                <div className="border-t border-white/10 mb-1" />
                <MobileNavLink href="/profile" onClick={() => setMenuOpen(false)}>My Profile</MobileNavLink>
                <MobileNavLink href="/my-bookings" onClick={() => setMenuOpen(false)}>My Bookings</MobileNavLink>
                {(kyc === 'not_submitted' || kyc === null) && (
                  <MobileNavLink href="/profile?tab=kyc" onClick={() => setMenuOpen(false)} accent>🪪 Verify ID</MobileNavLink>
                )}
                {kyc === 'rejected' && (
                  <MobileNavLink href="/profile?tab=kyc" onClick={() => setMenuOpen(false)} warning>⚠ Re-submit KYC</MobileNavLink>
                )}
                {effectiveRole === 'vendor' && (
                  <MobileNavLink href="/vendor" onClick={() => setMenuOpen(false)}>Vendor Dashboard</MobileNavLink>
                )}
                {effectiveRole === 'admin' && (
                  <MobileNavLink href="/admin" onClick={() => setMenuOpen(false)}>Admin</MobileNavLink>
                )}
                <MobileNavLink href="/earn" onClick={() => setMenuOpen(false)}>💰 Earn with Us</MobileNavLink>
                {showListBike && (
                  <MobileNavLink href="/vendor/signup" onClick={() => setMenuOpen(false)}>List Your Bike</MobileNavLink>
                )}
                <div className="border-t border-white/10 mt-2 pt-2">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left text-white/70 hover:text-white text-sm font-medium py-2.5 px-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <MobileNavLink href="/earn" onClick={() => setMenuOpen(false)} accent>💰 Earn with Us</MobileNavLink>
                <MobileNavLink href="/vendor/signup" onClick={() => setMenuOpen(false)}>List Your Bike</MobileNavLink>
                <div className="border-t border-white/10 my-1" />
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

function NavLink({ href, children, accent, warning, onClick }: {
  href: string; children: React.ReactNode; accent?: boolean; warning?: boolean; onClick?: () => void;
}) {
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

function MobileNavLink({ href, children, accent, warning, onClick }: {
  href: string; children: React.ReactNode; accent?: boolean; warning?: boolean; onClick?: () => void;
}) {
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
