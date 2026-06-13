import { NextResponse } from 'next/server';
import { getActiveMonth, buildSummary } from '@/lib/db-helpers';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    

    const month = await getActiveMonth();
    const summary = await buildSummary(month.id);
    return NextResponse.json(summary);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch summary" }, { status: 500 });
  }
}
