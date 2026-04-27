import { createSupabaseAdmin } from '@/lib/supabase/server';
import { VendorReviewManager } from './VendorReviewManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminVendorsPage() {
  let vendors: any[] = [];
  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();

    const { data: rawVendors } = await supabase
      .from('vendors')
      .select('id, business_name, contact_phone, contact_email, pickup_address, pickup_area, bank_account_name, bank_account_number, bank_ifsc, upi_id, commission_pct, status, approval_notes, approved_at, created_at, user_id')
      .order('created_at', { ascending: false });

    if (rawVendors && rawVendors.length > 0) {
      const userIds = [...new Set(rawVendors.map((v: any) => v.user_id).filter(Boolean))];
      const usersRes = userIds.length
        ? await supabase.from('users').select('id, email, first_name, last_name, phone').in('id', userIds)
        : { data: [] };
      const userMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));
      vendors = rawVendors.map((v: any) => ({ ...v, user: userMap[v.user_id] ?? null }));
    } else {
      vendors = rawVendors ?? [];
    }
  }

  return <VendorReviewManager initialVendors={vendors} />;
}
