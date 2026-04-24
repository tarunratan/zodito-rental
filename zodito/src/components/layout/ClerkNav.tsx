'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

export function ClerkNav() {
  const { user, isLoaded } = useUser();
  const [role, setRole] = useState<'customer' | 'vendor' | 'admin' | null>(null);
  const [kyc, setKyc] = useState<string | null>(null);

  // Fetch role from our users table once user is loaded
  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch('/api/me/role')
      .then(r => r.json())
      .then(d => {
        setRole(d.role ?? 'customer');
        setKyc(d.kyc_status ?? null);
      })
      .catch(() => setRole('customer'));
  }, [isLoaded, user]);

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
        <SignedIn>
          <li>
            <Link href="/my-bookings" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
              My Bookings
            </Link>
          </li>
          {kyc && kyc !== 'approved' && (
            <li>
              <Link href="/kyc" className="text-accent hover:text-accent-hover text-sm font-medium transition-colors">
                ⚠ Complete KYC
              </Link>
            </li>
          )}
          {role === 'vendor' && (
            <li>
              <Link href="/vendor" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
                Vendor Dashboard
              </Link>
            </li>
          )}
          {role === 'admin' && (
            <li>
              <Link href="/admin" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
                Admin
              </Link>
            </li>
          )}
          {role !== 'vendor' && role !== 'admin' && (
            <li>
              <Link href="/vendor/signup" className="text-white/75 hover:text-white text-sm font-medium transition-colors">
                List Your Bike
              </Link>
            </li>
          )}
        </SignedIn>
      </ul>

      <div className="flex gap-2.5 items-center">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn-outline-light">Login</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="btn-accent">Sign Up</button>
          </SignUpButton>
        </SignedOut>
        <SignedIn>
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-9 h-9',
              },
            }}
          />
        </SignedIn>
      </div>
    </nav>
  );
}
