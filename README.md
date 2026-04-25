# Zodito Rentals

Production-grade bike rental platform for Hyderabad. Next.js 14 + Supabase + Clerk + Razorpay.

> **Complete build (all 3 chunks)** — customer flow + vendor dashboard + admin panel. Ready to deploy.

---

## What's included

### Customer flow
✅ Home page with hero + filterable browse grid
✅ Bike detail page with full specs + 5 tier pricing
✅ Booking flow — tier picker, date/time picker, helmet add-ons
✅ Live order summary with GST + deposit breakdown
✅ Razorpay Checkout integration
✅ Payment webhook with signature verification
✅ My Bookings page with Upcoming/Past sections + cancel flow
✅ KYC upload (DL + Aadhaar + selfie-with-DL)
✅ KYC enforcement — blocks checkout until admin approves

### Vendor flow
✅ Public vendor signup with full application form
✅ Vendor dashboard with earnings KPIs
✅ Bookings table showing customer contact info (post-payment)
✅ Net earnings breakdown (gross − commission = payout)
✅ List-a-bike form (pick model from master list)
✅ Status tracking (pending / approved / rejected / inactive)

### Admin panel (one screen, 4 tabs)
✅ KPI strip (pending vendors, bikes, KYC, active rentals)
✅ **Vendors tab** — approve / reject applications with notes
✅ **Bikes tab** — approve / reject vendor bike listings
✅ **KYC tab** — review 3 documents side-by-side, click to zoom, approve/reject
✅ **Bookings tab** — filter by status, search, mark picked-up/returned/refunded

### Foundation
✅ Next.js 14 (App Router) + TypeScript + Tailwind
✅ Complete Supabase schema with master pricing (8 models × 5 tiers)
✅ Row Level Security policies for customer / vendor / admin
✅ Atomic double-booking prevention (Postgres exclusion constraint)
✅ Clerk auth + user sync webhook
✅ Pricing engine with weekend override + commission splits
✅ Nav, Footer, WhatsApp bubble matching prototype theme
✅ **Mock Mode** — run with zero config, switch roles via Dev Panel

---

## Test everything in Mock Mode (no setup required)

```bash
unzip zodito-chunk3.zip
cd zodito
npm install
npm run dev
```

Open `localhost:3000`. You'll see the yellow **"Mock Mode"** banner and a **🛠 Dev Panel** in the bottom-right.

**Switch roles with the Dev Panel** to test different flows:

| Role | What you can test |
|------|-------------------|
| **Customer** (default) | Browse → Book → Pay (mock) → See booking → Cancel |
| **Vendor** | Dashboard with earnings, pending bikes, list a new bike |
| **Admin** | Approve vendors, approve bikes, review KYC, manage bookings |

Mock data resets when the dev server restarts — expected.

### Full end-to-end test

1. Start as **customer** — browse, click a bike, pick 24hr tier, pick tomorrow at 10 AM, add 1 helmet, click Pay → you're taken to My Bookings with a success toast
2. Visit `/kyc` — upload 3 dummy images, submit → status = pending
3. Switch to **admin** → KYC tab → see your submission → click approve
4. Switch to **vendor** → visit `/vendor/signup` → fill the form → submit → you become pending
5. Switch to **admin** → Vendors tab → approve your application
6. Switch back to **vendor** → `/vendor` dashboard → click "+ List a bike" → pick a model → submit
7. Switch to **admin** → Bikes tab → approve your listing
8. Switch to **customer** → your new bike appears in browse!

---

## Full setup (real backend)

### 1. Install

```bash
npm install
```

### 2. Supabase

---

## Setup

### Fastest path: Mock Mode (zero config — UI preview only)

Want to see the UI and tune styles without setting up Supabase, Clerk, or Razorpay?

```bash
npm install
npm run dev
```

That's it. Open `localhost:3000`. You'll see:
- A yellow "🧪 Mock Mode" banner at the top
- 8 fake bikes from `src/lib/mock.ts` in the browse grid
- Login/Sign Up buttons are disabled (placeholder only)

In mock mode **no backend calls are made** — everything comes from `src/lib/mock.ts`. Perfect for:
- Tuning colors, spacing, typography
- Iterating on component design
- Showing the UI to others without deploying

To exit mock mode, add real env vars (see below). Mock mode auto-disables as soon as `NEXT_PUBLIC_SUPABASE_URL` is set.

---

### Full setup (real backend)

#### 1. Install

```bash
npm install
```

#### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy your project URL, anon key, service role key, and JWT secret into `.env.local`.
3. In the SQL Editor, run migrations **in order**:
   ```
   supabase/migrations/001_schema.sql
   supabase/migrations/002_rls.sql
   supabase/migrations/003_master_pricing.sql
   supabase/migrations/004_functions.sql
   supabase/migrations/005_kyc_selfie.sql
   ```
4. (Optional, for dev) Run `supabase/seed.sql` to add sample platform bikes.
5. **Storage:** create two public buckets — `bike-photos` and `kyc-docs` (we'll use these in Chunk 2). Set `kyc-docs` to authenticated-only read.

### 3. Clerk

1. Create an app at [clerk.com](https://clerk.com).
2. Enable sign-in methods: Phone (OTP) + Google + Email (your call).
3. Copy publishable key & secret key into `.env.local`.
4. **Create a JWT template named `supabase`:**
   - Clerk dashboard → JWT Templates → New → Name: `supabase`
   - Algorithm: `HS256`
   - Signing key: paste your **Supabase JWT secret** (Supabase → Settings → API → JWT Settings → JWT Secret)
   - Claims:
     ```json
     {
       "role": "authenticated",
       "aud": "authenticated"
     }
     ```
5. **Set up the webhook:**
   - Clerk dashboard → Webhooks → New endpoint
   - URL: `https://yourdomain.com/api/webhooks/clerk` (for local dev use [ngrok](https://ngrok.com) or similar)
   - Subscribe to: `user.created`, `user.updated`, `user.deleted`
   - Copy signing secret → `CLERK_WEBHOOK_SECRET`

### 4. Razorpay

1. Sign up at [razorpay.com](https://razorpay.com).
2. Generate API keys (Test mode first): Dashboard → Settings → API Keys.
3. Fill `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
4. Webhooks (we'll wire these up in Chunk 2): Settings → Webhooks → Create.
   - URL: `https://yourdomain.com/api/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed`, `order.paid`
   - Copy secret → `RAZORPAY_WEBHOOK_SECRET`

### 5. Make yourself admin

After signing up once, run in Supabase SQL editor:

```sql
update users set role = 'admin' where email = 'your@email.com';
```

### 6. Run

```bash
npm run dev
```

---

## Deployment (Vercel)

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add all env vars from `.env.example`.
4. Update webhook URLs in Clerk + Razorpay dashboards to your Vercel URL.
5. Deploy.

---

## Architecture notes

### Why the exclusion constraint matters
The line in `001_schema.sql`:
```sql
exclude using gist (bike_id with =, tstzrange(start_ts, end_ts, '[)') with &&)
```
makes it **physically impossible** for two overlapping active bookings on the same bike to coexist in the database. Even if 10 users click "Book" at the exact same millisecond, Postgres will atomically accept one and reject the others. No application-level locking, no race conditions.

### Pricing override logic
Activa 4G/5G has cheaper weekday pricing but the rate card says weekends match Activa 6G. The `bike_models.has_weekend_override` + `weekend_override_model_id` fields plus `effectiveModelIdForDate()` in `lib/pricing.ts` handle this transparently — the booking flow always uses the right prices.

### Commission model
Vendors get 80% of the base rental price. Platform keeps:
- 20% of base rental (commission)
- 100% of extra helmet charges
- GST (passed through to government)
- Security deposit (refunded manually by admin)

See `splitCommission()` in `lib/pricing.ts`.

### Payment timeout
Bookings are created with `status='pending_payment'` and a `payment_deadline` 10 minutes out. The `expire_unpaid_bookings()` DB function marks them as `payment_failed` when the deadline passes. You can schedule this via Supabase's scheduled functions or `pg_cron`:
```sql
select cron.schedule('expire-bookings', '* * * * *', 'select expire_unpaid_bookings()');
```

Per your config, payment-failed bookings require **manual admin review for refund** — they show up in the admin panel as "Needs refund review."

---

## Folder structure

```
zodito/
├── supabase/migrations/   SQL — run in order
├── src/
│   ├── app/               Routes (App Router)
│   │   ├── api/           Server endpoints
│   │   ├── layout.tsx     Root layout
│   │   └── page.tsx       Home page
│   ├── components/        React components, grouped by feature
│   ├── lib/
│   │   ├── supabase/      DB clients (browser, server RLS, admin)
│   │   ├── auth.ts        Clerk → app user resolution
│   │   ├── pricing.ts     All price math
│   │   ├── razorpay.ts    Payment helpers
│   │   └── utils.ts       Shared utilities
│   └── middleware.ts      Clerk auth middleware
├── .env.example           All env vars documented
└── README.md
```
