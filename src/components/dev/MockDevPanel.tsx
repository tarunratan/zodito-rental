'use client';

import { useEffect, useState } from 'react';

/**
 * Shown only in mock mode. Lets you flip between customer/vendor/admin
 * to test different parts of the app without touching a DB.
 */
export function MockDevPanel() {
  const [role, setRole] = useState<string>('customer');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const m = document.cookie.match(/mock_role=(customer|vendor|admin)/);
    if (m) setRole(m[1]);
  }, []);

  function switchRole(next: string) {
    document.cookie = `mock_role=${next}; path=/; max-age=604800; SameSite=Lax`;
    window.location.href = next === 'admin' ? '/admin' : next === 'vendor' ? '/vendor' : '/';
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-40 bg-primary text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg hover:scale-105 transition-transform"
        aria-label="Dev panel"
      >
        🛠 Dev · {role}
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-6 z-40 bg-primary text-white rounded-xl shadow-xl p-4 w-64">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">Dev Panel</span>
        <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-lg leading-none">×</button>
      </div>
      <p className="text-[11px] text-white/60 mb-3 leading-relaxed">
        Switch roles to test different flows. Mock data only.
      </p>
      <div className="space-y-1.5">
        {(['customer', 'vendor', 'admin'] as const).map(r => (
          <button
            key={r}
            onClick={() => switchRole(r)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              role === r
                ? 'bg-accent text-white font-semibold'
                : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <span className="mr-2">{r === 'customer' ? '🧑' : r === 'vendor' ? '🤝' : '🛠'}</span>
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-white/50 leading-relaxed">
        Quick jumps:
        <div className="flex flex-wrap gap-1 mt-1">
          <a href="/" className="bg-white/10 px-2 py-0.5 rounded hover:bg-white/20">Home</a>
          <a href="/my-bookings" className="bg-white/10 px-2 py-0.5 rounded hover:bg-white/20">Bookings</a>
          <a href="/kyc" className="bg-white/10 px-2 py-0.5 rounded hover:bg-white/20">KYC</a>
          <a href="/vendor/signup" className="bg-white/10 px-2 py-0.5 rounded hover:bg-white/20">Vendor Signup</a>
        </div>
      </div>
    </div>
  );
}
