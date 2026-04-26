'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/utils';

export interface AppliedCoupon {
  code: string;
  label: string;
  discountAmount: number;
}

interface CouponInputProps {
  subtotal: number;
  gstAmount: number;
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon | null) => void;
}

export function CouponInput({ subtotal, gstAmount, applied, onApply }: CouponInputProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: input.trim(), subtotal, gst_amount: gstAmount }),
      });
      const data = await res.json();
      if (!data.valid) {
        setError(data.error || 'Invalid coupon');
      } else {
        onApply({ code: data.coupon.code, label: data.coupon.label, discountAmount: data.discountAmount });
        setInput('');
        setError(null);
      }
    } catch {
      setError('Could not validate coupon. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleRemove() {
    onApply(null);
    setError(null);
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 bg-success/8 border border-success/25 rounded-lg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-success text-base leading-none">✓</span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-success truncate">{applied.code}</div>
            <div className="text-[10px] text-muted truncate">{applied.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs font-bold text-success">−{formatINR(applied.discountAmount)}</span>
          <button
            onClick={handleRemove}
            className="w-5 h-5 rounded-full bg-muted/20 hover:bg-danger/10 text-muted hover:text-danger flex items-center justify-center text-xs transition-colors"
            aria-label="Remove coupon"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">🏷</span>
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && handleApply()}
            placeholder="Coupon code"
            className="input-field w-full pl-8 pr-3 uppercase tracking-wide"
          />
        </div>
        <button
          onClick={handleApply}
          disabled={!input.trim() || loading}
          className="px-4 py-2 text-sm font-semibold bg-accent/10 text-accent border border-accent/30 rounded-lg hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '…' : 'Apply'}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
