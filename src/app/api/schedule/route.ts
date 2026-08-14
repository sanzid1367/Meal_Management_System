import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { getActiveMonth, validateMember, getDefaultMessId } from '@/lib/db-helpers';
import { getCurrentUser, requireManager } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await initDb();

    const user = await getCurrentUser(request);
    if (user && user.role !== 'super_admin') {
      if (user.membership_status === 'pending') {
        return NextResponse.json([]);
      }
      if (user.membership_status !== 'active') {
        return NextResponse.json({ detail: "Active membership required", code: "MEMBERSHIP_INACTIVE" }, { status: 403 });
      }
    }
    const messId = user?.mess_id || (await getDefaultMessId());

    const month = await getActiveMonth(messId);

    const schedule = await sql`
      SELECT s.*, m.name AS member_name
      FROM bazar_schedule s
      JOIN members m ON m.id = s.member_id
      WHERE s.month_id = ${month.id} AND s.mess_id = ${messId}
      ORDER BY s.date
    `;

    const processed = schedule.map((s: any) => ({
      ...s,
      member_id: Number(s.member_id),
      month_id: Number(s.month_id),
      mess_id: Number(s.mess_id)
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch schedule" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await initDb();
    const manager = await requireManager(request);
    if (!manager || !manager.mess_id) {
      return NextResponse.json({ detail: "Not enough permissions or no mess assigned" }, { status: 403 });
    }

    const month = await getActiveMonth(manager.mess_id);
    const { date, member_id, note } = await request.json();

    if (!date || !member_id) {
      return NextResponse.json({ detail: "Date and member ID are required" }, { status: 400 });
    }

    const memberExists = await validateMember(manager.mess_id, member_id);
    if (!memberExists) {
      return NextResponse.json({ detail: "Member not found in your mess" }, { status: 404 });
    }

    await sql`
      INSERT INTO bazar_schedule (mess_id, month_id, date, member_id, note)
      VALUES (${manager.mess_id}, ${month.id}, ${date}, ${member_id}, ${note || null})
      ON CONFLICT (month_id, date)
      DO UPDATE SET member_id = EXCLUDED.member_id, note = EXCLUDED.note, mess_id = EXCLUDED.mess_id
    `;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update schedule" }, { status: 500 });
  }
}
