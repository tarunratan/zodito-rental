import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { VendorSignupForm } from '@/components/vendor/VendorSignupForm';

export const dynamic = 'force-dynamic';

async function getExistingVendor(userId: string) {
  if (isMockMode()) return null;
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('vendors')
    .select('id, status, business_name, approval_notes')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export default async function VendorSignupPage() {
  const user = await getCurrentAppUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p>Please sign in to apply as a vendor.</p>
      </div>
    );
  }

  // If they're already approved, bounce to dashboard
  if (user.role === 'vendor') redirect('/vendor');

  const existing = await getExistingVendor(user.id);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1 mb-6">
        ← Home
      </Link>

      <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-2">
        List your bikes on Zodito
      </h1>
      <p className="text-muted mb-6">
        Join our partner network. We bring you customers — you keep 80% of the rental.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Perk num="80%" label="Your share of rental" />
        <Perk num="0" label="Listing fees" />
        <Perk num="2-3 days" label="Approval time" />
      </div>

      {existing ? (
        <StatusCard status={existing.status} notes={existing.approval_notes} businessName={existing.business_name} />
      ) : (
        <VendorSignupForm />
      )}
    </div>
  );
}

function Perk({ num, label }: { num: string; label: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="font-display font-bold text-xl text-accent">{num}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function StatusCard({ status, notes, businessName }: { status: string; notes: string | null; businessName: string }) {
  const configs = {
    pending: { bg: 'bg-info/10', border: 'border-info/30', text: 'text-info', icon: '⏱', title: 'Application under review', desc: "We'll email you within 2-3 business days." },
    approved: { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success', icon: '✓', title: 'Approved!', desc: 'You can start listing bikes from your dashboard.' },
    rejected: { bg: 'bg-danger/10', border: 'border-danger/30', text: 'text-danger', icon: '✗', title: 'Not approved', desc: notes ?? 'See notes below. You can re-apply after addressing the issues.' },
    suspended: { bg: 'bg-danger/10', border: 'border-danger/30', text: 'text-danger', icon: '⛔', title: 'Suspended', desc: notes ?? 'Contact support.' },
  } as const;
  const c = configs[status as keyof typeof configs] ?? configs.pending;

  return (
    <div className={`${c.bg} ${c.border} border rounded-card p-5`}>
      <div className="flex items-start gap-3">
        <div className={`text-3xl ${c.text}`}>{c.icon}</div>
        <div>
          <div className={`font-display font-semibold ${c.text}`}>
            {c.title}
          </div>
          <div className="text-muted text-sm mt-0.5">
            {businessName} · {c.desc}
          </div>
          {notes && status !== 'approved' && (
            <div className="mt-3 p-3 bg-white rounded-md text-sm">
              <div className="font-semibold text-xs uppercase tracking-wide mb-1">Admin notes</div>
              {notes}
            </div>
          )}
          {status === 'approved' && (
            <Link href="/vendor" className="btn-accent inline-block mt-3 text-sm">
              Go to dashboard →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
