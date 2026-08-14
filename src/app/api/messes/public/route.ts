import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';

export async function GET() {
  try {
    await initDb();
    const messes = await sql`
      SELECT id, name 
      FROM messes 
      ORDER BY name ASC
    `;
    return NextResponse.json(messes);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to list messes" }, { status: 500 });
  }
}
