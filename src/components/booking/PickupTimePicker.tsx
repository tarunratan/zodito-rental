'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { STORE_OPEN_HOUR, STORE_CLOSE_HOUR, STORE_CLOSE_MIN } from '@/lib/pricing';

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
    let minute: number;

    if (isSelectingToday) {
      // Default to 1 hour from now, rounded up to next 30-min slot
      const now = new Date();
      const target = new Date(now.getTime() + 60 * 60 * 1000);
      const rawMinute = target.getMinutes();
      if (rawMinute === 0) {
        hour = target.getHours();
        minute = 0;
      } else if (rawMinute <= 30) {
        hour = target.getHours();
        minute = 30;
      } else {
        hour = target.getHours() + 1;
        minute = 0;
      }
      // Clamp to store hours
      if (hour < STORE_OPEN_HOUR) { hour = STORE_OPEN_HOUR; minute = 0; }
      if (hour > STORE_CLOSE_HOUR || (hour === STORE_CLOSE_HOUR && minute > STORE_CLOSE_MIN)) {
        hour = STORE_CLOSE_HOUR; minute = STORE_CLOSE_MIN;
      }
    } else {
      // For future days, preserve existing time or default 10:00 AM
      hour = value ? value.getHours() : 10;
      minute = value ? value.getMinutes() : 0;
    }

    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0));
  }

  function selectTime(hour: number, minute: number) {
    const base = value ?? new Date();
    onChange(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0));
  }

  const selectedIsToday = value ? ymd(value) === ymd(new Date()) : false;

  return (
    <div className="grid md:grid-cols-[1fr_220px] gap-5">
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

      {/* Time picker */}
      <div>
        <div className="form-label mb-2">Pickup time</div>
        <div className="grid grid-cols-3 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
          {buildTimeSlots().map(slot => {
            const isSelected = value && value.getHours() === slot.hour && value.getMinutes() === slot.minute;
            const isPast = selectedIsToday && isPastSlot(slot.hour, slot.minute);

            return (
              <button
                key={slot.label}
                disabled={isPast}
                onClick={() => !isPast && selectTime(slot.hour, slot.minute)}
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
          Store hours: 6:00 AM – 10:30 PM
        </p>
      </div>
    </div>
  );
}

function isPastSlot(hour: number, minute: number): boolean {
  const now = new Date();
  return hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes());
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

function buildTimeSlots() {
  const slots: { hour: number; minute: number; label: string }[] = [];
  for (let h = STORE_OPEN_HOUR; h <= STORE_CLOSE_HOUR; h++) {
    for (const m of [0, 30]) {
      if (h === STORE_CLOSE_HOUR && m > STORE_CLOSE_MIN) continue;
      slots.push({ hour: h, minute: m, label: fmt12(h, m) });
    }
  }
  return slots;
}

function fmt12(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
