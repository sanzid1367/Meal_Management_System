import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, initDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    await initDb();
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ detail: "Username and password required" }, { status: 400 });
    }

    // Check if user exists
    const existing = await sql`
      SELECT id FROM users WHERE username = ${username} LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ detail: "Username already registered" }, { status: 400 });
    }

    // Hash password and insert
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    
    const result = await sql`
      INSERT INTO users (username, hashed_password, role, created_at)
      VALUES (${username}, ${hashedPassword}, 'member', ${now})
      RETURNING id, username, role, created_at
    `;

    return NextResponse.json(result[0], { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Registration failed" }, { status: 500 });
  }
}
