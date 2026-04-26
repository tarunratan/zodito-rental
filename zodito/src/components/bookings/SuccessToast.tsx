'use client';

import { useEffect, useState } from 'react';

export function SuccessToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-4 p-4 bg-success/10 border border-success/30 rounded-card flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
      <div className="w-9 h-9 rounded-full bg-success text-white flex items-center justify-center">
        ✓
      </div>
      <div>
        <div className="font-semibold text-sm text-success">Booking confirmed!</div>
        <div className="text-xs text-muted mt-0.5">
          Check your details below. Happy riding! 🏍️
        </div>
      </div>
    </div>
  );
}
