import { createSupabaseAdmin } from '@/lib/supabase/server';
import { KycReviewManager } from './KycReviewManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminKycPage() {
  let users: any[] = [];
  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, phone, kyc_status, dl_number, dl_photo_url, aadhaar_photo_url, selfie_with_dl_photo_url, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, created_at')
      .not('kyc_status', 'eq', 'not_submitted')
      .order('kyc_submitted_at', { ascending: false, nullsFirst: false });
    users = data ?? [];
  }

  return <KycReviewManager initialUsers={users} />;
}
