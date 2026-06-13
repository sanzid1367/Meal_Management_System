import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
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
    const memberId = parseInt(id);

    const currentList = await sql`
      SELECT * FROM members WHERE id = ${memberId} LIMIT 1
    `;
    if (currentList.length === 0) {
      return NextResponse.json({ detail: "Member not found" }, { status: 404 });
    }
    const current = currentList[0];

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.phone !== undefined) updates.phone = body.phone || null;
    if (body.entry_date !== undefined) updates.entry_date = body.entry_date;
    
    if (body.is_active !== undefined) {
      const is_active = body.is_active ? 1 : 0;
      updates.is_active = is_active;
      
      const currentActive = Number(current.is_active);
      if (is_active === 0 && currentActive === 1) {
        updates.deactivated_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      } else if (is_active === 1) {
        updates.deactivated_at = null;
      }
    }

    if (Object.keys(updates).length > 0) {
      await sql`
        UPDATE members 
        SET ${sql(updates)} 
        WHERE id = ${memberId}
      `;
    }

    const updatedList = await sql`
      SELECT * FROM members WHERE id = ${memberId}
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
