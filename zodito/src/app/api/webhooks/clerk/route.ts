import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
// This endpoint is called by Clerk's webhook — we need the RAW body for signature verification,
// so dynamic = 'force-dynamic' and we read the raw text manually.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'missing svix headers' }, { status: 400 });
  }

  const body = await req.text();

  const wh = new Webhook(secret);
  let evt: any;
  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Clerk webhook verification failed:', err);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Idempotency: log the event
  await supabase.from('webhook_events').upsert(
    {
      source: 'clerk',
      event_id: svixId,
      event_type: evt.type,
      payload: evt,
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'source,event_id', ignoreDuplicates: true }
  );

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const d = evt.data;
    await supabase.from('users').upsert(
      {
        clerk_id: d.id,
        email: d.email_addresses?.[0]?.email_address ?? null,
        phone: d.phone_numbers?.[0]?.phone_number ?? null,
        first_name: d.first_name ?? null,
        last_name: d.last_name ?? null,
      },
      { onConflict: 'clerk_id' }
    );
  } else if (evt.type === 'user.deleted') {
    await supabase.from('users').delete().eq('clerk_id', evt.data.id);
  }

  return NextResponse.json({ ok: true });
}
