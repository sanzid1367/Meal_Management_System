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

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const month = await getActiveMonth();

    let meals;
    if (start && end) {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id} AND date >= ${start} AND date <= ${end}
        ORDER BY date, member_id, meal_type
      `;
    } else if (start) {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id} AND date >= ${start}
        ORDER BY date, member_id, meal_type
      `;
    } else if (end) {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id} AND date <= ${end}
        ORDER BY date, member_id, meal_type
      `;
    } else {
      meals = await sql`
        SELECT * FROM meal_entries 
        WHERE month_id = ${month.id}
        ORDER BY date, member_id, meal_type
      `;
    }

    const processed = meals.map(m => ({
      ...m,
      count: Number(m.count),
      guest_count: Number(m.guest_count),
      member_id: Number(m.member_id),
      month_id: Number(m.month_id)
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch meals" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await initDb();
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const month = await getActiveMonth();
    const body = await request.json();
    const entries = body.entries;

    if (!Array.isArray(entries)) {
      return NextResponse.json({ detail: "Invalid payload. Expected an entries array." }, { status: 400 });
    }

    // Process in a transaction
    await sql.begin(async (sql) => {
      for (const entry of entries) {
        if (!entry.member_id || !entry.date || !entry.meal_type) {
          throw new Error("Missing required fields in meal entry");
        }
        
        // Validate member
        const memberExists = await validateMember(entry.member_id);
        if (!memberExists) {
          throw new Error(`Member with ID ${entry.member_id} not found`);
        }

        // Validate increments of 0.5
        const count = Number(entry.count || 0);
        const guestCount = Number(entry.guest_count || 0);
        
        if (Math.round(count * 2) !== count * 2) {
          throw new Error("Count must use 0.5 increments");
        }
        if (Math.round(guestCount * 2) !== guestCount * 2) {
          throw new Error("Guest count must use 0.5 increments");
        }

        const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

        await sql`
          INSERT INTO meal_entries (month_id, member_id, date, meal_type, count, guest_count, updated_at)
          VALUES (${month.id}, ${entry.member_id}, ${entry.date}, ${entry.meal_type}, ${count}, ${guestCount}, ${now})
          ON CONFLICT (month_id, member_id, date, meal_type)
          DO UPDATE SET count = EXCLUDED.count,
                        guest_count = EXCLUDED.guest_count,
                        updated_at = EXCLUDED.updated_at
        `;
      }
    });

    return NextResponse.json({ updated: entries.length });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to update meals" }, { status: 500 });
  }
}
