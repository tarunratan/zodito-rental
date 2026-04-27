import { createSupabaseAdmin } from '@/lib/supabase/server';
import { ExpensesManager } from './ExpensesManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminExpensesPage() {
  let expenses: any[] = [];
  let bikes: any[] = [];

  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();
    const [expRes, bikeRes] = await Promise.all([
      supabase
        .from('bike_expenses')
        .select('*, bike:bikes(id, registration_number, emoji, model:bike_models(display_name))')
        .order('expense_date', { ascending: false }),
      supabase
        .from('bikes')
        .select('id, registration_number, emoji, model:bike_models(display_name)')
        .eq('is_active', true)
        .eq('listing_status', 'approved')
        .order('created_at', { ascending: false }),
    ]);
    expenses = expRes.data ?? [];
    bikes = bikeRes.data ?? [];
  }

  return <ExpensesManager initialExpenses={expenses} bikes={bikes} />;
}
