'use client';

import { useState, useEffect } from 'react';
import { formatINR } from '@/lib/utils';

export interface AppliedCoupon {
  code: string;
  label: string;
  discountAmount: number;
}

interface AvailableCoupon {
  id: string;
  code: string;
  label: string;
  discount_type: 'percent' | 'fixed' | 'gst_waiver';
  discount_value: number;
}

interface CouponInputProps {
  subtotal: number;
  gstAmount: number;
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon | null) => void;
}

function offerLabel(c: AvailableCoupon): string {
  if (c.discount_type === 'gst_waiver') return 'GST waiver';
  if (c.discount_type === 'percent') return `${c.discount_value}% off`;
  return `₹${c.discount_value} off`;
}

export function CouponInput({ subtotal, gstAmount, applied, onApply }: CouponInputProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<AvailableCoupon[]>([]);

  useEffect(() => {
    fetch('/api/coupons/available')
      .then(r => r.json())
      .then(d => setOffers(d.coupons ?? []))
      .catch(() => { /* silent */ });
  }, []);

  async function applyCode(code: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal, gst_amount: gstAmount }),
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
      <div className="flex items-center justify-between px-3 py-2.5 bg-success/10 border border-success/25 rounded-lg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-success text-sm leading-none">✓</span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-success truncate">{applied.code}</div>
            <div className="text-[10px] text-muted truncate">{applied.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs font-bold text-success">−{formatINR(applied.discountAmount)}</span>
          <button
            onClick={handleRemove}
            className="w-5 h-5 rounded-full bg-border hover:bg-danger/10 text-muted hover:text-danger flex items-center justify-center text-xs transition-colors"
            aria-label="Remove coupon"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {offers.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Available Offers</p>
          <div className="flex flex-wrap gap-2">
            {offers.map(offer => (
              <button
                key={offer.id}
                onClick={() => applyCode(offer.code)}
                disabled={loading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-accent/30 bg-accent/5 hover:bg-accent/15 transition-colors text-left disabled:opacity-50"
              >
                <span className="text-[10px] font-bold text-accent font-mono tracking-wider">{offer.code}</span>
                <span className="text-[10px] text-muted">·</span>
                <span className="text-[10px] text-muted">{offerLabel(offer)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">🏷</span>
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && applyCode(input.trim())}
            placeholder="Coupon code"
            className="input-field pl-8 uppercase tracking-wide"
          />
        </div>
        <button
          onClick={() => applyCode(input.trim())}
          disabled={!input.trim() || loading}
          className="px-4 py-2 text-sm font-semibold bg-accent/10 text-accent border border-accent/30 rounded-lg hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? '…' : 'Apply'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
