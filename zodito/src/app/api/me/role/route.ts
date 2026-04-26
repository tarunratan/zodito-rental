import { NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentAppUser();
    if (!user) return NextResponse.json({ role: null }, { status: 401 });
    return NextResponse.json({ role: user.role, kyc_status: user.kyc_status });
  } catch {
    return NextResponse.json({ role: null }, { status: 401 });
  }
}
