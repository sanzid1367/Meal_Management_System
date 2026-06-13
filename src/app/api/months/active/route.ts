import { NextResponse } from 'next/server';
import { getActiveMonth } from '@/lib/db-helpers';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }

    const month = await getActiveMonth();
    return NextResponse.json(month);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch active month" }, { status: 500 });
  }
}
