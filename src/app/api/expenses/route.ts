import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getActiveMonth, validateMember } from '@/lib/db-helpers';
import { getCurrentUser, requireAdmin } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }

    const month = await getActiveMonth();

    const expenses = await sql`
      SELECT e.*, m.name AS shopper_name
      FROM expenses e
      LEFT JOIN members m ON m.id = e.shopper_member_id
      WHERE e.month_id = ${month.id}
      ORDER BY e.date DESC, e.id DESC
    `;

    const processed = expenses.map(e => ({
      ...e,
      amount: Number(e.amount),
      shopper_member_id: e.shopper_member_id ? Number(e.shopper_member_id) : null
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const month = await getActiveMonth();
    const { date, amount, description, shopper_member_id } = await request.json();

    if (!date || amount === undefined || !description) {
      return NextResponse.json({ detail: "Date, amount, and description are required" }, { status: 400 });
    }

    if (shopper_member_id !== null && shopper_member_id !== undefined) {
      const shopperExists = await validateMember(shopper_member_id);
      if (!shopperExists) {
        return NextResponse.json({ detail: "Shopper member not found" }, { status: 404 });
      }
    }

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    
    const result = await sql`
      INSERT INTO expenses (month_id, date, amount, description, shopper_member_id, created_at)
      VALUES (${month.id}, ${date}, ${amount}, ${description.trim()}, ${shopper_member_id || null}, ${now})
      RETURNING *
    `;

    const created = {
      ...result[0],
      amount: Number(result[0].amount),
      shopper_member_id: result[0].shopper_member_id ? Number(result[0].shopper_member_id) : null
    };

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to create expense" }, { status: 500 });
  }
}
