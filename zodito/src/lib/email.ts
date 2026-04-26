import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = 'Zodito Rentals <noreply@zoditorentals.com>';

async function send(to: string, subject: string, html: string) {
  if (!resend || !to) {
    console.log(`[email:skip] no RESEND_API_KEY — would send "${subject}" to ${to}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (e) {
    console.error('[email] send failed:', e);
  }
}

function base(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:'DM Sans',Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
  <div style="background:#1a1a2e;padding:24px 32px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:24px;">🏍️</span>
    <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Zodito Rentals</span>
  </div>
  <div style="padding:28px 32px;">${content}</div>
  <div style="padding:16px 32px;background:#f8f7f4;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#6b7280;">Questions? Reply to this email or WhatsApp us.<br/>© 2025 Zodito Rentals. All rights reserved.</p>
  </div>
</div>
</body></html>`;
}

function heading(text: string) {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">${text}</h1>`;
}

function para(text: string) {
  return `<p style="margin:12px 0;font-size:15px;color:#374151;line-height:1.6;">${text}</p>`;
}

function badge(text: string, color = '#f97316') {
  return `<span style="display:inline-block;background:${color}20;color:${color};font-weight:700;font-size:13px;padding:3px 10px;border-radius:99px;border:1px solid ${color}40;">${text}</span>`;
}

function section(rows: [string, string][]) {
  const cells = rows.map(([k, v]) => `
    <tr>
      <td style="padding:8px 12px;background:#f8f7f4;font-size:13px;color:#6b7280;font-weight:600;width:40%;border-radius:6px 0 0 6px;">${k}</td>
      <td style="padding:8px 12px;background:#f8f7f4;font-size:14px;color:#1a1a2e;font-weight:600;border-radius:0 6px 6px 0;">${v}</td>
    </tr>
    <tr><td colspan="2" style="height:6px;"></td></tr>
  `).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${cells}</table>`;
}

function cta(label: string, url: string) {
  return `<div style="margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">${label}</a>
  </div>`;
}

// ── Booking confirmation ────────────────────────────────────────────────────
export async function sendBookingConfirmation(params: {
  to: string;
  name: string;
  bookingNumber: string;
  bikeName: string;
  tier: string;
  startTs: string;
  endTs: string;
  total: number;
  appUrl: string;
}) {
  const html = base(`
    ${heading('Booking Confirmed! 🎉')}
    ${para(`Hi ${params.name || 'there'}, your ride is booked. See you at pickup!`)}
    ${badge('CONFIRMED', '#16a34a')}
    ${section([
      ['Booking #', params.bookingNumber],
      ['Bike', params.bikeName],
      ['Package', params.tier],
      ['Pickup', new Date(params.startTs).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })],
      ['Return', new Date(params.endTs).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })],
      ['Total paid', `₹${params.total.toLocaleString('en-IN')}`],
    ])}
    ${para('Please bring your original driving licence and Aadhaar at pickup. A security deposit will be collected at the time of handover.')}
    ${cta('View Booking', `${params.appUrl}/my-bookings`)}
  `);
  await send(params.to, `Booking Confirmed — ${params.bookingNumber}`, html);
}

// ── KYC approved ────────────────────────────────────────────────────────────
export async function sendKycApproved(params: { to: string; name: string; appUrl: string }) {
  const html = base(`
    ${heading('KYC Verified ✅')}
    ${badge('APPROVED', '#16a34a')}
    ${para(`Hi ${params.name || 'there'}, your documents have been verified. You can now book any bike on Zodito!`)}
    ${cta('Browse Bikes', `${params.appUrl}/`)}
  `);
  await send(params.to, 'Your KYC is approved — Start riding with Zodito!', html);
}

// ── KYC rejected ────────────────────────────────────────────────────────────
export async function sendKycRejected(params: { to: string; name: string; reason: string; appUrl: string }) {
  const html = base(`
    ${heading('KYC Update')}
    ${badge('ACTION REQUIRED', '#dc2626')}
    ${para(`Hi ${params.name || 'there'}, unfortunately your KYC submission could not be verified.`)}
    ${section([['Reason', params.reason || 'Documents were unclear or incomplete. Please re-submit with clearer photos.']])}
    ${para('Please re-submit your documents with clear, well-lit photos. Make sure the text on your Driving Licence and Aadhaar is fully readable.')}
    ${cta('Re-submit KYC', `${params.appUrl}/kyc`)}
  `);
  await send(params.to, 'KYC Verification — Action Required', html);
}

// ── Vendor approved ─────────────────────────────────────────────────────────
export async function sendVendorApproved(params: { to: string; name: string; businessName: string; appUrl: string }) {
  const html = base(`
    ${heading('Welcome to the Zodito Fleet! 🏍️')}
    ${badge('VENDOR APPROVED', '#16a34a')}
    ${para(`Hi ${params.name || 'there'}, your vendor application for <strong>${params.businessName}</strong> has been approved!`)}
    ${para('You can now list your bikes on the Zodito platform and start earning. Head to your vendor dashboard to add your first bike.')}
    ${cta('Go to Vendor Dashboard', `${params.appUrl}/vendor`)}
  `);
  await send(params.to, `Vendor Application Approved — ${params.businessName}`, html);
}

// ── Vendor rejected ─────────────────────────────────────────────────────────
export async function sendVendorRejected(params: { to: string; name: string; businessName: string; notes: string; appUrl: string }) {
  const html = base(`
    ${heading('Vendor Application Update')}
    ${badge('NOT APPROVED', '#dc2626')}
    ${para(`Hi ${params.name || 'there'}, unfortunately your vendor application for <strong>${params.businessName}</strong> could not be approved at this time.`)}
    ${params.notes ? section([['Feedback', params.notes]]) : ''}
    ${para('If you believe this is a mistake or you have updated your details, you are welcome to apply again.')}
    ${cta('Apply Again', `${params.appUrl}/vendor/signup`)}
  `);
  await send(params.to, `Vendor Application — ${params.businessName}`, html);
}

// ── Booking status update ────────────────────────────────────────────────────
export async function sendBookingStatusUpdate(params: {
  to: string;
  name: string;
  bookingNumber: string;
  status: string;
  notes?: string;
  appUrl: string;
}) {
  const statusMap: Record<string, { label: string; color: string; message: string }> = {
    ongoing: { label: 'RIDE STARTED', color: '#2563eb', message: 'Your bike has been handed over. Enjoy your ride! Remember to return it on time to avoid late charges.' },
    completed: { label: 'RIDE COMPLETED', color: '#16a34a', message: 'Your ride has been marked as completed. We hope you enjoyed it! Your security deposit will be refunded within 2–3 working days.' },
    cancelled: { label: 'BOOKING CANCELLED', color: '#dc2626', message: 'Your booking has been cancelled. If you are due a refund, it will be processed within 5–7 working days.' },
    refunded: { label: 'REFUND PROCESSED', color: '#16a34a', message: 'A refund has been initiated for your booking. It should appear in your account within 5–7 working days.' },
  };
  const s = statusMap[params.status] ?? { label: params.status.toUpperCase(), color: '#6b7280', message: `Your booking ${params.bookingNumber} has been updated.` };

  const html = base(`
    ${heading('Booking Update')}
    ${badge(s.label, s.color)}
    ${para(`Hi ${params.name || 'there'}, here's an update for booking <strong>${params.bookingNumber}</strong>.`)}
    ${para(s.message)}
    ${params.notes ? section([['Note', params.notes]]) : ''}
    ${cta('View Booking', `${params.appUrl}/my-bookings`)}
  `);
  await send(params.to, `Booking ${params.bookingNumber} — ${s.label}`, html);
}
