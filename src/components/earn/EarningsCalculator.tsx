'use client';

import { useState } from 'react';
import Link from 'next/link';

const BIKE_TYPES = [
  { id: 'scooter', label: 'Scooter', emoji: '🛵', dailyRate: 399, examples: 'Activa, Access, Jupiter' },
  { id: 'bike125', label: 'Bike 125cc', emoji: '🏍️', dailyRate: 499, examples: 'CB Shine, Splendor+' },
  { id: 'bike150', label: 'Bike 150cc+', emoji: '🏁', dailyRate: 699, examples: 'Pulsar, FZ, Dominar' },
] as const;

type BikeId = typeof BIKE_TYPES[number]['id'];

function formatINR(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

export function EarningsCalculator() {
  const [bikeId, setBikeId] = useState<BikeId>('scooter');
  const [days, setDays] = useState(20);

  const bike = BIKE_TYPES.find(b => b.id === bikeId)!;
  const gross   = bike.dailyRate * days;
  const fee     = Math.round(gross * 0.20);
  const yours   = gross - fee;

  return (
    <section className="bg-white py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-3.5 py-1.5 text-xs font-semibold text-accent uppercase tracking-wider mb-4">
            Earnings Calculator
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-primary tracking-tight">
            See what your bike can earn
          </h2>
          <p className="text-muted mt-3 max-w-md mx-auto">
            Real estimates based on average utilization on our platform. Actual earnings may vary.
          </p>
        </div>

        <div className="grid md:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-8">
            {/* Bike type */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Your bike type</p>
              <div className="grid grid-cols-3 gap-3">
                {BIKE_TYPES.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setBikeId(b.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                      bikeId === b.id
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <span className="text-3xl">{b.emoji}</span>
                    <div>
                      <div className={`font-semibold text-sm ${bikeId === b.id ? 'text-accent' : 'text-primary'}`}>{b.label}</div>
                      <div className="text-[11px] text-muted leading-tight mt-0.5">{b.examples}</div>
                    </div>
                    <div className={`text-xs font-bold mt-1 ${bikeId === b.id ? 'text-accent' : 'text-muted'}`}>
                      {formatINR(b.dailyRate)}/day
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Days slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Days rented per month</p>
                <span className="font-display font-bold text-2xl text-primary">{days}</span>
              </div>
              <input
                type="range"
                min={1}
                max={30}
                value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="w-full h-2 appearance-none bg-border rounded-full accent-accent cursor-pointer"
                style={{ accentColor: '#f97316' }}
              />
              <div className="flex justify-between text-[11px] text-muted mt-1.5">
                <span>1 day</span>
                <span>15 days</span>
                <span>30 days</span>
              </div>
            </div>

            {/* Trust note */}
            <p className="text-[11px] text-muted leading-relaxed border-l-2 border-border pl-3">
              Based on typical utilization across our partner fleet. Your bike&apos;s actual utilization depends
              on availability, location, and bike condition.
            </p>
          </div>

          {/* Earnings card */}
          <div className="bg-primary rounded-2xl p-6 text-white sticky top-24">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span className="text-xs text-white/60 uppercase tracking-wider font-semibold">Monthly estimate</span>
            </div>
            <div className="text-xs text-white/40 mb-6">
              {bike.emoji} {bike.label} · {days} days rented
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-white/70 text-sm">Gross revenue</span>
                <span className="font-semibold">{formatINR(gross)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/70 text-sm">Platform fee <span className="text-white/40 text-xs">(20%)</span></span>
                <span className="text-white/60">−{formatINR(fee)}</span>
              </div>
              <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                <span className="font-semibold">Your earnings</span>
                <div className="text-right">
                  <div className="font-display font-bold text-2xl text-accent">{formatINR(yours)}</div>
                  <div className="text-xs text-white/40">per month</div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-5 text-xs text-white/60 leading-relaxed">
              Payouts processed weekly via UPI or bank transfer. Zero waiting, zero surprises.
            </div>

            <Link
              href="/vendor/signup"
              className="block w-full text-center py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Start Earning Today →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
