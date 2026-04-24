# Zodito Rentals — Project Brief for AI Assistants

> **If you're an AI assistant (Claude, Copilot, Cursor, etc.) — read this file first.**
> It gives you everything you need to help productively without re-explanation.
> Last updated: 2026-04-24

---

## Elevator pitch (10 seconds)

Hyderabad-based bike rental platform. Single branch (KPHB). Customers rent bikes by 12hr/24hr/7day/15day/30day packages. Vendors can also list their own bikes (admin-approved, 80/20 revenue split). Live at **https://www.zoditorentals.com**.

## Stack

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS
- **Auth:** Clerk (phone OTP, Google, email)
- **DB:** Supabase (Postgres) + Row Level Security
- **Storage:** Supabase Storage (bike photos, KYC docs)
- **Payments:** Razorpay (order + checkout widget + webhook)
- **Hosting:** Vercel
- **Design tokens:** navy `#1a1a2e`, orange `#f97316`, Sora display + DM Sans body

## Repo

- Code: https://github.com/tarunratan/zodito-rental
- Live: https://www.zoditorentals.com

---

## User roles

Three roles on one `users` table, selected via `role` column (enum):

| Role | Can do |
|------|--------|
| `customer` | Browse, book, pay, view own bookings, submit KYC |
| `vendor` | Everything customer can + list bikes, see bookings on their bikes, see earnings |
| `admin` | Everything + approve vendors, approve vendor bike listings, approve KYC, manage all bookings, mark refunds |

Promotion: approving a vendor application flips the user's `role` from `customer` → `vendor`. Admins are set manually via SQL.

## Key domain rules (non-obvious ones)

1. **Store hours:** 6:00 AM – 10:30 PM IST. Bookings outside this window are rejected.
2. **Master pricing:** 8 bike models, each with 5 tier prices. Vendors pick a model and inherit the pricing — they **do not** set their own prices. See `supabase/migrations/003_master_pricing.sql`.
3. **Weekend override:** Activa 4G/5G is priced the same as Activa 6G on weekends. Handled via `bike_models.has_weekend_override` + `weekend_override_model_id` columns.
4. **Double-booking prevention:** enforced atomically at the DB layer via a Postgres GIST exclusion constraint on `(bike_id, tstzrange(start_ts, end_ts))` for active statuses. Two users clicking "Book" at the same millisecond → one wins, one gets a friendly 409 error. **Do not replace this with application-level locking.**
5. **Payment timeout:** bookings are `pending_payment` for 10 minutes. If unpaid, expire to `payment_failed`. Refunds are **manual admin review** per business policy. Scheduled via `pg_cron` calling `expire_unpaid_bookings()`.
6. **KYC required before booking:** 3 images (DL photo + Aadhaar photo + selfie-with-DL). Admin approves manually. `status='approved'` required before checkout succeeds.
7. **Security deposit:** ₹500 default. ₹1000 extra if customer doesn't bring original DL physically at pickup. Refunded by admin after drop-off.
8. **Commission split (vendor bikes):**
   - Vendor gets 80% of base rental price
   - Platform gets 20% of base rental + 100% of helmet add-ons + GST (pass-through) + security deposit (refunded after inspection)
   - See `splitCommission()` in `src/lib/pricing.ts`.
9. **Vendor pickup addresses:** area/locality shown publicly on bike cards; full address only revealed after payment.
10. **Helmet policy:** 1 free, extra ₹50 each (max 3 extra).
11. **Excess/late charges:** per-model (₹3/km for 110cc, ₹4/km for R15 class; ₹49/hr late for 110cc, ₹89/hr for R15 class). See `bike_models` table.

---

## File map (only the files that matter)

```
src/
├── app/
│   ├── page.tsx                        Home (hero + browse grid)
│   ├── bikes/[id]/page.tsx             Bike detail + booking flow
│   ├── my-bookings/                    Customer bookings
│   ├── kyc/page.tsx                    KYC upload
│   ├── vendor/
│   │   ├── page.tsx                    Vendor dashboard (earnings, bookings)
│   │   ├── signup/page.tsx             Vendor application
│   │   └── bikes/new/page.tsx          List a bike form
│   ├── admin/page.tsx                  Single-page tabbed admin panel
│   └── api/
│       ├── bookings/
│       │   ├── create/route.ts         ⚠️ CRITICAL — atomic booking creation
│       │   ├── verify-payment/route.ts Client-side payment confirm
│       │   └── cancel/route.ts
│       ├── webhooks/
│       │   ├── clerk/route.ts          User sync
│       │   └── razorpay/route.ts       ⚠️ AUTHORITATIVE payment status
│       ├── kyc/submit/route.ts
│       ├── vendor/{apply,bikes}/route.ts
│       └── admin/{vendors,bikes,kyc,bookings}/review|update/route.ts
├── components/
│   ├── booking/                        BookingFlow, PackagePicker, PickupTimePicker, OrderSummary, RazorpayCheckout
│   ├── bookings/                       BookingCard, CancelBookingButton
│   ├── admin/                          AdminTabs + VendorsTab + BikesTab + KycTab + BookingsTab
│   ├── vendor/                         VendorSignupForm, ListBikeForm
│   ├── kyc/KycForm.tsx
│   ├── home/                           Hero, BrowseSection, BikeCard
│   └── layout/                         Nav, ClerkNav, MockNav, Footer, WhatsAppBubble
└── lib/
    ├── auth.ts                         getCurrentAppUser() — THE user resolver (Clerk → DB → mock)
    ├── pricing.ts                      ⚠️ CRITICAL — all price math (calculatePrice, splitCommission, weekend override, store hours)
    ├── razorpay.ts                     createRazorpayOrder + verifyPaymentSignature + verifyWebhookSignature
    ├── mock.ts                         Mock mode infra (auto-enables when no env vars)
    ├── utils.ts                        cn, formatINR, formatDateTime
    └── supabase/
        ├── client.ts                   Browser client (anon key)
        ├── server.ts                   Server client (RLS via Clerk JWT) + admin client (bypasses RLS)
        └── types.ts                    DB row types

supabase/migrations/                    Run in numeric order
├── 001_schema.sql                      Tables, enums, THE exclusion constraint
├── 002_rls.sql                         Row-level security policies
├── 003_master_pricing.sql              Pricing seed from rate card
├── 004_functions.sql                   expire_unpaid_bookings, is_slot_available
└── 005_kyc_selfie.sql                  Adds selfie_with_dl_photo_url column
```

## Files an AI should read before touching anything

Before editing anything, read these in order. They're the constitution:

1. `src/lib/pricing.ts` — how money flows
2. `src/lib/auth.ts` — how users are resolved
3. `supabase/migrations/001_schema.sql` — the data model
4. `supabase/migrations/002_rls.sql` — the security boundary
5. `src/app/api/bookings/create/route.ts` — the booking flow's heart

## Files an AI should almost never edit without asking

- The exclusion constraint in `001_schema.sql`
- The webhook signature verification in `src/lib/razorpay.ts`
- RLS policies in `002_rls.sql`
- Commission split math in `src/lib/pricing.ts`

---

## Mock mode (zero-config local dev)

`NEXT_PUBLIC_SUPABASE_URL` unset → app auto-enters mock mode:
- Yellow banner at top
- Floating 🛠 Dev Panel bottom-right for switching `customer`/`vendor`/`admin`
- Hardcoded bikes from `src/lib/mock.ts`
- In-memory bookings (reset on server restart)
- Razorpay checkout is skipped; fake success flow

Great for UI tuning, useless for actual integration testing.

## Environment variables

All keys documented in `.env.example`. The non-obvious ones:

- `CLERK_WEBHOOK_SECRET` — for Clerk → Supabase user sync
- `RAZORPAY_WEBHOOK_SECRET` — different from the API secret; set in Razorpay dashboard webhook settings
- Clerk JWT template named `supabase` required, signed with Supabase's JWT secret, for RLS to work with logged-in users

---

## How to ask for help (for the human reading this)

When opening a new chat with Claude (or any AI), paste this at the start:

> "I'm working on Zodito Rentals. Please read `PROJECT_BRIEF.md` and `CHANGES_LOG.md` in the repo at https://github.com/tarunratan/zodito-rental before answering. Then help me with: [your request]"

Then point it at the specific file you want changed. That's it — you don't need to re-explain the stack, the domain rules, or the file structure.

If you're using Claude Code or Cursor, these files are picked up automatically as repo context, so you skip even that one-line prompt.

---

## Known limitations / punch list (things not done yet)

- [ ] No SMS/email notifications (booking confirmation, KYC approved, etc.)
- [ ] Razorpay Route / automated vendor payouts (currently manual via UPI/bank based on dashboard numbers)
- [ ] Customer ratings/reviews after trip completion
- [ ] Analytics dashboard (revenue over time, top bikes, retention)
- [ ] Admin notes/communication log per booking
- [ ] Vendor mobile PWA for quick pickup marking
- [ ] Proper photo uploads for bikes (currently emoji fallback for most)
- [ ] KYC admin view uses public URLs; production should use signed URLs

See `CHANGES_LOG.md` for what's been changed since the initial build.
