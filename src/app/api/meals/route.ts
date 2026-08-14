import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { getActiveMonth, getDefaultMessId } from '@/lib/db-helpers';
import { getCurrentUser, requireManager } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await initDb();

    const user = await getCurrentUser(request);
    if (user && user.role !== 'super_admin' && user.membership_status !== 'active') {
      return NextResponse.json({ detail: "Active membership required", code: "MEMBERSHIP_INACTIVE" }, { status: 403 });
    }
    const messId = user?.mess_id || (await getDefaultMessId());

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const month = await getActiveMonth(messId);

    let meals;
    if (start && end) {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id} AND mess_id = ${messId} AND date >= ${start} AND date <= ${end}
        ORDER BY date, member_id, meal_type
      `;
    } else if (start) {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id} AND mess_id = ${messId} AND date >= ${start}
        ORDER BY date, member_id, meal_type
      `;
    } else if (end) {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id} AND mess_id = ${messId} AND date <= ${end}
        ORDER BY date, member_id, meal_type
      `;
    } else {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id} AND mess_id = ${messId}
        ORDER BY date, member_id, meal_type
      `;
    }

    const processed = meals.map((m: any) => ({
      ...m,
      count: Number(m.count),
      guest_count: Number(m.guest_count),
      member_id: Number(m.member_id),
      month_id: Number(m.month_id),
      mess_id: Number(m.mess_id)
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch meals" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await initDb();
    const manager = await requireManager(request);
    if (!manager || !manager.mess_id) {
      return NextResponse.json({ detail: "Not enough permissions or no mess assigned" }, { status: 403 });
    }

    const month = await getActiveMonth(manager.mess_id);
    const body = await request.json();
    const entries = body.entries;

    if (!Array.isArray(entries)) {
      return NextResponse.json({ detail: "Invalid payload. Expected an entries array." }, { status: 400 });
    }

    // Validate required fields and increments
    for (const entry of entries) {
      if (!entry.member_id || !entry.date || !entry.meal_type) {
        throw new Error("Missing required fields in meal entry");
      }
      const count = Number(entry.count || 0);
      const guestCount = Number(entry.guest_count || 0);
      if (Math.round(count * 2) !== count * 2) {
        throw new Error("Count must use 0.5 increments");
      }
      if (Math.round(guestCount * 2) !== guestCount * 2) {
        throw new Error("Guest count must use 0.5 increments");
      }
    }

    // Validate members outside the loop in a single batch query for this mess
    const memberIds = Array.from(new Set(entries.map((entry: any) => Number(entry.member_id))));
    if (memberIds.length > 0) {
      const existingMembers = await sql`
        SELECT id FROM members WHERE id IN ${sql(memberIds)} AND mess_id = ${manager.mess_id}
      `;
      const existingIds = new Set(existingMembers.map((m: any) => Number(m.id)));
      for (const id of memberIds) {
        if (!existingIds.has(id)) {
          throw new Error(`Member with ID ${id} not found in your mess`);
        }
      }
    }

    // Process in a transaction
    await sql.begin(async (sql: any) => {
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const insertPromises = entries.map((entry) => {
        const count = Number(entry.count || 0);
        const guestCount = Number(entry.guest_count || 0);
        return sql`
          INSERT INTO meal_entries (mess_id, month_id, member_id, date, meal_type, count, guest_count, updated_at)
          VALUES (${manager.mess_id}, ${month.id}, ${entry.member_id}, ${entry.date}, ${entry.meal_type}, ${count}, ${guestCount}, ${now})
          ON CONFLICT (month_id, member_id, date, meal_type)
          DO UPDATE SET count = EXCLUDED.count,
                        guest_count = EXCLUDED.guest_count,
                        updated_at = EXCLUDED.updated_at,
                        mess_id = EXCLUDED.mess_id
        `;
      });
      await Promise.all(insertPromises);
    });

    return NextResponse.json({ updated: entries.length });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update meals" }, { status: 500 });
  }
}
