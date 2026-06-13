import { NextResponse } from 'next/server';
import { getActiveMonth, buildSummary } from '@/lib/db-helpers';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    

    const adminUser = await getCurrentUser(request);
    const isAdmin = adminUser?.role === 'admin';

    const month = await getActiveMonth();
    const summary = await buildSummary(month.id);

    const sanitizedMembers = isAdmin 
      ? summary.members 
      : (summary.members as any[]).map(m => ({ ...m, phone: null }));
      
    const sanitizedSummaries = isAdmin 
      ? summary.member_summaries 
      : (summary.member_summaries as any[]).map(m => ({ ...m, phone: null }));

    return NextResponse.json({
      ...summary,
      members: sanitizedMembers,
      member_summaries: sanitizedSummaries
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch summary" }, { status: 500 });
  }
}
