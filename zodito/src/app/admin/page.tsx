import { createSupabaseAdmin } from '@/lib/supabase/server';
import { AdminBikeManager } from './AdminBikeManager';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createSupabaseAdmin();
  const [{ data: bikes }, { data: models }] = await Promise.all([
    supabase
      .from('bikes')
      .select('*, model:bike_models(id, display_name, name, category, cc), vendor:vendors(id, business_name, pickup_area)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('bike_models')
      .select('id, display_name, name, category, cc')
      .order('category')
      .order('cc'),
  ]);

  return <AdminBikeManager initialBikes={bikes ?? []} models={models ?? []} />;
}
