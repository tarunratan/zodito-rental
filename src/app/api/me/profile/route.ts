import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_USER } from '@/lib/mock';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getCurrentAppUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    return NextResponse.json({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone,
      address: (user as any).address ?? null,
      profile_photo_url: (user as any).profile_photo_url ?? null,
      kyc_status: user.kyc_status,
      role: user.role,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const patchSchema = z.object({
  first_name: z.string().min(1).max(60).optional(),
  last_name:  z.string().max(60).optional(),
  address:    z.string().max(300).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentAppUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const parse = patchSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

    if (isMockMode()) {
      Object.assign(MOCK_USER, parse.data);
      return NextResponse.json({ ok: true });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('users')
      .update({ ...parse.data, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
