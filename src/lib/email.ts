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
  name: string;
  bookingNumber: string;
  bike: string;
  bikeDetails?: string;
  startDate: string;
  endDate: string;
  kmLimit?: number;
  total: number;
  advancePaid?: number;
  pending?: number;
  securityDeposit?: number;
  pickupLocation?: string;
  pickupPhone?: string;
  extraKmRate?: number;
  latePenaltyRate?: number;
}) {
  // Skip silently when no email is on file — most manual/offline bookings
  // don't capture one, and we still want the create path to succeed.
  if (!to) return;
  const rupee = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#666;font-size:13px;width:42%">${label}</td>
         <td style="padding:4px 0;font-size:13px;font-weight:600">${value}</td></tr>`;

  const paymentRows = [
    row('Total Amount', rupee(data.total)),
    data.advancePaid != null ? row('Amount Paid', rupee(data.advancePaid)) : '',
    data.pending != null && data.pending > 0
      ? row('Amount Pending', `<span style="color:#ea580c">${rupee(data.pending)}</span>`)
      : '',
    data.securityDeposit != null && data.securityDeposit > 0
      ? row('Security Deposit', rupee(data.securityDeposit))
      : '',
  ].filter(Boolean).join('');

  const policyRow = (data.extraKmRate || data.latePenaltyRate)
    ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:12px 0;font-size:12px;color:#92400e">
         <strong>Extra charges</strong> · ${rupee(data.extraKmRate ?? 3)}/km over ${data.kmLimit ?? 0} km · ${rupee(data.latePenaltyRate ?? 49)}/hr late return
       </div>`
    : '';

  const pickupBlock = data.pickupLocation
    ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin:12px 0;font-size:13px;color:#0c4a6e">
         <strong>📍 Pickup location</strong><br/>${data.pickupLocation}
         ${data.pickupPhone ? `<br/><a href="tel:${data.pickupPhone}" style="color:#0c4a6e">📞 ${data.pickupPhone}</a>` : ''}
       </div>`
    : '';

  await send(to, `Booking Confirmed – ${data.bookingNumber}`, base(`
    <h2 style="color:#1a1a2e;margin:0 0 8px">Booking Confirmed! 🎉</h2>
    <p style="color:#555;margin:0 0 16px">Hi ${data.name}, your booking is confirmed. Here are the details:</p>

    <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:0 0 12px">
      <p style="margin:0 0 8px;font-size:13px;color:#9a3412"><strong>Booking #${data.bookingNumber}</strong></p>
      <table style="width:100%;border-collapse:collapse">
        ${row('Bike', data.bike)}
        ${data.bikeDetails ? row('Bike Details', data.bikeDetails) : ''}
        ${row('Pickup D&T', data.startDate)}
        ${row('Drop-off D&T', data.endDate)}
        ${data.kmLimit != null ? row('KM Limit', `${data.kmLimit} km`) : ''}
      </table>
    </div>

    <div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:0 0 12px">
      <table style="width:100%;border-collapse:collapse">
        ${paymentRows}
      </table>
    </div>

    ${pickupBlock}
    ${policyRow}

    <p style="font-size:12px;color:#555;margin:12px 0 4px"><strong>What to bring:</strong></p>
    <ul style="font-size:12px;color:#555;margin:0 0 16px;padding-left:20px;line-height:1.6">
      <li><strong>Original Driving Licence</strong> (physical — digital copies not accepted)</li>
      <li>Aadhaar card for verification</li>
      <li>The licence holder must be present at pickup</li>
    </ul>

    <div style="font-size:11px;color:#9a3412;background:#fff8f0;border:1px solid #fed7aa;border-radius:6px;padding:10px;margin:0 0 12px">
      🕛 Hub timings 6:00 AM – 10:30 PM. Bike drop-offs are not accepted after 10:30 PM; an overnight rental fee will apply.
      <br/><strong># The booking amount is non-refundable once confirmed. #</strong>
    </div>

    <a href="${APP_URL}/my-bookings" style="display:inline-block;background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Booking</a>

    <p style="font-size:12px;color:#999;margin:16px 0 0">Have a great and safe ride 🤝<br/>Thank you for choosing Zodito Rentals ❤️</p>
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
