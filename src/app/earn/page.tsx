import type { Metadata } from 'next';
import Link from 'next/link';
import { EarningsCalculator } from '@/components/earn/EarningsCalculator';
import { EarnFAQ } from '@/components/earn/EarnFAQ';

export const metadata: Metadata = {
  title: 'Earn with Zodito — List Your Bike, Keep 80%',
  description:
    "Turn your idle bike into monthly income. Join Zodito's partner network — we handle bookings, payments & support. You keep 80% of every rental. Apply in minutes.",
};

export default function EarnPage() {
  return (
    <div className="bg-bg">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white px-6 py-16 md:py-24"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{ background: 'radial-gradient(ellipse at top right, rgba(249,115,22,0.22), transparent 55%)' }}
        />

        <div className="relative max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 bg-accent/20 border border-accent/30 rounded-full px-3.5 py-1.5 text-xs font-semibold text-accent uppercase tracking-wider mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Zodito Partner Program
            </div>

            <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-[56px] leading-[1.05] tracking-tight">
              Your Bike Earns.
              <br />
              <span className="text-accent">You Sit Back.</span>
            </h1>

            <p className="text-base md:text-lg text-white/70 mt-5 max-w-lg leading-relaxed">
              Join 50+ bike owners earning steady income on Zodito. We bring the customers,
              handle payments, and provide 24/7 support — you keep <strong className="text-white">80%</strong> of every rental.
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              <Link
                href="/vendor/signup"
                className="btn-accent text-base px-7 py-3 font-semibold"
              >
                Start Earning Today →
              </Link>
              <a
                href="#how-it-works"
                className="btn-outline-light text-base px-6 py-3"
              >
                How it works
              </a>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-10 pt-8 border-t border-white/10 text-sm text-white/60">
              <span className="flex items-center gap-1.5"><span className="text-accent">✓</span> Zero listing fees</span>
              <span className="flex items-center gap-1.5"><span className="text-accent">✓</span> Weekly payouts</span>
              <span className="flex items-center gap-1.5"><span className="text-accent">✓</span> Dedicated partner support</span>
            </div>
          </div>

          {/* Right — sample earnings card */}
          <div className="hidden md:block">
            <div className="bg-white/5 backdrop-blur-md border border-white/15 rounded-2xl p-6 shadow-hero">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="font-display font-semibold text-lg">Sample earnings</div>
                  <div className="text-white/50 text-xs mt-0.5">Scooter · 20 days/month</div>
                </div>
                <span className="text-3xl">🛵</span>
              </div>

              <div className="space-y-2.5 text-sm mb-5">
                <EarningsRow label="Gross revenue" value="₹7,980" />
                <EarningsRow label="Platform fee (20%)" value="−₹1,596" muted />
                <div className="border-t border-white/10 pt-2.5 flex justify-between items-center">
                  <span className="font-semibold text-white">Your monthly income</span>
                  <div className="text-right">
                    <div className="font-display font-bold text-2xl text-accent">₹6,384</div>
                    <div className="text-[11px] text-white/40">per month</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="font-display font-bold text-xl text-white">80%</div>
                  <div className="text-[11px] text-white/50 mt-0.5">Goes to you</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="font-display font-bold text-xl text-white">₹0</div>
                  <div className="text-[11px] text-white/50 mt-0.5">Listing fee</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ──────────────────────────────────────────────────── */}
      <div className="bg-primary py-8 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-white">
          <StatChip num="₹6,000+" label="Avg monthly per bike" />
          <StatChip num="80%" label="Revenue to you" />
          <StatChip num="50+" label="Active partners" />
          <StatChip num="2-3 days" label="Approval time" />
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-bg py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 rounded-full px-3.5 py-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-4">
              Simple process
            </div>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-primary tracking-tight">
              Up and earning in 3 steps
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* Connector line (desktop only) */}
            <div
              aria-hidden
              className="hidden md:block absolute top-10 left-[calc(16.5%+1rem)] right-[calc(16.5%+1rem)] h-px border-t-2 border-dashed border-border"
            />

            <Step num="01" icon="📋" title="Apply online" desc="Fill the simple form with your bike details, pickup area, and payout info. Takes under 5 minutes." />
            <Step num="02" icon="✅" title="Get approved" desc="Our team reviews your application and bike details. Most partners get approved within 2-3 business days." />
            <Step num="03" icon="💰" title="Start earning" desc="Your bike goes live on Zodito. Customers book, we collect payment, your 80% hits your UPI every week." />
          </div>
        </div>
      </section>

      {/* ── EARNINGS CALCULATOR ──────────────────────────────────────────── */}
      <EarningsCalculator />

      {/* ── WHAT YOU GET ─────────────────────────────────────────────────── */}
      <section className="bg-bg py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 rounded-full px-3.5 py-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-4">
              Partner benefits
            </div>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-primary tracking-tight">
              Everything you need to succeed
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Benefit icon="💰" title="80% Revenue Share" desc="The most generous split in Hyderabad. You do the work of owning a bike — you deserve most of the reward." />
            <Benefit icon="🚫" title="Zero Listing Fees" desc="No upfront cost. No monthly fee. No hidden charges. You only pay (20%) when you earn." />
            <Benefit icon="⚡" title="24/7 Bookings" desc="Your bike earns even while you sleep. Customers browse and book any time — weekends, holidays, late nights." />
            <Benefit icon="📊" title="Live Dashboard" desc="See every booking, every payout, and your bike's performance in real-time from your vendor dashboard." />
            <Benefit icon="🔒" title="Secure Collections" desc="We handle all customer payments, verify identities, and collect security deposits before handover." />
            <Benefit icon="📞" title="Partner Support" desc="Dedicated WhatsApp line for partners. Questions, disputes, or help with a booking — we're always reachable." />
          </div>
        </div>
      </section>

      {/* ── REQUIREMENTS ─────────────────────────────────────────────────── */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 rounded-full px-3.5 py-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-4">
                What we need
              </div>
              <h2 className="font-display font-bold text-2xl md:text-3xl text-primary tracking-tight mb-4">
                Simple requirements, fast approval
              </h2>
              <p className="text-muted text-sm leading-relaxed">
                We keep the bar fair — good paperwork and a road-ready bike is all it takes. No inspection visits, no complex audits.
              </p>
            </div>

            <div className="space-y-3">
              <RequirementRow icon="📄" label="Valid RC" desc="Registered in your name or family's name" />
              <RequirementRow icon="🛡️" label="Active insurance" desc="Comprehensive or at least third-party" />
              <RequirementRow icon="🪪" label="PAN card" desc="For KYC and payout verification" />
              <RequirementRow icon="📅" label="Bike age" desc="2018 or newer preferred (exceptions considered)" />
              <RequirementRow icon="🔧" label="Good condition" desc="Mechanically sound, no major damage" />
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <EarnFAQ />

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white px-6 py-20 text-center"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.20), transparent 60%)' }}
        />
        <div className="relative max-w-2xl mx-auto">
          <div className="font-display font-bold text-4xl md:text-5xl leading-tight tracking-tight mb-4">
            Ready to start <span className="text-accent">earning?</span>
          </div>
          <p className="text-white/70 text-lg mb-8 leading-relaxed">
            Apply in 5 minutes. Get approved in 2-3 days. Earn every week.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/vendor/signup"
              className="btn-accent text-base px-8 py-3.5 font-semibold"
            >
              Apply as a Partner →
            </Link>
            <a
              href="tel:+919392912953"
              className="btn-outline-light text-base px-6 py-3.5"
            >
              Talk to us first
            </a>
          </div>
          <p className="text-white/40 text-xs mt-6">
            No upfront fees · 80% revenue share · Cancel anytime
          </p>
        </div>
      </section>

    </div>
  );
}

/* ── Small server components ──────────────────────────────────────────── */

function EarningsRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={muted ? 'text-white/50' : 'text-white/70'}>{label}</span>
      <span className={muted ? 'text-white/50' : 'text-white font-medium'}>{value}</span>
    </div>
  );
}

function StatChip({ num, label }: { num: string; label: string }) {
  return (
    <div className="py-2">
      <div className="font-display font-bold text-2xl md:text-3xl text-accent">{num}</div>
      <div className="text-xs text-white/50 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function Step({ num, icon, title, desc }: { num: string; icon: string; title: string; desc: string }) {
  return (
    <div className="card p-6 relative">
      <div className="w-10 h-10 rounded-full bg-accent text-white font-display font-bold text-sm flex items-center justify-center mb-4 relative z-10">
        {num}
      </div>
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-display font-semibold text-primary text-lg mb-2">{title}</h3>
      <p className="text-muted text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function Benefit({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card p-5 hover:border-accent/30 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-xl mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-primary text-sm mb-1">{title}</h3>
      <p className="text-muted text-xs leading-relaxed">{desc}</p>
    </div>
  );
}

function RequirementRow({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-bg border border-border">
      <span className="text-xl shrink-0">{icon}</span>
      <div>
        <div className="font-semibold text-primary text-sm">{label}</div>
        <div className="text-muted text-xs mt-0.5">{desc}</div>
      </div>
      <span className="ml-auto text-success text-sm shrink-0">✓</span>
    </div>
  );
}
