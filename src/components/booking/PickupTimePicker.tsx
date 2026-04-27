'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { STORE_OPEN_HOUR, STORE_CLOSE_HOUR } from '@/lib/pricing';

export function PickupTimePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const days = useMemo(() => buildMonthDays(monthCursor), [monthCursor]);

  const selectedDayKey = value ? ymd(value) : null;
  const today = startOfDay(new Date());

  function selectDay(d: Date) {
    const isSelectingToday = ymd(d) === ymd(new Date());

    let hour: number;

    if (isSelectingToday) {
      // Default to 1 hour from now, rounded up to next whole hour
      const now = new Date();
      hour = now.getMinutes() > 0 ? now.getHours() + 2 : now.getHours() + 1;
      if (hour < STORE_OPEN_HOUR) hour = STORE_OPEN_HOUR;
      if (hour > STORE_CLOSE_HOUR) hour = STORE_CLOSE_HOUR;
    } else {
      // For future days, preserve existing hour or default 10 AM
      hour = value ? value.getHours() : 10;
    }

    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0));
  }

  function selectTime(hour: number) {
    const base = value ?? new Date();
    onChange(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, 0, 0, 0));
  }

  const selectedIsToday = value ? ymd(value) === ymd(new Date()) : false;
  const timeSlots = buildTimeSlots();

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
            const key = ymd(d);
            const isSelected = key === selectedDayKey;
            const isPast = d < today;
            const isToday = key === ymd(new Date());

            return (
              <button
                key={key}
                disabled={isPast}
                onClick={() => selectDay(d)}
                className={cn(
                  'aspect-square rounded-lg text-sm font-medium transition-all flex items-center justify-center',
                  isPast && 'text-border cursor-not-allowed',
                  !isPast && !isSelected && 'hover:bg-accent/10',
                  isToday && !isSelected && 'border border-accent/50',
                  isSelected && 'bg-accent text-white font-bold shadow-sm',
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time picker — whole hours only, 12-hr AM/PM */}
      <div>
        <div className="form-label mb-2">Pickup time</div>
        <div className="grid grid-cols-3 gap-1.5">
          {timeSlots.map(slot => {
            const isSelected = value && value.getHours() === slot.hour;
            const isPast = selectedIsToday && slot.hour <= new Date().getHours();

            return (
              <button
                key={slot.hour}
                disabled={isPast}
                onClick={() => !isPast && selectTime(slot.hour)}
                className={cn(
                  'px-2 py-2 rounded-md text-xs font-medium border transition-all',
                  isPast
                    ? 'bg-bg border-border text-border cursor-not-allowed'
                    : isSelected
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white border-border hover:border-accent/50'
                )}
              >
                {slot.label}
              </button>
            );
          })}
        </div>
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
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
