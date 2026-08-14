import { NextResponse } from 'next/server';
import { getActiveMonth, buildSummary, getDefaultMessId } from '@/lib/db-helpers';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();

    const user = await getCurrentUser(request);

    // If user is authenticated, enforce active membership check
    if (user) {
      if (user.role !== 'super_admin' && user.membership_status !== 'active') {
        return NextResponse.json({ 
          detail: user.membership_status === 'removed' 
            ? "Your membership has been deactivated by the manager." 
            : "You are not attached to an active mess.",
          code: "MEMBERSHIP_INACTIVE",
          membership_status: user.membership_status
        }, { status: 403 });
      }
    }

    const isPrivileged = user?.role === 'manager' || user?.role === 'super_admin';
    const messId = user?.mess_id || (await getDefaultMessId());

    const month = await getActiveMonth(messId);
    const summary = await buildSummary(messId, month.id);

    const sanitizedMembers = isPrivileged 
      ? summary.members 
      : (summary.members as any[]).map(m => ({ ...m, phone: user?.member_id === m.id ? m.phone : null }));
      
    const sanitizedSummaries = isPrivileged 
      ? summary.member_summaries 
      : (summary.member_summaries as any[]).map(m => ({ ...m, phone: user?.member_id === m.id ? m.phone : null }));

    return NextResponse.json({
      ...summary,
      members: sanitizedMembers,
      member_summaries: sanitizedSummaries
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch summary" }, { status: 500 });
  }
}
