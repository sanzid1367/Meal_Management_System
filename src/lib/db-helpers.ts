import { sql } from './db';
import { Month, Member, Summary } from '@/types';

export async function getDefaultMessId(): Promise<number> {
  const messes = await sql`SELECT id FROM messes ORDER BY id ASC LIMIT 1`;
  if (messes.length > 0) {
    return Number(messes[0].id);
  }
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const created = await sql`
    INSERT INTO messes (name, join_code, created_at)
    VALUES ('Main Mess', 'MESSSYNC01', ${now})
    RETURNING id
  `;
  return Number(created[0].id);
}

export async function getActiveMonth(messId?: number): Promise<Month> {
  const targetMessId = Number(messId || (await getDefaultMessId()));

  const active = await sql<Month[]>`
    SELECT id, mess_id, name, start_date, closed_at, is_active 
    FROM months 
    WHERE mess_id = ${targetMessId} AND is_active = 1 
    LIMIT 1
  `;
  if (active.length === 0) {
    const today = new Date();
    // YYYY-MM
    const monthName = today.toISOString().slice(0, 7);
    const startDate = `${monthName}-01`;
    
    // Check if month already exists for this mess
    const existing = await sql<Month[]>`
      SELECT id, mess_id, name, start_date, closed_at, is_active
      FROM months
      WHERE mess_id = ${targetMessId} AND name = ${monthName}
      LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE months SET is_active = 1 WHERE id = ${existing[0].id}
      `;
      return { 
        id: Number(existing[0].id),
        mess_id: Number(existing[0].mess_id),
        name: existing[0].name,
        start_date: existing[0].start_date,
        closed_at: existing[0].closed_at,
        is_active: 1 
      };
    }

    // Insert new month for this mess (or recover if concurrently inserted)
    try {
      const insert = await sql<Month[]>`
        INSERT INTO months (mess_id, name, start_date, is_active)
        VALUES (${targetMessId}, ${monthName}, ${startDate}, 1)
        RETURNING id, mess_id, name, start_date, closed_at, is_active
      `;
      return {
        id: Number(insert[0].id),
        mess_id: Number(insert[0].mess_id),
        name: insert[0].name,
        start_date: insert[0].start_date,
        closed_at: insert[0].closed_at,
        is_active: 1
      };
    } catch (insertErr) {
      const fallback = await sql<Month[]>`
        SELECT id, mess_id, name, start_date, closed_at, is_active
        FROM months
        WHERE mess_id = ${targetMessId} AND name = ${monthName}
        LIMIT 1
      `;
      if (fallback.length > 0) {
        return {
          id: Number(fallback[0].id),
          mess_id: Number(fallback[0].mess_id),
          name: fallback[0].name,
          start_date: fallback[0].start_date,
          closed_at: fallback[0].closed_at,
          is_active: 1
        };
      }
      throw insertErr;
    }
  }
  return {
    id: Number(active[0].id),
    mess_id: Number(active[0].mess_id),
    name: active[0].name,
    start_date: active[0].start_date,
    closed_at: active[0].closed_at,
    is_active: 1
  };
}

export async function validateMember(messId: number, memberId: number): Promise<boolean> {
  const member = await sql`
    SELECT id FROM members 
    WHERE id = ${Number(memberId)} AND mess_id = ${Number(messId)} AND is_active = 1
    LIMIT 1
  `;
  return member.length > 0;
}

export async function buildSummary(messId: number, monthId: number): Promise<Summary> {
  const numericMessId = Number(messId);
  const numericMonthId = Number(monthId);

  // 1. Fetch Mess
  const messes = await sql`
    SELECT id, name, join_code, created_at, created_by
    FROM messes
    WHERE id = ${numericMessId}
    LIMIT 1
  `;
  const mess = messes.length > 0 ? {
    id: Number(messes[0].id),
    name: messes[0].name,
    join_code: messes[0].join_code,
    created_at: messes[0].created_at,
    created_by: messes[0].created_by ? Number(messes[0].created_by) : null
  } : undefined;

  // 1b. Fetch Month
  const months = await sql`
    SELECT id, mess_id, name, start_date, closed_at, is_active
    FROM months
    WHERE id = ${numericMonthId}
    LIMIT 1
  `;
  const month = months.length > 0 ? {
    id: Number(months[0].id),
    mess_id: Number(months[0].mess_id),
    name: months[0].name,
    start_date: months[0].start_date,
    closed_at: months[0].closed_at,
    is_active: Number(months[0].is_active)
  } : {
    id: numericMonthId,
    mess_id: numericMessId,
    name: new Date().toISOString().slice(0, 7),
    start_date: `${new Date().toISOString().slice(0, 7)}-01`,
    closed_at: null,
    is_active: 1
  };

  // 1c. Auto-sync: Ensure all users attached to this mess have a member profile
  try {
    const usersInMess = await sql`
      SELECT id, username, mess_id, created_at FROM users WHERE mess_id = ${numericMessId}
    `;
    for (const u of usersInMess) {
      const existingMember = await sql`
        SELECT id FROM members WHERE mess_id = ${numericMessId} AND LOWER(name) = LOWER(${u.username}) LIMIT 1
      `;
      if (existingMember.length === 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const nowStr = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const inserted = await sql`
          INSERT INTO members (mess_id, name, entry_date, is_active, created_at, user_id)
          VALUES (${numericMessId}, ${u.username}, ${todayStr}, 1, ${nowStr}, ${u.id})
          RETURNING id
        `;
        if (inserted.length > 0) {
          await sql`UPDATE users SET member_id = ${inserted[0].id} WHERE id = ${u.id}`;
        }
      } else {
        await sql`UPDATE users SET member_id = ${existingMember[0].id} WHERE id = ${u.id} AND member_id IS NULL`;
      }
    }
  } catch (syncErr) {
    console.warn("Auto-sync error in buildSummary:", syncErr);
  }

  // 2. Fetch Members with their opening balances
  const members = await sql`
    SELECT m.id, m.mess_id, m.name, m.phone, m.entry_date, m.is_active, m.created_at, m.deactivated_at,
           COALESCE(ob.amount, 0) AS opening_balance,
           ob.note AS opening_note
    FROM members m
    LEFT JOIN opening_balances ob
      ON ob.member_id = m.id AND ob.month_id = ${numericMonthId}
    WHERE m.mess_id = ${numericMessId}
    ORDER BY m.is_active DESC, LOWER(m.name)
  `;

  // Parse types
  const parsedMembers = members.map((m: any) => ({
    ...m,
    id: Number(m.id),
    mess_id: Number(m.mess_id),
    opening_balance: Number(m.opening_balance || 0),
    is_active: Number(m.is_active)
  }));

  // 3. Fetch Sums
  const [expenseResult, depositResult, openingResult, mealsResult] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE month_id = ${numericMonthId} AND mess_id = ${numericMessId}
    `,
    sql`
      SELECT COALESCE(SUM(amount), 0) AS value FROM deposits WHERE month_id = ${numericMonthId} AND mess_id = ${numericMessId}
    `,
    sql`
      SELECT COALESCE(SUM(amount), 0) AS value FROM opening_balances WHERE month_id = ${numericMonthId} AND mess_id = ${numericMessId}
    `,
    sql`
      SELECT COALESCE(SUM(count + guest_count), 0) AS value FROM meal_entries WHERE month_id = ${numericMonthId} AND mess_id = ${numericMessId}
    `
  ]);

  const total_expense = Number(expenseResult[0].value || 0);
  const total_deposit = Number(depositResult[0].value || 0);
  const opening_total = Number(openingResult[0].value || 0);
  const total_meals = Number(mealsResult[0].value || 0);

  const meal_rate = total_meals > 0 ? total_expense / total_meals : 0;

  // 4. Fetch Member Wise Summary
  const memberSummaries = await sql`
    SELECT m.id, m.name, m.phone, m.is_active,
           COALESCE(ob.amount, 0) AS opening_balance,
           COALESCE(d.total_deposit, 0) AS total_deposit,
           COALESCE(me.total_member_meals, 0) AS total_member_meals,
           COALESCE(me.total_guest_meals, 0) AS total_guest_meals
    FROM members m
    LEFT JOIN opening_balances ob ON ob.member_id = m.id AND ob.month_id = ${numericMonthId}
    LEFT JOIN (
      SELECT member_id, SUM(amount) AS total_deposit
      FROM deposits WHERE month_id = ${numericMonthId} AND mess_id = ${numericMessId} GROUP BY member_id
    ) d ON d.member_id = m.id
    LEFT JOIN (
      SELECT member_id,
             SUM(count) AS total_member_meals,
             SUM(guest_count) AS total_guest_meals
      FROM meal_entries WHERE month_id = ${numericMonthId} AND mess_id = ${numericMessId} GROUP BY member_id
    ) me ON me.member_id = m.id
    WHERE m.mess_id = ${numericMessId}
    ORDER BY m.is_active DESC, LOWER(m.name)
  `;

  // Parse types & calculate balances
  const processedSummaries = memberSummaries.map((m: any) => {
    const opening_balance = Number(m.opening_balance || 0);
    const total_deposit = Number(m.total_deposit || 0);
    const total_member_meals = Number(m.total_member_meals || 0);
    const total_guest_meals = Number(m.total_guest_meals || 0);
    
    const meals = total_member_meals + total_guest_meals;
    const meal_cost = meals * meal_rate;
    const available_funds = opening_balance + total_deposit;
    const balance = available_funds - meal_cost;

    return {
      id: Number(m.id),
      name: m.name,
      phone: m.phone,
      is_active: Number(m.is_active),
      opening_balance,
      total_deposit,
      total_member_meals,
      total_guest_meals,
      total_meals: meals,
      meal_cost,
      available_funds,
      balance
    };
  });

  return {
    mess,
    month,
    members: parsedMembers as any[],
    member_summaries: processedSummaries,
    totals: {
      total_expense,
      total_deposit,
      opening_balance_total: opening_total,
      total_meals,
      meal_rate,
      cash_in_hand: total_deposit - total_expense,
      book_balance: total_deposit + opening_total - total_expense,
    }
  };
}
