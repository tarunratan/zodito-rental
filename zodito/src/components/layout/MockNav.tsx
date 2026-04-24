'use client';

import Link from 'next/link';

/** Nav used when Clerk keys aren't configured. Purely visual. */
export function MockNav() {
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
        <li><Link href="/vendor" className="text-white/75 hover:text-white text-sm font-medium transition-colors">Vendor Dashboard</Link></li>
        <li><Link href="/admin" className="text-white/75 hover:text-white text-sm font-medium transition-colors">Admin</Link></li>
      </ul>

      <div className="flex gap-2.5 items-center">
        <button className="btn-outline-light" disabled title="Sign in disabled in mock mode">
          Login
        </button>
        <button className="btn-accent" disabled title="Sign up disabled in mock mode">
          Sign Up
        </button>
      </div>
    </nav>
  );
}
