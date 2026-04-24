import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-primary text-white/70 pt-14 pb-8 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
        <div>
          <div className="font-display font-bold text-lg text-white tracking-tight mb-3">
            Zodito<span className="text-accent">Rentals</span>
          </div>
          <p className="text-sm leading-relaxed">
            Hyderabad&apos;s trusted bike rental platform. Premium bikes, fair pricing, zero hassle.
          </p>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm uppercase tracking-wide mb-4">
            Quick Links
          </h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/" className="hover:text-accent transition-colors">Browse Bikes</Link></li>
            <li><Link href="/my-bookings" className="hover:text-accent transition-colors">My Bookings</Link></li>
            <li><Link href="/vendor/signup" className="hover:text-accent transition-colors">List Your Bike</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm uppercase tracking-wide mb-4">
            Support
          </h4>
          <ul className="space-y-2 text-sm">
            <li><a href="#" className="hover:text-accent transition-colors">Help Center</a></li>
            <li><a href="#" className="hover:text-accent transition-colors">Rental Policy</a></li>
            <li><a href="#" className="hover:text-accent transition-colors">Terms &amp; Conditions</a></li>
            <li><a href="#" className="hover:text-accent transition-colors">Privacy Policy</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm uppercase tracking-wide mb-4">
            Contact
          </h4>
          <ul className="space-y-2 text-sm">
            <li>📞 <a href="tel:+919392912953" className="hover:text-accent transition-colors">+91 93929 12953</a></li>
            <li>📍 KPHB, Hyderabad</li>
            <li>🕐 6:00 AM – 10:30 PM</li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-6 border-t border-white/10 text-center text-xs text-white/50">
        © {new Date().getFullYear()} Zodito Rentals. All rights reserved.
      </div>
    </footer>
  );
}
