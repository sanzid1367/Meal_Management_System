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

    const expenses = await sql`
      SELECT e.*, m.name AS shopper_name
      FROM expenses e
      LEFT JOIN members m ON m.id = e.shopper_member_id
      WHERE e.month_id = ${month.id} AND e.mess_id = ${messId}
      ORDER BY e.date DESC, e.id DESC
    `;

    const processed = expenses.map((e: any) => ({
      ...e,
      amount: Number(e.amount),
      shopper_member_id: e.shopper_member_id ? Number(e.shopper_member_id) : null,
      month_id: Number(e.month_id),
      mess_id: Number(e.mess_id)
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch expenses" }, { status: 500 });
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
    const { date, amount, description, shopper_member_id } = await request.json();

    if (!date || amount === undefined || !description) {
      return NextResponse.json({ detail: "Date, amount, and description are required" }, { status: 400 });
    }

    if (shopper_member_id !== null && shopper_member_id !== undefined) {
      const shopperExists = await validateMember(manager.mess_id, shopper_member_id);
      if (!shopperExists) {
        return NextResponse.json({ detail: "Shopper member not found in your mess" }, { status: 404 });
      }
    }

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    
    const result = await sql`
      INSERT INTO expenses (mess_id, month_id, date, amount, description, shopper_member_id, created_at)
      VALUES (${manager.mess_id}, ${month.id}, ${date}, ${amount}, ${description.trim()}, ${shopper_member_id || null}, ${now})
      RETURNING *
    `;

    const created = {
      ...result[0],
      amount: Number(result[0].amount),
      shopper_member_id: result[0].shopper_member_id ? Number(result[0].shopper_member_id) : null,
      month_id: Number(result[0].month_id),
      mess_id: Number(result[0].mess_id)
    };

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to create expense" }, { status: 500 });
  }
}
