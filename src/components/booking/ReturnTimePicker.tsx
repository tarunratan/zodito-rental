'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { STORE_OPEN_HOUR, STORE_CLOSE_HOUR } from '@/lib/pricing';

// Minimum for the "longer duration" custom picker is 24hrs (12hr is handled as a fixed preset).
const MIN_DURATION_HOURS = 24;
// Maximum is 30 days.
const MAX_DURATION_HOURS = 720;

export function ReturnTimePicker({
  pickupTs,
  value,
  onChange,
}: {
  pickupTs: Date;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const minReturnTs = useMemo(() => {
    return new Date(pickupTs.getTime() + MIN_DURATION_HOURS * 3_600_000);
  }, [pickupTs]);

  const maxReturnTs = useMemo(() => {
    return new Date(pickupTs.getTime() + MAX_DURATION_HOURS * 3_600_000);
  }, [pickupTs]);

  const [monthCursor, setMonthCursor] = useState(() => {
    const base = value ?? minReturnTs;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const days = useMemo(() => buildMonthDays(monthCursor), [monthCursor]);
  const selectedDayKey = value ? ymd(value) : null;
  const minDayKey = ymd(minReturnTs);
  const maxDayKey = ymd(maxReturnTs);

  function selectDay(d: Date) {
    const key = ymd(d);
    const isMinDay = key === minDayKey;
    let hour = value ? value.getHours() : 10;

    if (isMinDay) {
      const minHour = minReturnTs.getHours();
      if (hour < minHour) hour = minHour;
    }
    if (hour < STORE_OPEN_HOUR) hour = STORE_OPEN_HOUR;
    if (hour > STORE_CLOSE_HOUR) hour = STORE_CLOSE_HOUR;

    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0));
  }

  function selectTime(hour: number) {
    const base = value ?? minReturnTs;
    onChange(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, 0, 0, 0));
  }

  const isOnMinDay = value ? ymd(value) === minDayKey : false;
  const minHourOnDay  = isOnMinDay ? minReturnTs.getHours() : STORE_OPEN_HOUR;
  const timeSlots = buildTimeSlots().filter(s => s.hour >= minHourOnDay);

  return (
    <div className="grid md:grid-cols-[1fr_200px] gap-5">
      {/* Calendar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="w-8 h-8 rounded-lg hover:bg-border flex items-center justify-center text-sm"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="font-display font-semibold">
            {monthCursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
          </div>
          <button
            onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="w-8 h-8 rounded-lg hover:bg-border flex items-center justify-center text-sm"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-[10px] text-muted uppercase tracking-wide text-center mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="py-1">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (!d) return <div key={i} />;
            const key  = ymd(d);
            const isSelected = key === selectedDayKey;
            const isTooEarly = key < minDayKey;
            const isTooLate  = key > maxDayKey;
            const disabled = isTooEarly || isTooLate;
            const isMinDay  = key === minDayKey;

            return (
              <button
                key={key}
                disabled={disabled}
                onClick={() => selectDay(d)}
                className={cn(
                  'aspect-square rounded-lg text-sm font-medium transition-all flex items-center justify-center',
                  disabled && 'text-border cursor-not-allowed',
                  !disabled && !isSelected && 'hover:bg-accent/10',
                  isMinDay && !isSelected && 'border border-accent/30',
                  isSelected && 'bg-accent text-white font-bold shadow-sm',
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time picker */}
      <div>
        <div className="form-label mb-2">Return time</div>
        {!value ? (
          <p className="text-xs text-muted italic">Select a return date first.</p>
        ) : timeSlots.length === 0 ? (
          <p className="text-xs text-muted italic">Select a later date.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {timeSlots.map(slot => {
              const isSelected = value && value.getHours() === slot.hour;
              return (
                <button
                  key={slot.hour}
                  onClick={() => selectTime(slot.hour)}
                  className={cn(
                    'px-2 py-2 rounded-md text-xs font-medium border transition-all',
                    isSelected
                      ? 'bg-accent text-white border-accent shadow-sm'
                      : 'bg-primary/5 border-border text-primary hover:bg-accent/10 hover:border-accent/60 hover:text-accent'
                  )}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-muted mt-2 leading-relaxed">
          Store hours: 6 AM – 10 PM
        </p>
      </div>
    </div>
  );
}

function buildTimeSlots(): Array<{ hour: number; label: string }> {
  const slots: Array<{ hour: number; label: string }> = [];
  for (let h = STORE_OPEN_HOUR; h <= STORE_CLOSE_HOUR; h++) {
    slots.push({ hour: h, label: fmt12(h) });
  }
  return slots;
}

function fmt12(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12} ${period}`;
}

function buildMonthDays(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = new Date(year, month, 1).getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
