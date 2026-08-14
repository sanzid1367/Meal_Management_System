import { sql } from './db';
import { Month, Member, Summary } from '@/types';

export async function getDefaultMessId(): Promise<number> {
  const messes = await sql`SELECT id FROM messes ORDER BY id ASC LIMIT 1`;
  if (messes.length > 0) {
    return messes[0].id;
  }
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const created = await sql`
    INSERT INTO messes (name, join_code, created_at)
    VALUES ('Main Mess', 'MESSSYNC01', ${now})
    RETURNING id
  `;
  return created[0].id;
}

export async function getActiveMonth(messId?: number): Promise<Month> {
  const targetMessId = messId || (await getDefaultMessId());

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
      return { ...existing[0], is_active: 1 };
    }

    // Insert new month for this mess
    const insert = await sql<Month[]>`
      INSERT INTO months (mess_id, name, start_date, is_active)
      VALUES (${targetMessId}, ${monthName}, ${startDate}, 1)
      RETURNING id, mess_id, name, start_date, closed_at, is_active
    `;
    return insert[0];
  }
  return active[0];
}

export async function validateMember(messId: number, memberId: number): Promise<boolean> {
  const member = await sql`
    SELECT id FROM members WHERE id = ${memberId} AND mess_id = ${messId} LIMIT 1
  `;
  return member.length > 0;
}

export async function buildSummary(messId: number, monthId: number): Promise<Summary> {
  // 1. Fetch Month Info
  const months = await sql`
    SELECT id, mess_id, name, start_date, closed_at, is_active 
    FROM months 
    WHERE id = ${monthId} AND mess_id = ${messId}
  `;
  if (months.length === 0) {
    throw new Error("Month not found for this mess");
  }
  const month = months[0] as Month;

  // 1b. Fetch Mess Info
  const messes = await sql`
    SELECT id, name, join_code, created_at, created_by
    FROM messes
    WHERE id = ${messId}
    LIMIT 1
  `;
  const mess = messes.length > 0 ? {
    id: messes[0].id,
    name: messes[0].name,
    join_code: messes[0].join_code,
    created_at: messes[0].created_at,
    created_by: messes[0].created_by
  } : undefined;

  // 1c. Auto-sync: Ensure all registered users in this mess exist in members table
  await sql`
    INSERT INTO members (mess_id, name, entry_date, is_active, created_at, user_id)
    SELECT u.mess_id, u.username, CURRENT_DATE::text, 1, u.created_at, u.id
    FROM users u
    LEFT JOIN members m ON m.mess_id = u.mess_id AND LOWER(m.name) = LOWER(u.username)
    WHERE u.mess_id = ${messId} AND m.id IS NULL
    ON CONFLICT DO NOTHING;
  `;

  await sql`
    UPDATE users u
    SET member_id = m.id
    FROM members m
    WHERE u.mess_id = ${messId} 
      AND m.mess_id = ${messId} 
      AND LOWER(m.name) = LOWER(u.username) 
      AND u.member_id IS NULL;
  `;

  // 1d. Auto-create opening balances of 0 for members in this active month
  await sql`
    INSERT INTO opening_balances (member_id, month_id, amount, note, created_at, mess_id)
    SELECT m.id, ${monthId}, 0, 'Auto-enrolled', CURRENT_TIMESTAMP::text, ${messId}
    FROM members m
    LEFT JOIN opening_balances ob ON ob.member_id = m.id AND ob.month_id = ${monthId}
    WHERE m.mess_id = ${messId} AND ob.id IS NULL
    ON CONFLICT (member_id, month_id) DO NOTHING;
  `;

  // 2. Fetch Members with their opening balances
  const members = await sql`
    SELECT m.id, m.mess_id, m.name, m.phone, m.entry_date, m.is_active, m.created_at, m.deactivated_at,
           COALESCE(ob.amount, 0) AS opening_balance,
           ob.note AS opening_note
    FROM members m
    LEFT JOIN opening_balances ob
      ON ob.member_id = m.id AND ob.month_id = ${monthId} AND ob.mess_id = ${messId}
    WHERE m.mess_id = ${messId}
    ORDER BY m.is_active DESC, LOWER(m.name)
  `;

  // Parse types
  for (const m of members) {
    m.opening_balance = Number(m.opening_balance || 0);
    m.is_active = Number(m.is_active);
    m.mess_id = Number(m.mess_id);
  }

  // 3. Fetch Sums
  const [expenseResult, depositResult, openingResult, mealsResult] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE month_id = ${monthId} AND mess_id = ${messId}
    `,
    sql`
      SELECT COALESCE(SUM(amount), 0) AS value FROM deposits WHERE month_id = ${monthId} AND mess_id = ${messId}
    `,
    sql`
      SELECT COALESCE(SUM(amount), 0) AS value FROM opening_balances WHERE month_id = ${monthId} AND mess_id = ${messId}
    `,
    sql`
      SELECT COALESCE(SUM(count + guest_count), 0) AS value FROM meal_entries WHERE month_id = ${monthId} AND mess_id = ${messId}
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
    LEFT JOIN opening_balances ob ON ob.member_id = m.id AND ob.month_id = ${monthId} AND ob.mess_id = ${messId}
    LEFT JOIN (
      SELECT member_id, SUM(amount) AS total_deposit
      FROM deposits WHERE month_id = ${monthId} AND mess_id = ${messId} GROUP BY member_id
    ) d ON d.member_id = m.id
    LEFT JOIN (
      SELECT member_id,
             SUM(count) AS total_member_meals,
             SUM(guest_count) AS total_guest_meals
      FROM meal_entries WHERE month_id = ${monthId} AND mess_id = ${messId} GROUP BY member_id
    ) me ON me.member_id = m.id
    WHERE m.mess_id = ${messId}
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
    members: members as any[],
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
