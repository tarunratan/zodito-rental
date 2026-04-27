import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = 'Zodito Rentals <noreply@zoditorentals.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zoditorentals.com';

async function send(to: string, subject: string, html: string) {
  if (!resend) { console.log('[email] no RESEND_API_KEY, skipping:', subject); return; }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (e) {
    console.error('[email] send error:', e);
  }
}

function base(content: string) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
<div style="background:#1a1a2e;padding:20px 24px;display:flex;align-items:center;gap:10px">
  <span style="font-size:24px">🏍️</span>
  <span style="color:#fff;font-weight:700;font-size:18px">Zodito Rentals</span>
</div>
<div style="padding:24px">${content}</div>
<div style="padding:16px 24px;background:#f9f9f9;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center">
  © ${new Date().getFullYear()} Zodito Rentals · Kukatpally, Hyderabad ·
  <a href="${APP_URL}" style="color:#f97316">zoditorentals.com</a>
</div></div></body></html>`;
}

export async function sendBookingConfirmation(to: string, data: {
  name: string; bookingNumber: string; bike: string; startDate: string; endDate: string; total: number;
}) {
  await send(to, `Booking Confirmed – ${data.bookingNumber}`, base(`
    <h2 style="color:#1a1a2e;margin:0 0 16px">Booking Confirmed! 🎉</h2>
    <p style="color:#555">Hi ${data.name}, your booking is confirmed.</p>
    <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:4px 0;font-size:14px"><strong>Booking #:</strong> ${data.bookingNumber}</p>
      <p style="margin:4px 0;font-size:14px"><strong>Bike:</strong> ${data.bike}</p>
      <p style="margin:4px 0;font-size:14px"><strong>Pickup:</strong> ${data.startDate}</p>
      <p style="margin:4px 0;font-size:14px"><strong>Return:</strong> ${data.endDate}</p>
      <p style="margin:4px 0;font-size:14px"><strong>Amount Paid:</strong> ₹${data.total.toLocaleString('en-IN')}</p>
    </div>
    <a href="${APP_URL}/my-bookings" style="display:inline-block;background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Booking</a>
  `));
}

export async function sendKycApproved(to: string, name: string) {
  await send(to, 'KYC Approved – You can now book bikes!', base(`
    <h2 style="color:#1a1a2e;margin:0 0 16px">KYC Approved ✅</h2>
    <p style="color:#555">Hi ${name}, your identity verification is complete. You can now book bikes on Zodito!</p>
    <a href="${APP_URL}/bikes" style="display:inline-block;background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Browse Bikes</a>
  `));
}

export async function sendKycRejected(to: string, name: string, reason?: string | null) {
  await send(to, 'KYC Review – Action Required', base(`
    <h2 style="color:#1a1a2e;margin:0 0 16px">KYC Needs Re-submission</h2>
    <p style="color:#555">Hi ${name}, your KYC submission was not approved.</p>
    ${reason ? `<div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:12px;margin:12px 0;font-size:14px;color:#dc2626">${reason}</div>` : ''}
    <p style="color:#555;font-size:14px">Please re-submit with clearer photos.</p>
    <a href="${APP_URL}/kyc" style="display:inline-block;background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Re-submit KYC</a>
  `));
}

export async function sendVendorApproved(to: string, name: string) {
  await send(to, 'Vendor Application Approved 🎉', base(`
    <h2 style="color:#1a1a2e;margin:0 0 16px">You're a Zodito Vendor!</h2>
    <p style="color:#555">Hi ${name}, your vendor application has been approved. You can now list your bikes.</p>
    <a href="${APP_URL}/vendor" style="display:inline-block;background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Go to Dashboard</a>
  `));
}

export async function sendVendorRejected(to: string, name: string, notes?: string | null) {
  await send(to, 'Vendor Application Update', base(`
    <h2 style="color:#1a1a2e;margin:0 0 16px">Application Not Approved</h2>
    <p style="color:#555">Hi ${name}, we were unable to approve your vendor application at this time.</p>
    ${notes ? `<div style="background:#f9f9f9;border-radius:8px;padding:12px;margin:12px 0;font-size:14px;color:#555">${notes}</div>` : ''}
    <p style="color:#555;font-size:14px">Questions? Email us at zoditorentals@gmail.com</p>
  `));
}

export async function sendBookingStatusUpdate(to: string, name: string, bookingNumber: string, status: string) {
  const msgs: Record<string, string> = {
    ongoing: 'Your bike has been picked up. Enjoy your ride! 🏍️',
    completed: 'Your rental is complete. Thank you for riding with Zodito!',
    cancelled: 'Your booking has been cancelled.',
  };
  const msg = msgs[status] || `Your booking status is now: ${status}`;
  await send(to, `Booking ${bookingNumber} – ${status.charAt(0).toUpperCase() + status.slice(1)}`, base(`
    <h2 style="color:#1a1a2e;margin:0 0 16px">Booking Update</h2>
    <p style="color:#555">Hi ${name}, ${msg}</p>
    <p style="color:#aaa;font-size:13px">Booking: ${bookingNumber}</p>
    <a href="${APP_URL}/my-bookings" style="display:inline-block;background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Booking</a>
  `));
}
