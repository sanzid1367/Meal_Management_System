import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { validateMember } from '@/lib/db-helpers';
import { requireManager } from '@/lib/auth';

export async function PATCH(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    await initDb();
    const manager = await requireManager(request);
    if (!manager || !manager.mess_id) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const { id } = await context.params;
    const expenseId = parseInt(id);

    const currentList = await sql`
      SELECT id FROM expenses 
      WHERE id = ${expenseId} AND mess_id = ${manager.mess_id} 
      LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Expense not found in your mess" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.shopper_member_id !== undefined) {
      if (body.shopper_member_id !== null) {
        const exists = await validateMember(manager.mess_id, body.shopper_member_id);
        if (!exists) {
          return NextResponse.json({ detail: "Shopper member not found in your mess" }, { status: 404 });
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
        WHERE id = ${expenseId} AND mess_id = ${manager.mess_id}
      `;
    }

    const updatedList = await sql`
      SELECT * FROM expenses WHERE id = ${expenseId} AND mess_id = ${manager.mess_id}
    `;
    const updated = {
      ...updatedList[0],
      amount: Number(updatedList[0].amount),
      shopper_member_id: updatedList[0].shopper_member_id ? Number(updatedList[0].shopper_member_id) : null,
      month_id: Number(updatedList[0].month_id),
      mess_id: Number(updatedList[0].mess_id)
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
    const manager = await requireManager(request);
    if (!manager || !manager.mess_id) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const { id } = await context.params;
    const expenseId = parseInt(id);

    const currentList = await sql`
      SELECT id FROM expenses 
      WHERE id = ${expenseId} AND mess_id = ${manager.mess_id} 
      LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Expense not found in your mess" }, { status: 404 });
    }

    await sql`
      DELETE FROM expenses WHERE id = ${expenseId} AND mess_id = ${manager.mess_id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to delete expense" }, { status: 500 });
  }
}
