import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getActiveMonth, buildSummary } from '@/lib/db-helpers';
import { requireAdmin } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    await initDb();
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ detail: "Not enough permissions" }, { status: 403 });
    }

    const month = await getActiveMonth();
    const summary = await buildSummary(month.id);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    let newMonthResult: any;

    await sql.begin(async (sql) => {
      // 1. Save closing summary
      await sql`
        INSERT INTO month_closings (month_id, summary_json, closed_at)
        VALUES (${month.id}, ${JSON.stringify(summary)}, ${now})
        ON CONFLICT (month_id)
        DO UPDATE SET summary_json = EXCLUDED.summary_json, closed_at = EXCLUDED.closed_at
      `;

      // 2. Set current month to inactive
      await sql`
        UPDATE months 
        SET is_active = 0, closed_at = ${now} 
        WHERE id = ${month.id}
      `;

      // 3. Compute next month details
      const currentStart = new Date(month.start_date);
      const nextMonthStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
      const nextName = nextMonthStart.toISOString().slice(0, 7); // "YYYY-MM"
      const nextStartDateStr = nextMonthStart.toISOString().slice(0, 10); // "YYYY-MM-DD"

      // 4. Create and activate next month
      await sql`
        INSERT INTO months (name, start_date, is_active)
        VALUES (${nextName}, ${nextStartDateStr}, 0)
        ON CONFLICT (name) DO NOTHING
      `;

      const nextMonths = await sql`
        SELECT * FROM months WHERE name = ${nextName} LIMIT 1
      `;
      const nextMonth = nextMonths[0];

      await sql`
        UPDATE months 
        SET is_active = 1 
        WHERE id = ${nextMonth.id}
      `;

      // 5. Roll over opening balances
      for (const member of summary.member_summaries) {
        const balance = Math.round(member.balance * 100) / 100;
        await sql`
          INSERT INTO opening_balances (member_id, month_id, amount, note, created_at)
          VALUES (${member.id}, ${nextMonth.id}, ${balance}, ${`Rollover from ${month.name}`}, ${now})
          ON CONFLICT (member_id, month_id)
          DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note
        `;
      }

      newMonthResult = nextMonth;
    });

    return NextResponse.json({
      closed_month: month,
      new_month: newMonthResult,
      summary
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to close month" }, { status: 500 });
  }
}
