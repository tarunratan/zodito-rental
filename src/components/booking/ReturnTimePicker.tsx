'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { STORE_OPEN_HOUR, STORE_CLOSE_HOUR } from '@/lib/pricing';

// Maximum is 30 days.
const MAX_DURATION_HOURS = 720;
// Evening pickups (≥ 18:00) get special handling: allow same-day returns and 6 AM next morning.
const EVENING_PICKUP_HOUR = 18;

export function ReturnTimePicker({
  pickupTs,
  value,
  onChange,
}: {
  pickupTs: Date;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const isEveningPickup = pickupTs.getHours() >= EVENING_PICKUP_HOUR;

  const minReturnTs = useMemo(() => {
    if (isEveningPickup) {
      // Allow returning same day after pickup — no 12hr minimum for evening bookings
      return new Date(pickupTs.getTime() + 3_600_000); // at least 1 hour after pickup
    }
    return new Date(pickupTs.getTime() + 12 * 3_600_000);
  }, [pickupTs, isEveningPickup]);

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

  // Quick-select options for evening pickups
  const tonightDate = pickupTs;
  const tomorrowDate = new Date(pickupTs.getFullYear(), pickupTs.getMonth(), pickupTs.getDate() + 1);
  const tonightTenPm  = new Date(tonightDate.getFullYear(), tonightDate.getMonth(), tonightDate.getDate(), STORE_CLOSE_HOUR, 0, 0, 0);
  const tomorrowSixAm = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), STORE_OPEN_HOUR, 0, 0, 0);
  // "Tonight 10 PM" only makes sense if it's more than 1 hour after pickup
  const showTonightOption = isEveningPickup && tonightTenPm > minReturnTs;

  return (
    <div className="space-y-4">
      {/* Evening quick-select */}
      {isEveningPickup && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest font-semibold mb-2">Quick select</p>
          <div className="flex gap-2 flex-wrap">
            {showTonightOption && (
              <button
                onClick={() => onChange(tonightTenPm)}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                  value && ymd(value) === ymd(tonightTenPm) && value.getHours() === STORE_CLOSE_HOUR
                    ? 'bg-accent text-white border-accent'
                    : 'border-accent/50 text-accent hover:bg-accent/10'
                )}
              >
                Tonight 10 PM
              </button>
            )}
            <button
              onClick={() => onChange(tomorrowSixAm)}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                value && ymd(value) === ymd(tomorrowSixAm) && value.getHours() === STORE_OPEN_HOUR
                  ? 'bg-accent text-white border-accent'
                  : 'border-accent/50 text-accent hover:bg-accent/10'
              )}
            >
              Tomorrow 6 AM
            </button>
          </div>
          <p className="text-[10px] text-muted mt-2">Or pick any date &amp; time below</p>
        </div>
      )}

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
          Store hours: 6 AM – 10 PM{isEveningPickup ? ' · Evening bookings can return tonight or tomorrow 6 AM' : ''}
        </p>
      </div>
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
