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
    const depositId = parseInt(id);

    const currentList = await sql`
      SELECT id FROM deposits 
      WHERE id = ${depositId} AND mess_id = ${manager.mess_id} 
      LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Deposit not found in your mess" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.member_id !== undefined) {
      const exists = await validateMember(manager.mess_id, body.member_id);
      if (!exists) {
        return NextResponse.json({ detail: "Member not found in your mess" }, { status: 404 });
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
        WHERE id = ${depositId} AND mess_id = ${manager.mess_id}
      `;
    }

    const updatedList = await sql`
      SELECT * FROM deposits WHERE id = ${depositId} AND mess_id = ${manager.mess_id}
    `;
    const updated = {
      ...updatedList[0],
      amount: Number(updatedList[0].amount),
      member_id: Number(updatedList[0].member_id),
      month_id: Number(updatedList[0].month_id),
      mess_id: Number(updatedList[0].mess_id)
    };

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update deposit" }, { status: 500 });
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
    const depositId = parseInt(id);

    const currentList = await sql`
      SELECT id FROM deposits 
      WHERE id = ${depositId} AND mess_id = ${manager.mess_id} 
      LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Deposit not found in your mess" }, { status: 404 });
    }

    await sql`
      DELETE FROM deposits WHERE id = ${depositId} AND mess_id = ${manager.mess_id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to delete deposit" }, { status: 500 });
  }
}
