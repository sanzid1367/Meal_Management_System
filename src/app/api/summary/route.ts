import { NextResponse } from 'next/server';
import { getActiveMonth, buildSummary } from '@/lib/db-helpers';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();

    const user = await getCurrentUser(request);
    if (!user || !user.mess_id) {
      return NextResponse.json({ detail: "Authentication and mess assignment required" }, { status: 401 });
    }

    if (user.role !== 'super_admin') {
      if (user.membership_status === 'pending') {
        const month = await getActiveMonth(user.mess_id);
        return NextResponse.json({
          mess: { id: user.mess_id, name: user.mess_name || 'Mess' },
          month,
          members: [],
          member_summaries: [],
          totals: {
            total_expense: 0,
            total_deposit: 0,
            opening_balance_total: 0,
            total_meals: 0,
            meal_rate: 0,
            cash_in_hand: 0,
            book_balance: 0
          }
        });
      }

      if (user.membership_status === 'removed') {
        return NextResponse.json({ 
          detail: "Your membership has been deactivated by the manager.",
          code: "MEMBERSHIP_INACTIVE",
          membership_status: user.membership_status
        }, { status: 403 });
      }
    }

    const isPrivileged = user.role === 'manager' || user.role === 'super_admin';
    const messId = user.mess_id;

    const month = await getActiveMonth(messId);
    const summary = await buildSummary(messId, month.id);

    const sanitizedMembers = isPrivileged 
      ? summary.members 
      : (summary.members as any[]).map(m => ({ ...m, phone: user.member_id === m.id ? m.phone : null }));
      
    const sanitizedSummaries = isPrivileged 
      ? summary.member_summaries 
      : (summary.member_summaries as any[]).map(m => ({ ...m, phone: user.member_id === m.id ? m.phone : null }));

    return NextResponse.json({
      ...summary,
      members: sanitizedMembers,
      member_summaries: sanitizedSummaries
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch summary" }, { status: 500 });
  }
}
