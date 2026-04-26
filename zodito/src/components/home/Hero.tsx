import Link from 'next/link';

export function Hero() {
  return (
    <section
      className="relative overflow-hidden text-white px-6 py-14 md:py-20"
      style={{
        background:
          'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      }}
    >
      {/* subtle radial highlight */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top right, rgba(249,115,22,0.18), transparent 50%)',
        }}
      />

      <div className="relative max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-3.5 py-1.5 text-xs font-medium text-white/90 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Hyderabad&apos;s #1 Rental Platform
          </div>

          <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Ride Your <span className="text-accent">Way</span>.
            <br />
            Rent With Ease.
          </h1>

          <p className="text-base md:text-lg text-white/70 mt-5 max-w-lg leading-relaxed">
            Premium bikes, transparent pricing, zero hidden fees. Pick up today, ride anywhere in the city.
          </p>

          <div className="flex flex-wrap gap-3 mt-7">
            <Link href="#browse" className="btn-accent text-base px-6 py-3">
              Browse Bikes
            </Link>
            <a href="tel:+919392912953" className="btn-outline-light text-base px-6 py-3">
              Call Us
            </a>
          </div>

          <div className="flex gap-6 mt-10 pt-6 border-t border-white/10">
            <Stat num="500+" label="Happy Riders" />
            <Stat num="50+" label="Bikes Ready" />
            <Stat num="4.8★" label="Avg Rating" />
          </div>
        </div>

        {/* Right-side feature card stack */}
        <div className="relative hidden md:block">
          <div className="bg-white/5 backdrop-blur-md border border-white/15 rounded-2xl p-6 shadow-hero">
            <div className="font-display font-semibold text-xl mb-1">Why Zodito?</div>
            <p className="text-white/60 text-sm mb-5">Everything you need, nothing you don&apos;t.</p>
            <ul className="space-y-3 text-sm">
              <Perk icon="⚡" title="Instant Booking" desc="No paperwork delays. Book in under 2 minutes." />
              <Perk icon="💰" title="Fair, Flat Pricing" desc="Fixed packages from 12 hrs to 30 days." />
              <Perk icon="🛡️" title="Verified Fleet" desc="All bikes serviced, insured &amp; ready to ride." />
              <Perk icon="📞" title="Real Human Support" desc="WhatsApp, call — we&apos;re always reachable." />
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ num, label }: { num: string; label: string }) {
  return (
    <div>
      <div className="font-display font-bold text-2xl text-white">{num}</div>
      <div className="text-xs text-white/55 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Perk({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <div className="w-9 h-9 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <div className="font-semibold text-white text-sm">{title}</div>
        <div className="text-white/60 text-xs">{desc}</div>
      </div>
    </li>
  );
}
