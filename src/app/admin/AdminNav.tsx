'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  kycPending?: number;
  vendorPending?: number;
  activeBookings?: number;
}

export function AdminNav({ kycPending = 0, vendorPending = 0, activeBookings = 0 }: Props) {
  const path = usePathname();

  const tabs = [
    { label: 'Bikes', href: '/admin' },
    { label: 'Pricing', href: '/admin/pricing' },
    { label: 'Bookings', href: '/admin/bookings', badge: activeBookings },
    { label: 'KYC', href: '/admin/kyc', badge: kycPending },
    { label: 'Vendors', href: '/admin/vendors', badge: vendorPending },
    { label: 'Analytics', href: '/admin/analytics' },
    { label: 'Expenses', href: '/admin/expenses' },
    { label: 'Coupons', href: '/admin/coupons' },
  ];

  return (
    <div className="flex flex-wrap gap-1 mb-6 border-b border-border">
      {tabs.map(tab => {
        const active = tab.href === '/admin' ? path === '/admin' : path.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
