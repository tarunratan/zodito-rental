import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { WhatsAppBubble } from '@/components/layout/WhatsAppBubble';
import { hasClerkKeys, isMockMode } from '@/lib/mock';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zodito Rentals — Ride Your Way',
  description: "Hyderabad's #1 bike rental. Rent premium bikes by the hour. No hidden fees, instant booking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const useClerk = hasClerkKeys();
  const mockBanner = isMockMode();

  const body = (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {mockBanner && (
          <div className="bg-warning/15 border-b border-warning/30 text-warning text-center py-1.5 text-xs font-semibold">
            🧪 Mock Mode — using fake data. Set env vars in .env.local for real backend.
          </div>
        )}
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
        <WhatsAppBubble />
      </body>
    </html>
  );

  if (!useClerk) return body;

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#f97316',
          fontFamily: '"DM Sans", sans-serif',
          borderRadius: '10px',
        },
      }}
    >
      {body}
    </ClerkProvider>
  );
}
