import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireManager } from '@/lib/auth';
import { getActiveMonth } from '@/lib/db-helpers';

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
    const memberId = parseInt(id);

    const currentList = await sql`
      SELECT * FROM members 
      WHERE id = ${memberId} AND mess_id = ${manager.mess_id} 
      LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Member not found in your mess" }, { status: 404 });
    }
    const current = currentList[0];

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.phone !== undefined) updates.phone = body.phone || null;
    if (body.entry_date !== undefined) updates.entry_date = body.entry_date;
    
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'active') {
        updates.is_active = 1;
        updates.deactivated_at = null;
      } else if (body.status === 'rejected') {
        updates.is_active = 0;
        updates.deactivated_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      }
    } else if (body.is_active !== undefined) {
      const is_active = body.is_active ? 1 : 0;
      updates.is_active = is_active;
      
      const currentActive = Number(current.is_active);
      if (is_active === 0 && currentActive === 1) {
        updates.deactivated_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      } else if (is_active === 1) {
        updates.deactivated_at = null;
        updates.status = 'active';
      }
    }

    if (Object.keys(updates).length > 0) {
      await sql`
        UPDATE members 
        SET ${sql(updates)} 
        WHERE id = ${memberId} AND mess_id = ${manager.mess_id}
      `;
    }

    // If member was activated/approved, ensure they have opening balance in active month
    if (updates.is_active === 1 || updates.status === 'active') {
      try {
        const activeMonth = await getActiveMonth(manager.mess_id);
        if (activeMonth) {
          const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
          await sql`
            INSERT INTO opening_balances (member_id, month_id, amount, note, created_at, mess_id)
            VALUES (${memberId}, ${activeMonth.id}, 0, 'Approved by manager', ${now}, ${manager.mess_id})
            ON CONFLICT (member_id, month_id) DO NOTHING
          `;
        }
      } catch (e) {
        console.warn("Could not create opening balance on approval:", e);
      }
    }

    const updatedList = await sql`
      SELECT * FROM members WHERE id = ${memberId} AND mess_id = ${manager.mess_id}
    `;
    const updated = {
      ...updatedList[0],
      is_active: Number(updatedList[0].is_active)
    };

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update member" }, { status: 500 });
  }
}
