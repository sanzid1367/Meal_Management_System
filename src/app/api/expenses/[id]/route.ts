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
    const expenseId = parseInt(id);

    const currentList = await sql`
      SELECT id FROM expenses WHERE id = ${expenseId} LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Expense not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.shopper_member_id !== undefined) {
      if (body.shopper_member_id !== null) {
        const exists = await validateMember(body.shopper_member_id);
        if (!exists) {
          return NextResponse.json({ detail: "Shopper member not found" }, { status: 404 });
        }
      }
      updates.shopper_member_id = body.shopper_member_id;
    }
    if (body.date !== undefined) updates.date = body.date;
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.description !== undefined) updates.description = body.description.trim();

    if (Object.keys(updates).length > 0) {
      await sql`
        UPDATE expenses 
        SET ${sql(updates)} 
        WHERE id = ${expenseId}
      `;
    }

    const updatedList = await sql`
      SELECT * FROM expenses WHERE id = ${expenseId}
    `;
    const updated = {
      ...updatedList[0],
      amount: Number(updatedList[0].amount),
      shopper_member_id: updatedList[0].shopper_member_id ? Number(updatedList[0].shopper_member_id) : null
    };

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(
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
    const expenseId = parseInt(id);

    const currentList = await sql`
      SELECT id FROM expenses WHERE id = ${expenseId} LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Expense not found" }, { status: 404 });
    }

    await sql`
      DELETE FROM expenses WHERE id = ${expenseId}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to delete expense" }, { status: 500 });
  }
}
