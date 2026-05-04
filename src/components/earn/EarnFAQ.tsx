'use client';

import { useState } from 'react';

const FAQS = [
  {
    q: 'How much can I realistically earn per month?',
    a: 'Earnings depend on your bike type and how often it gets booked. On average, a scooter rented 15–20 days/month brings in ₹4,700–₹6,400 for you after our fee. Premium bikes (150cc+) earn more — typically ₹8,000–₹11,000/month at the same utilization.',
  },
  {
    q: "What is Zodito's commission rate?",
    a: "We keep 20% of each rental. You keep 80%. That's it — no hidden fees, no listing charges, no sign-up costs. Ever.",
  },
  {
    q: 'What documents do I need to list my bike?',
    a: 'You need the bike\'s RC (Registration Certificate), valid insurance, and your PAN card. The bike should be registered in your name or your immediate family\'s name. We verify these during the approval process.',
  },
  {
    q: 'How long does the approval process take?',
    a: 'Typically 2–3 business days from when you submit your application. Our team reviews your bike details and documents. We may ask for additional photos or information if needed.',
  },
  {
    q: 'How and when do I get paid?',
    a: 'Payouts are processed every week. You can receive them via UPI (fastest — same day) or bank transfer (1–2 business days). You can track all earnings in real-time from your vendor dashboard.',
  },
  {
    q: 'What if a customer damages my bike?',
    a: "Customers pay a security deposit at pickup (₹500–₹1,000 depending on the bike). For damages beyond normal wear, the deposit covers basic repairs. We also guide you on insurance claims. Our team documents the bike's condition at pickup and return.",
  },
  {
    q: 'Can I list multiple bikes?',
    a: 'Absolutely. After your first bike is approved, you can add more bikes directly from your vendor dashboard. Each bike goes through a quick review. Many of our partners list 3–5 bikes.',
  },
  {
    q: 'What condition does my bike need to be in?',
    a: 'Your bike should be 2018 or newer (some exceptions for well-maintained older bikes), in good mechanical condition, with valid insurance and a recent service record. We do a quick inspection before approving each listing.',
  },
  {
    q: 'Can I block dates or pause my listing?',
    a: 'Yes. From your dashboard, you can freeze your bike for any date range — personal use, maintenance, or any reason. Customers will not be able to book during frozen dates. You can also deactivate a listing anytime.',
  },
  {
    q: 'What types of bikes can I list?',
    a: 'We accept most road-legal two-wheelers: scooters (Activa, Access, Jupiter, etc.), standard bikes (Splendor, CB Shine, etc.), and performance bikes (Pulsar, FZ, Dominar, etc.). We currently do not accept dirt bikes, superbikes, or bikes without valid papers.',
  },
];

export function EarnFAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="bg-bg py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 rounded-full px-3.5 py-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-4">
            FAQ
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-primary tracking-tight">
            Questions? We&apos;ve got answers.
          </h2>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={`bg-white border rounded-xl overflow-hidden transition-all ${isOpen ? 'border-accent/30 shadow-sm' : 'border-border hover:border-accent/20'}`}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
                >
                  <span className="font-semibold text-primary text-sm leading-snug">{faq.q}</span>
                  <span className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs transition-all ${
                    isOpen
                      ? 'bg-accent border-accent text-white rotate-45'
                      : 'border-border text-muted'
                  }`}>
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-sm text-muted leading-relaxed border-t border-border/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <p className="text-muted text-sm mb-3">Still have questions?</p>
          <a
            href="tel:+919392912953"
            className="inline-flex items-center gap-2 border border-border rounded-xl px-5 py-2.5 text-sm font-semibold text-primary hover:border-accent hover:text-accent transition-colors"
          >
            📞 Call us at +91 93929 12953
          </a>
        </div>
      </div>
    </section>
  );
}
