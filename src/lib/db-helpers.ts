import { sql } from './db';

export interface Month {
  id: number;
  name: string;
  start_date: string;
  closed_at: string | null;
  is_active: number;
}

export interface Member {
  id: number;
  name: string;
  phone: string | null;
  entry_date: string;
  is_active: number;
  created_at: string;
  deactivated_at: string | null;
}

export async function getActiveMonth(): Promise<Month> {
  const active = await sql<Month[]>`
    SELECT id, name, start_date, closed_at, is_active 
    FROM months 
    WHERE is_active = 1 
    LIMIT 1
  `;
  if (active.length === 0) {
    const today = new Date();
    // YYYY-MM in local time or UTC
    const monthName = today.toISOString().slice(0, 7);
    const startDate = `${monthName}-01`;
    
    // Insert new month
    const insert = await sql<Month[]>`
      INSERT INTO months (name, start_date, is_active)
      VALUES (${monthName}, ${startDate}, 1)
      ON CONFLICT (name) 
      DO UPDATE SET is_active = 1
      RETURNING id, name, start_date, closed_at, is_active
    `;
    return insert[0];
  }
  return active[0];
}

export async function validateMember(memberId: number): Promise<boolean> {
  const member = await sql`
    SELECT id FROM members WHERE id = ${memberId} LIMIT 1
  `;
  return member.length > 0;
}

export async function buildSummary(monthId: number) {
  // 1. Fetch Month Info
  const months = await sql`
    SELECT id, name, start_date, closed_at, is_active 
    FROM months 
    WHERE id = ${monthId}
  `;
  if (months.length === 0) {
    throw new Error("Month not found");
  }
  const month = months[0];

  // 2. Fetch Members with their opening balances
  const members = await sql`
    SELECT m.id, m.name, m.phone, m.entry_date, m.is_active, m.created_at, m.deactivated_at,
           COALESCE(ob.amount, 0) AS opening_balance,
           ob.note AS opening_note
    FROM members m
    LEFT JOIN opening_balances ob
      ON ob.member_id = m.id AND ob.month_id = ${monthId}
    ORDER BY m.is_active DESC, LOWER(m.name)
  `;

  // Parse types
  for (const m of members) {
    m.opening_balance = Number(m.opening_balance || 0);
    m.is_active = Number(m.is_active);
  }

  // 3. Fetch Sums
  const expenseResult = await sql`
    SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE month_id = ${monthId}
  `;
  const depositResult = await sql`
    SELECT COALESCE(SUM(amount), 0) AS value FROM deposits WHERE month_id = ${monthId}
  `;
  const openingResult = await sql`
    SELECT COALESCE(SUM(amount), 0) AS value FROM opening_balances WHERE month_id = ${monthId}
  `;
  const mealsResult = await sql`
    SELECT COALESCE(SUM(count + guest_count), 0) AS value FROM meal_entries WHERE month_id = ${monthId}
  `;

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
    LEFT JOIN opening_balances ob ON ob.member_id = m.id AND ob.month_id = ${monthId}
    LEFT JOIN (
      SELECT member_id, SUM(amount) AS total_deposit
      FROM deposits WHERE month_id = ${monthId} GROUP BY member_id
    ) d ON d.member_id = m.id
    LEFT JOIN (
      SELECT member_id,
             SUM(count) AS total_member_meals,
             SUM(guest_count) AS total_guest_meals
      FROM meal_entries WHERE month_id = ${monthId} GROUP BY member_id
    ) me ON me.member_id = m.id
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
      id: m.id,
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
    month,
    members,
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
