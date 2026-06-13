import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser, requireAdmin } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    

    const adminUser = await getCurrentUser(request);
    const isAdmin = adminUser?.role === 'admin';

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    let members;
    if (includeInactive) {
      members = await sql`
        SELECT * FROM members 
        ORDER BY is_active DESC, LOWER(name)
      `;
    } else {
      members = await sql`
        SELECT * FROM members 
        WHERE is_active = 1 
        ORDER BY is_active DESC, LOWER(name)
      `;
    }

    // Convert numbers to correct types (Postgres driver handles booleans/ints as numbers, but verify)
    const processed = members.map(m => ({
      ...m,
      is_active: Number(m.is_active),
      phone: isAdmin ? m.phone : null
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch members" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const { name, phone, entry_date } = await request.json();
    if (!name || !entry_date) {
      return NextResponse.json({ detail: "Name and entry date are required" }, { status: 400 });
    }

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    
    const result = await sql`
      INSERT INTO members (name, phone, entry_date, created_at)
      VALUES (${name.trim()}, ${phone || null}, ${entry_date}, ${now})
      RETURNING *
    `;

    const created = {
      ...result[0],
      is_active: Number(result[0].is_active)
    };

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to create member" }, { status: 500 });
  }
}
