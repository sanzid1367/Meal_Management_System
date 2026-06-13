import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(user);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch user" }, { status: 500 });
  }
}
