// ============================================================================
// MOCK MODE
// ============================================================================
// When NEXT_PUBLIC_MOCK_MODE=true (or when no Supabase/Clerk env vars are set),
// the app serves hardcoded data so you can preview and tune the UI without
// setting up any backend services.
//
// To enable: add `NEXT_PUBLIC_MOCK_MODE=true` to .env.local  (or just leave
// Supabase/Clerk env vars empty — we auto-detect that and switch to mock mode).
// ============================================================================

export function isMockMode(): boolean {
  if (process.env.NEXT_PUBLIC_MOCK_MODE === 'true') return true;
  // Auto-detect: no Supabase URL means we can't talk to a real DB
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return true;
  return false;
}

// ---- In-memory store for mock mode (resets on server restart) ----
// Bookings created in mock mode end up here so /my-bookings can show them.
export const mockBookingsStore: any[] = [];

// ---- Mock user ----
export const MOCK_USER = {
  id: 'mock-user-id',
  auth_id: 'mock-auth-id',
  email: 'dev@zodito.local',
  phone: '+919000000000',
  first_name: 'Dev',
  last_name: 'User',
  role: 'admin' as 'customer' | 'vendor' | 'admin',
  kyc_status: 'approved' as 'not_submitted' | 'pending' | 'approved' | 'rejected',
  dl_number: 'TS0120230001234',
  dl_photo_url: null,
  aadhaar_photo_url: null,
  selfie_with_dl_photo_url: null,
  kyc_submitted_at: new Date().toISOString(),
  kyc_reviewed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ---- Mock bikes ----
// Shape matches what HomePage fetches from Supabase
export const MOCK_BIKES = [
  {
    id: 'bike-1',
    emoji: '🛵',
    image_url: null,
    color: 'Pearl White',
    color_hex: '#f0f0f0',
    year: 2023,
    total_rides: 42,
    rating_avg: 4.8,
    rating_count: 38,
    owner_type: 'platform',
    model: {
      id: 'm-activa6g', name: 'activa_6g', display_name: 'Honda Activa 6G', category: 'scooter', cc: 110,
      packages: [
        { tier: '12hr', price: 349,  km_limit: 100 },
        { tier: '24hr', price: 499,  km_limit: 140 },
        { tier: '7day', price: 2200, km_limit: 1000 },
        { tier: '15day',price: 4000, km_limit: 2000 },
        { tier: '30day',price: 6499, km_limit: 4000 },
      ],
    },
    vendor: null,
  },
  {
    id: 'bike-2',
    emoji: '🛵',
    image_url: null,
    color: 'Matte Black',
    color_hex: '#1a1a1a',
    year: 2023,
    total_rides: 28,
    rating_avg: 4.7,
    rating_count: 22,
    owner_type: 'platform',
    model: {
      id: 'm-dio', name: 'dio', display_name: 'Honda Dio', category: 'scooter', cc: 110,
      packages: [
        { tier: '12hr', price: 349,  km_limit: 100 },
        { tier: '24hr', price: 499,  km_limit: 140 },
        { tier: '7day', price: 2200, km_limit: 1000 },
        { tier: '15day',price: 4000, km_limit: 2000 },
        { tier: '30day',price: 6499, km_limit: 4000 },
      ],
    },
    vendor: null,
  },
  {
    id: 'bike-3',
    emoji: '🛵',
    image_url: null,
    color: 'Silver',
    color_hex: '#c0c0c0',
    year: 2021,
    total_rides: 156,
    rating_avg: 4.5,
    rating_count: 134,
    owner_type: 'platform',
    model: {
      id: 'm-activa5g', name: 'activa_5g', display_name: 'Honda Activa 5G', category: 'scooter', cc: 110,
      packages: [
        { tier: '12hr', price: 349,  km_limit: 100 },
        { tier: '24hr', price: 449,  km_limit: 140 },
        { tier: '7day', price: 2200, km_limit: 1000 },
        { tier: '15day',price: 4000, km_limit: 2000 },
        { tier: '30day',price: 6499, km_limit: 4000 },
      ],
    },
    vendor: null,
  },
  {
    id: 'bike-4',
    emoji: '🏍️',
    image_url: null,
    color: 'Racing Red',
    color_hex: '#dc2626',
    year: 2022,
    total_rides: 89,
    rating_avg: 4.6,
    rating_count: 71,
    owner_type: 'platform',
    model: {
      id: 'm-pulsar', name: 'pulsar_150', display_name: 'Bajaj Pulsar 150', category: 'bike_sub150', cc: 150,
      packages: [
        { tier: '12hr', price: 499,  km_limit: 120 },
        { tier: '24hr', price: 799,  km_limit: 160 },
        { tier: '7day', price: 3000, km_limit: 1000 },
        { tier: '15day',price: 5499, km_limit: 2000 },
        { tier: '30day',price: 7999, km_limit: 4000 },
      ],
    },
    vendor: null,
  },
  {
    id: 'bike-5',
    emoji: '🏍️',
    image_url: null,
    color: 'Racing Blue',
    color_hex: '#1d4ed8',
    year: 2024,
    total_rides: 12,
    rating_avg: 4.9,
    rating_count: 11,
    owner_type: 'platform',
    model: {
      id: 'm-r15v4', name: 'r15v4', display_name: 'Yamaha R15 V4', category: 'bike_plus150', cc: 155,
      packages: [
        { tier: '12hr', price: 799,   km_limit: 130 },
        { tier: '24hr', price: 1299,  km_limit: 180 },
        { tier: '7day', price: 5999,  km_limit: 1000 },
        { tier: '15day',price: 9999,  km_limit: 2000 },
        { tier: '30day',price: 15999, km_limit: 4000 },
      ],
    },
    vendor: null,
  },
  {
    id: 'bike-6',
    emoji: '🏍️',
    image_url: null,
    color: 'Midnight',
    color_hex: '#1a1a2e',
    year: 2023,
    total_rides: 67,
    rating_avg: 4.9,
    rating_count: 54,
    owner_type: 'platform',
    model: {
      id: 'm-re350', name: 'royal_enfield_350', display_name: 'Royal Enfield Classic 350', category: 'bike_plus150', cc: 350,
      packages: [
        { tier: '12hr', price: 999,   km_limit: 140 },
        { tier: '24hr', price: 1499,  km_limit: 200 },
        { tier: '7day', price: 6999,  km_limit: 1000 },
        { tier: '15day',price: 11999, km_limit: 2000 },
        { tier: '30day',price: 18999, km_limit: 4000 },
      ],
    },
    vendor: null,
  },
  {
    id: 'bike-7',
    emoji: '🏍️',
    image_url: null,
    color: 'Gunmetal',
    color_hex: '#374151',
    year: 2023,
    total_rides: 45,
    rating_avg: 4.7,
    rating_count: 39,
    owner_type: 'vendor',
    model: {
      id: 'm-re350', name: 'royal_enfield_350', display_name: 'Royal Enfield Classic 350', category: 'bike_plus150', cc: 350,
      packages: [
        { tier: '12hr', price: 999,   km_limit: 140 },
        { tier: '24hr', price: 1499,  km_limit: 200 },
        { tier: '7day', price: 6999,  km_limit: 1000 },
        { tier: '15day',price: 11999, km_limit: 2000 },
        { tier: '30day',price: 18999, km_limit: 4000 },
      ],
    },
    vendor: { id: 'v-1', business_name: 'Ravi Rentals', pickup_area: 'Kukatpally' },
  },
  {
    id: 'bike-8',
    emoji: '🏍️',
    image_url: null,
    color: 'Silver',
    color_hex: '#c0c0c0',
    year: 2022,
    total_rides: 34,
    rating_avg: 4.4,
    rating_count: 28,
    owner_type: 'vendor',
    model: {
      id: 'm-shine', name: 'shine_glamour', display_name: 'Honda CB Shine / Glamour', category: 'scooter', cc: 125,
      packages: [
        { tier: '12hr', price: 349,  km_limit: 100 },
        { tier: '24hr', price: 499,  km_limit: 140 },
        { tier: '7day', price: 2200, km_limit: 1000 },
        { tier: '15day',price: 4000, km_limit: 2000 },
        { tier: '30day',price: 6499, km_limit: 4000 },
      ],
    },
    vendor: { id: 'v-2', business_name: 'Krishna Bikes', pickup_area: 'Miyapur' },
  },
];
