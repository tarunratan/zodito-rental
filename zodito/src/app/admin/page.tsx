import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { AdminBikeManager } from './AdminBikeManager';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'admin') redirect('/');

  const supabase = createSupabaseAdmin();
  const [{ data: bikes }, { data: models }] = await Promise.all([
    supabase
      .from('bikes')
      .select('*, model:bike_models(id, display_name, name, category, cc), vendor:vendors(id, business_name, pickup_area)')
      .order('created_at', { ascending: false }),
    supabase
      .from('bike_models')
      .select('id, display_name, name, category, cc')
      .order('category')
      .order('cc'),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl tracking-tight">Admin Panel</h1>
        <p className="text-muted text-sm mt-1">Manage bikes, vendors, and listings</p>
      </div>
      <AdminBikeManager initialBikes={bikes ?? []} models={models ?? []} />
    </div>
  );
}
