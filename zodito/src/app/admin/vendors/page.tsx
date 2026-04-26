import { createSupabaseAdmin } from '@/lib/supabase/server';
import { VendorReviewManager } from './VendorReviewManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminVendorsPage() {
  let vendors: any[] = [];
  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from('vendors')
      .select('*, user:users(id, email, first_name, last_name, phone)')
      .order('created_at', { ascending: false });
    vendors = data ?? [];
  }

  return <VendorReviewManager initialVendors={vendors} />;
}
