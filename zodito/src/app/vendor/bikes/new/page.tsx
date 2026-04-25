import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { ListBikeForm } from '@/components/vendor/ListBikeForm';

export const dynamic = 'force-dynamic';

async function fetchBikeModels() {
  if (isMockMode()) {
    // Deterministic subset so the form is usable without DB
    return [
      { id: 'm-activa6g', name: 'activa_6g', display_name: 'Honda Activa 6G / Dio / Fascino / Jupiter', category: 'scooter', cc: 110 },
      { id: 'm-activa5g', name: 'activa_5g_4g', display_name: 'Honda Activa 5G / 4G', category: 'scooter', cc: 110 },
      { id: 'm-shine', name: 'shine_glamour', display_name: 'Honda Shine / Glamour / HF Deluxe', category: 'scooter', cc: 125 },
      { id: 'm-pulsar', name: 'pulsar_150', display_name: 'Bajaj Pulsar 150', category: 'bike_sub150', cc: 150 },
      { id: 'm-r15v3', name: 'r15v3', display_name: 'Yamaha R15 V3', category: 'bike_plus150', cc: 155 },
      { id: 'm-r15v4', name: 'r15v4', display_name: 'Yamaha R15 V4', category: 'bike_plus150', cc: 155 },
      { id: 'm-re350', name: 'royal_enfield_350', display_name: 'Royal Enfield Classic 350', category: 'bike_plus150', cc: 350 },
    ];
  }
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('bike_models')
    .select('id, name, display_name, category, cc')
    .order('cc', { ascending: true });
  return data ?? [];
}

export default async function NewBikePage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'vendor') {
    if (!isMockMode()) redirect('/vendor/signup');
  }

  const models = await fetchBikeModels();

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Link href="/vendor" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1 mb-6">
        ← Dashboard
      </Link>

      <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-2">
        List a bike
      </h1>
      <p className="text-muted mb-6">
        Pick a model from our master list — pricing is set by Zodito to keep the platform consistent.
      </p>

      <ListBikeForm models={models} />
    </div>
  );
}
