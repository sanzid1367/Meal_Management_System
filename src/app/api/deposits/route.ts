import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { getActiveMonth, validateMember, getDefaultMessId } from '@/lib/db-helpers';
import { getCurrentUser, requireManager } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await initDb();

    const user = await getCurrentUser(request);
    if (user && user.role !== 'super_admin' && user.membership_status !== 'active') {
      return NextResponse.json({ detail: "Active membership required", code: "MEMBERSHIP_INACTIVE" }, { status: 403 });
    }
    const messId = user?.mess_id || (await getDefaultMessId());

    const month = await getActiveMonth(messId);

    const deposits = await sql`
      SELECT d.*, m.name AS member_name
      FROM deposits d
      JOIN members m ON m.id = d.member_id
      WHERE d.month_id = ${month.id} AND d.mess_id = ${messId}
      ORDER BY d.date DESC, d.id DESC
    `;

    const processed = deposits.map((d: any) => ({
      ...d,
      amount: Number(d.amount),
      member_id: Number(d.member_id),
      month_id: Number(d.month_id),
      mess_id: Number(d.mess_id)
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch deposits" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const manager = await requireManager(request);
    if (!manager || !manager.mess_id) {
      return NextResponse.json({ detail: "Not enough permissions or no mess assigned" }, { status: 403 });
    }

    const month = await getActiveMonth(manager.mess_id);
    const { member_id, date, amount, note } = await request.json();

    if (!member_id || !date || amount === undefined) {
      return NextResponse.json({ detail: "Member ID, date, and amount are required" }, { status: 400 });
    }

    const memberExists = await validateMember(manager.mess_id, member_id);
    if (!memberExists) {
      return NextResponse.json({ detail: "Member not found in this mess" }, { status: 404 });
    }

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    
    const result = await sql`
      INSERT INTO deposits (mess_id, member_id, month_id, date, amount, note, created_at)
      VALUES (${manager.mess_id}, ${member_id}, ${month.id}, ${date}, ${amount}, ${note || null}, ${now})
      RETURNING *
    `;

    const created = {
      ...result[0],
      amount: Number(result[0].amount),
      member_id: Number(result[0].member_id),
      month_id: Number(result[0].month_id),
      mess_id: Number(result[0].mess_id)
    };

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to create deposit" }, { status: 500 });
  }
}
