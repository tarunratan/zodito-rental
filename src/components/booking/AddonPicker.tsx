'use client';

import { cn } from '@/lib/utils';

export function AddonPicker({
  extraHelmets,
  onHelmetsChange,
}: {
  extraHelmets: number;
  onHelmetsChange: (n: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🪖</div>
          <div>
            <div className="font-semibold text-sm">1 Helmet</div>
            <div className="text-xs text-muted">Complimentary with rental</div>
          </div>
        </div>
        <span className="text-xs font-bold text-success uppercase">Free</span>
      </div>

      <div className="flex items-center justify-between p-3 border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🪖</div>
          <div>
            <div className="font-semibold text-sm">Extra helmets</div>
            <div className="text-xs text-muted">₹50 per helmet</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StepButton onClick={() => onHelmetsChange(Math.max(0, extraHelmets - 1))} disabled={extraHelmets === 0}>
            −
          </StepButton>
          <span className="w-6 text-center font-bold">{extraHelmets}</span>
          <StepButton onClick={() => onHelmetsChange(Math.min(3, extraHelmets + 1))} disabled={extraHelmets >= 3}>
            +
          </StepButton>
        </div>
      </div>

      <div className="text-[11px] text-muted p-3 bg-bg rounded-lg leading-relaxed">
        💡 Helmets must be returned in original condition. Loss or damage incurs replacement charges.
      </div>
    </div>
  );
}

function StepButton({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-7 h-7 rounded-md border font-bold text-sm',
        disabled
          ? 'border-border text-border cursor-not-allowed'
          : 'border-accent text-accent hover:bg-accent hover:text-white'
      )}
    >
      {children}
    </button>
  );
}
