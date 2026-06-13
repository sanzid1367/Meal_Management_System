import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getActiveMonth, validateMember } from '@/lib/db-helpers';
import { getCurrentUser, requireAdmin } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    

    const month = await getActiveMonth();

    const deposits = await sql`
      SELECT d.*, m.name AS member_name
      FROM deposits d
      JOIN members m ON m.id = d.member_id
      WHERE d.month_id = ${month.id}
      ORDER BY d.date DESC, d.id DESC
    `;

    const processed = deposits.map(d => ({
      ...d,
      amount: Number(d.amount)
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch deposits" }, { status: 500 });
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
    const { member_id, date, amount, note } = await request.json();

    if (!member_id || !date || amount === undefined) {
      return NextResponse.json({ detail: "Member ID, date, and amount are required" }, { status: 400 });
    }

    const memberExists = await validateMember(member_id);
    if (!memberExists) {
      return NextResponse.json({ detail: "Member not found" }, { status: 404 });
    }

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    
    const result = await sql`
      INSERT INTO deposits (member_id, month_id, date, amount, note, created_at)
      VALUES (${member_id}, ${month.id}, ${date}, ${amount}, ${note || null}, ${now})
      RETURNING *
    `;

    const created = {
      ...result[0],
      amount: Number(result[0].amount)
    };

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to create deposit" }, { status: 500 });
  }
}
