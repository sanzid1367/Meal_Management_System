import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getActiveMonth, validateMember } from '@/lib/db-helpers';
import { getCurrentUser, requireAdmin } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    

    const month = await getActiveMonth();

    const schedule = await sql`
      SELECT s.*, m.name AS member_name
      FROM bazar_schedule s
      JOIN members m ON m.id = s.member_id
      WHERE s.month_id = ${month.id}
      ORDER BY s.date
    `;

    const processed = schedule.map(s => ({
      ...s,
      member_id: Number(s.member_id),
      month_id: Number(s.month_id)
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch schedule" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await initDb();
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const month = await getActiveMonth();
    const { date, member_id, note } = await request.json();

    if (!date || !member_id) {
      return NextResponse.json({ detail: "Date and member ID are required" }, { status: 400 });
    }

    const memberExists = await validateMember(member_id);
    if (!memberExists) {
      return NextResponse.json({ detail: "Member not found" }, { status: 404 });
    }

    await sql`
      INSERT INTO bazar_schedule (month_id, date, member_id, note)
      VALUES (${month.id}, ${date}, ${member_id}, ${note || null})
      ON CONFLICT (month_id, date)
      DO UPDATE SET member_id = EXCLUDED.member_id, note = EXCLUDED.note
    `;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update schedule" }, { status: 500 });
  }
}
