# Zodito Rentals

Production-grade bike rental platform for Hyderabad — customer booking flow, vendor dashboard, and admin panel in a single Next.js app

---

## Tech Stack

### Framework & Language
| Tech | Version | Role |
|---|---|---|
| **Next.js** | 14.2 (App Router) | Full-stack React framework — pages, API routes, server actions, middleware |
| **React** | 18.3 | UI library |
| **TypeScript** | 5.6 (strict mode) | Type safety across the entire codebase |
| **Node.js** | 18+ | Runtime |

`tsconfig.json` runs in strict mode with the `@/*` path alias resolving to `./src/*`.

### Styling
| Tech | Version | Role |
|---|---|---|
| **Tailwind CSS** | 3.4 | Utility-first styling |
| **PostCSS** + **Autoprefixer** | 8 / 10 | CSS pipeline |
| **clsx** + **tailwind-merge** | 2.x | Conditional class composition |

Custom design tokens live in `tailwind.config.ts` — primary navy `#1a1a2e`, accent orange `#f97316`, fonts `Sora` (display) and `DM Sans` (body), and a `card` border radius of `14px`.

### Database & Backend
| Tech | Version | Role |
|---|---|---|
| **Supabase (Postgres)** | — | Primary database, storage buckets, Row Level Security |
| **@supabase/ssr** | 0.5 | Server-side cookie-based session handling |
| **@supabase/supabase-js** | 2.45 | Browser + server clients |

The schema lives in `supabase/migrations/` (43 numbered SQL files) and is applied in order. Highlights:
- **Atomic double-booking prevention** via a Postgres `EXCLUDE USING GIST` constraint on `tstzrange(start_ts, end_ts, '[)')` — physically impossible for two overlapping active bookings to coexist.
- **Row Level Security** policies separating customer / vendor / admin access.
- **SQL functions** for pricing, freeze logic, KYC, expiring unpaid bookings, bike-state derivation, and realtime triggers.
- **Storage buckets**: `bike-photos` (public), `kyc-docs` (authenticated-only).

### Authentication
| Tech | Version | Role |
|---|---|---|
| **Clerk** (`@clerk/nextjs`) | 6.x | Auth provider — phone OTP, Google, email |
| **svix** | 1.38 | Verifies signed webhook payloads from Clerk |

Clerk issues a JWT signed with the **Supabase JWT secret** (template name: `supabase`) so Supabase RLS policies can read `auth.uid()` directly. A Clerk webhook at `/api/webhooks/clerk` syncs `user.created / updated / deleted` into the `users` table.

### Payments
| Tech | Version | Role |
|---|---|---|
| **Razorpay** | 2.9 | Checkout (orders + payments) |
| Webhook | — | Signature-verified at `/api/webhooks/razorpay` |

Pending bookings are created with a `payment_deadline` 10 minutes out; the `expire_unpaid_bookings()` SQL function (run via `pg_cron`) flips them to `payment_failed`.

### Email
| Tech | Version | Role |
|---|---|---|
| **Resend** | 3.5 | Transactional email (booking confirmations, KYC status, etc.) |

### Validation & Utilities
| Tech | Version | Role |
|---|---|---|
| **Zod** | 3.23 | Runtime schema validation for API inputs and webhook payloads |
| **date-fns** | 4.1 | Date math for booking windows, pricing tiers, freeze periods |

### Tooling
| Tech | Version | Role |
|---|---|---|
| **Vitest** | 2.1 | Unit tests (`src/lib/__tests__`) — node environment, `@/*` alias |
| **ESLint** | 8.57 + `eslint-config-next` | Linting |
| **TypeScript** `--noEmit` | 5.6 | Typecheck-only build (`npm run typecheck`) |

---

## Scripts

```bash
npm run dev         # Next dev server on :3000
npm run build       # Production build
npm run start       # Run the built app
npm run lint        # Next/ESLint
npm run typecheck   # tsc --noEmit
npm run test        # Vitest run
npm run test:watch  # Vitest watch mode
```

---

## Folder Structure

```
zodito-rental/
├── src/
│   ├── app/                    Next.js App Router
│   │   ├── api/                Server endpoints
│   │   │   ├── admin/          Admin actions (vendors, bikes, KYC, bookings)
│   │   │   ├── auth/           Auth helpers
│   │   │   ├── bikes/          Bike CRUD + availability
│   │   │   ├── bookings/       Create / cancel / extend / handover
│   │   │   ├── coupons/        Coupon validation + admin
│   │   │   ├── kyc/            Customer KYC submission + admin review
│   │   │   ├── pricing/        Price calculation endpoint
│   │   │   ├── vendor/         Vendor dashboard data
│   │   │   ├── webhooks/       clerk, razorpay
│   │   │   └── debug/          Dev-only inspectors
│   │   ├── admin/              Admin panel (4 tabs)
│   │   ├── bikes/              Browse + detail + booking flow
│   │   ├── my-bookings/        Customer bookings
│   │   ├── kyc/                KYC upload
│   │   ├── vendor/             Vendor dashboard + signup + list-a-bike
│   │   ├── profile/            User profile
│   │   ├── sign-in/, sign-up/  Clerk-rendered auth pages
│   │   └── earn/               Vendor onboarding marketing
│   ├── components/             React components, grouped by feature
│   ├── lib/
│   │   ├── supabase/           Browser, server-RLS, and admin clients
│   │   ├── auth.ts             Clerk → app user resolution
│   │   ├── pricing.ts          All price math (tiers, weekend overrides, commission)
│   │   ├── razorpay.ts         Payment helpers + signature verification
│   │   ├── booking-overlap.ts  Server-side overlap pre-check
│   │   ├── coupon-eligibility.ts
│   │   ├── extension-pricing.ts
│   │   ├── handover-audit.ts
│   │   ├── freeze.ts           Bike freeze (out-of-service) logic
│   │   ├── bike-state.ts       Derived bike state for UI
│   │   ├── email.ts            Resend wrapper
│   │   ├── mock.ts             Mock-mode fixtures
│   │   ├── utils.ts            cn() + shared helpers
│   │   └── __tests__/          Vitest specs
│   ├── types/                  Shared TS types
│   └── middleware.ts           Clerk auth middleware
├── supabase/
│   ├── migrations/             43 numbered SQL migrations — apply in order
│   └── seed.sql                Sample bikes for dev
├── tailwind.config.ts
├── next.config.js
├── postcss.config.js
├── vitest.config.ts
└── tsconfig.json
```

---

## Quick Start (Mock Mode — zero config)

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. A yellow **"Mock Mode"** banner and a **🛠 Dev Panel** appear when no `NEXT_PUBLIC_SUPABASE_URL` is set. Switch between Customer / Vendor / Admin from the panel — all data comes from `src/lib/mock.ts` and resets on restart.

---

## Full Setup (real backend)

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run every file in `supabase/migrations/` **in numeric order** (`001` → `043`).
3. (Optional) Run `supabase/seed.sql` for sample bikes.
4. Create two storage buckets: `bike-photos` (public) and `kyc-docs` (authenticated read).
5. Copy URL, anon key, service role key, and JWT secret into `.env.local`.

### 2. Clerk
1. Create an app at [clerk.com](https://clerk.com) and enable Phone OTP / Google / Email.
2. **JWT template** named `supabase`, algorithm `HS256`, signing key = your Supabase JWT secret. Claims:
   ```json
   { "role": "authenticated", "aud": "authenticated" }
   ```
3. **Webhook** → `https://yourdomain/api/webhooks/clerk`, subscribe to `user.created / updated / deleted`. Save the signing secret as `CLERK_WEBHOOK_SECRET`.

### 3. Razorpay
1. Create test keys at [razorpay.com](https://razorpay.com) → fill `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
2. Webhook → `https://yourdomain/api/webhooks/razorpay`, events `payment.captured / payment.failed / order.paid`. Save secret as `RAZORPAY_WEBHOOK_SECRET`.

### 4. Resend
- Create an API key at [resend.com](https://resend.com) → `RESEND_API_KEY`.

### 5. Promote yourself to admin
```sql
update users set role = 'admin' where email = 'you@example.com';
```

### 6. Cron for booking expiry
```sql
select cron.schedule('expire-bookings', '* * * * *', 'select expire_unpaid_bookings()');
```

### 7. Run
```bash
npm run dev
```

---

## Deployment

**Vercel** is the intended host:
1. Push to GitHub → import in Vercel.
2. Add every env var from `.env.example`.
3. Update Clerk + Razorpay webhook URLs to your Vercel domain.
4. Deploy.

---

## Architecture Highlights

- **Atomic booking integrity** — `EXCLUDE USING GIST (bike_id WITH =, tstzrange(start_ts, end_ts, '[)') WITH &&)` enforces no-overlap at the storage layer. No app-level locking required.
- **RLS-driven authorization** — Clerk-issued JWT carries `auth.uid()`; Supabase policies (in `002_rls.sql` and follow-ups) decide what each role can read/write. The "admin" client bypasses RLS for server-side operations only.
- **Pricing engine** — `lib/pricing.ts` handles 5 tiers, weekend overrides (Activa 4G/5G match 6G on weekends), helmet add-ons, GST, security deposit, and commission split (vendor 80% of base, platform keeps the rest + extras).
- **Mock Mode** — toggled automatically when `NEXT_PUBLIC_SUPABASE_URL` is absent, lets designers iterate on UI without any backend.
