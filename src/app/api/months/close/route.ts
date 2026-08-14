import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { getActiveMonth, buildSummary } from '@/lib/db-helpers';
import { requireManager } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await initDb();
    const manager = await requireManager(request);
    if (!manager || !manager.mess_id) {
      return NextResponse.json({ detail: "Not enough permissions or no mess assigned" }, { status: 403 });
    }

    const messId = manager.mess_id;
    const month = await getActiveMonth(messId);
    const summary = await buildSummary(messId, month.id);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    let newMonthResult: any;

    await sql.begin(async (sql: any) => {
      // 1. Save closing summary
      await sql`
        INSERT INTO month_closings (mess_id, month_id, summary_json, closed_at)
        VALUES (${messId}, ${month.id}, ${JSON.stringify(summary)}, ${now})
        ON CONFLICT (month_id)
        DO UPDATE SET summary_json = EXCLUDED.summary_json, closed_at = EXCLUDED.closed_at, mess_id = EXCLUDED.mess_id
      `;

      // 2. Set current month to inactive
      await sql`
        UPDATE months 
        SET is_active = 0, closed_at = ${now} 
        WHERE id = ${month.id} AND mess_id = ${messId}
      `;

      // 3. Compute next month details
      const currentStart = new Date(month.start_date);
      const nextMonthStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
      const nextName = nextMonthStart.toISOString().slice(0, 7); // "YYYY-MM"
      const nextStartDateStr = nextMonthStart.toISOString().slice(0, 10); // "YYYY-MM-DD"

      // 4. Create and activate next month for this mess
      const existingNext = await sql`
        SELECT id FROM months WHERE mess_id = ${messId} AND name = ${nextName} LIMIT 1
      `;

      if (existingNext.length > 0) {
        await sql`
          UPDATE months 
          SET is_active = 1 
          WHERE id = ${existingNext[0].id}
        `;
        newMonthResult = { ...existingNext[0], name: nextName, start_date: nextStartDateStr, is_active: 1 };
      } else {
        const insertNext = await sql`
          INSERT INTO months (mess_id, name, start_date, is_active)
          VALUES (${messId}, ${nextName}, ${nextStartDateStr}, 1)
          RETURNING *
        `;
        newMonthResult = insertNext[0];
      }

      // 5. Roll over opening balances
      const rolloverPromises = summary.member_summaries.map((member: any) => {
        const balance = Math.round(member.balance * 100) / 100;
        return sql`
          INSERT INTO opening_balances (mess_id, member_id, month_id, amount, note, created_at)
          VALUES (${messId}, ${member.id}, ${newMonthResult.id}, ${balance}, ${`Rollover from ${month.name}`}, ${now})
          ON CONFLICT (member_id, month_id)
          DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, mess_id = EXCLUDED.mess_id
        `;
      });
      await Promise.all(rolloverPromises);
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
