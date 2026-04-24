'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** Nav used when Clerk keys aren't configured. Reads mock_role cookie for role-aware links. */
export function MockNav() {
  const [role, setRole] = useState<'customer' | 'vendor' | 'admin'>('customer');

  useEffect(() => {
    const m = document.cookie.match(/mock_role=(customer|vendor|admin)/);
    if (m) setRole(m[1] as any);
  }, []);

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
        <li><Link href="/my-bookings" className="text-white/75 hover:text-white text-sm font-medium transition-colors">My Bookings</Link></li>
        {role === 'vendor' && (
          <li><Link href="/vendor" className="text-white/75 hover:text-white text-sm font-medium transition-colors">Vendor Dashboard</Link></li>
        )}
        {role === 'admin' && (
          <li><Link href="/admin" className="text-white/75 hover:text-white text-sm font-medium transition-colors">Admin</Link></li>
        )}
        {role === 'customer' && (
          <li><Link href="/vendor/signup" className="text-white/75 hover:text-white text-sm font-medium transition-colors">List Your Bike</Link></li>
        )}
      </ul>

      <div className="flex gap-2.5 items-center">
        <span className="text-[10px] text-white/40 uppercase tracking-wider hidden md:block">
          Mock · {role}
        </span>
        <button className="btn-accent" disabled title="Use the Dev Panel to switch roles">
          {role}
        </button>
      </div>
    </nav>
  );
}
