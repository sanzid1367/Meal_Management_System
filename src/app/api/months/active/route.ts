import { NextResponse } from 'next/server';
import { getActiveMonth, getDefaultMessId } from '@/lib/db-helpers';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();

    const user = await getCurrentUser(request);
    const messId = user?.mess_id || (await getDefaultMessId());

    const month = await getActiveMonth(messId);
    return NextResponse.json(month);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch active month" }, { status: 500 });
  }
}
