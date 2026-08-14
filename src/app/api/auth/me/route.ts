import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql, initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }

    let mess = null;
    if (user.mess_id && user.membership_status === 'active') {
      const messes = await sql`
        SELECT id, name, join_code, created_at, created_by 
        FROM messes 
        WHERE id = ${user.mess_id} 
        LIMIT 1
      `;
      if (messes.length > 0) {
        mess = messes[0];
      }
    }

    return NextResponse.json({
      ...user,
      mess
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch user" }, { status: 500 });
  }
}
