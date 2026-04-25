import { getCurrentAppUser } from '@/lib/auth';
import { KycForm } from '@/components/kyc/KycForm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function KycPage() {
  const user = await getCurrentAppUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p>Please sign in first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Link href="/my-bookings" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1 mb-6">
        ← Back
      </Link>

      <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-2">
        Identity verification
      </h1>
      <p className="text-muted mb-6">
        Upload your DL and Aadhaar once — our team verifies before handing over the bike.
        You can book now and complete this anytime before pickup.
      </p>

      <StatusBanner status={user.kyc_status} rejectionReason={user.kyc_rejection_reason ?? undefined} />

      {user.kyc_status !== 'approved' && (
        <KycForm currentStatus={user.kyc_status} />
      )}

      {user.kyc_status === 'approved' && (
        <div className="mt-6 text-center">
          <Link href="/" className="btn-accent">Browse bikes →</Link>
        </div>
      )}
    </div>
  );
}

function StatusBanner({ status, rejectionReason }: { status: string; rejectionReason?: string }) {
  const configs = {
    not_submitted: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', icon: '📋', title: 'Not submitted yet', desc: 'Submit your docs — our team will verify before your first handover.' },
    pending: { bg: 'bg-info/10', border: 'border-info/30', text: 'text-info', icon: '⏱', title: 'Under review', desc: 'We usually approve within 2-4 hours during business hours' },
    approved: { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success', icon: '✓', title: 'Verified', desc: "You're all set. Go book a ride!" },
    rejected: { bg: 'bg-danger/10', border: 'border-danger/30', text: 'text-danger', icon: '✗', title: 'Rejected — please re-submit', desc: rejectionReason || 'Upload clearer photos and try again' },
  } as const;

  const c = configs[status as keyof typeof configs] ?? configs.not_submitted;

  return (
    <div className={`${c.bg} ${c.border} border rounded-card p-4 mb-6`}>
      <div className="flex items-start gap-3">
        <div className={`text-2xl ${c.text}`}>{c.icon}</div>
        <div>
          <div className={`font-semibold ${c.text}`}>{c.title}</div>
          <div className="text-sm text-muted mt-0.5">{c.desc}</div>
        </div>
      </div>
    </div>
  );
}
