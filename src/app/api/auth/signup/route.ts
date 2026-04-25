import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (isMockMode()) {
    return NextResponse.json({ error: 'Mock mode — no real signup' }, { status: 400 });
  }

  const { email, password, first_name, last_name, phone } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Create user via admin API with email_confirm: true so no confirmation email is sent
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: first_name || null,
      last_name: last_name || null,
      phone: phone || null,
    },
  });

  if (error) {
    // "User already registered" → surface cleanly
    if (error.message.includes('already been registered') || error.message.includes('already exists')) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Also create the users table row immediately so auth.ts doesn't need on-the-fly creation
  if (data.user) {
    await admin.from('users').upsert({
      auth_id: data.user.id,
      email: data.user.email ?? null,
      phone: phone || null,
      first_name: first_name || null,
      last_name: last_name || null,
      role: 'customer',
    }, { onConflict: 'auth_id', ignoreDuplicates: true });
  }

  return NextResponse.json({ success: true });
}
