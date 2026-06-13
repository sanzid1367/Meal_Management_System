import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { validateMember } from '@/lib/db-helpers';
import { requireAdmin } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function PATCH(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    await initDb();
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const { id } = await context.params;
    const depositId = parseInt(id);

    const currentList = await sql`
      SELECT id FROM deposits WHERE id = ${depositId} LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Deposit not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.member_id !== undefined) {
      const exists = await validateMember(body.member_id);
      if (!exists) {
        return NextResponse.json({ detail: "Member not found" }, { status: 404 });
      }
      updates.member_id = body.member_id;
    }
    if (body.date !== undefined) updates.date = body.date;
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.note !== undefined) updates.note = body.note || null;

    if (Object.keys(updates).length > 0) {
      await sql`
        UPDATE deposits 
        SET ${sql(updates)} 
        WHERE id = ${depositId}
      `;
    }

    const updatedList = await sql`
      SELECT * FROM deposits WHERE id = ${depositId}
    `;
    const updated = {
      ...updatedList[0],
      amount: Number(updatedList[0].amount)
    };

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update deposit" }, { status: 500 });
  }
}
