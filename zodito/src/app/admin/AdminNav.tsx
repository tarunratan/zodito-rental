'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Bikes', href: '/admin' },
  { label: 'Coupons', href: '/admin/coupons' },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <div className="flex gap-1 mb-6 border-b border-border">
      {TABS.map(tab => {
        const active = tab.href === '/admin' ? path === '/admin' : path.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
