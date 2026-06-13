import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';

export async function GET() {
  try {
    await initDb();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Database init failed" }, { status: 500 });
  }
}
