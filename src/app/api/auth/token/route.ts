import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, initDb } from '@/lib/db';
import { createAccessToken } from '@/lib/auth';
import { UserRole } from '@/types';

export async function POST(request: Request) {
  try {
    await initDb();
    
    // Support both URL-encoded form data (OAuth2 standard) and JSON
    let username = "";
    let password = "";
    
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      username = (formData.get("username") as string) || "";
      password = (formData.get("password") as string) || "";
    } else {
      const body = await request.json();
      username = body.username || "";
      password = body.password || "";
    }

    if (!username || !password) {
      return NextResponse.json({ detail: "Username and password required" }, { status: 400 });
    }

    // Get user and their mess details
    const users = await sql`
      SELECT u.id, u.username, u.hashed_password, u.role, u.mess_id, u.member_id, u.created_at,
             m.name AS mess_name
      FROM users u
      LEFT JOIN messes m ON m.id = u.mess_id
      WHERE LOWER(u.username) = LOWER(${username}) 
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({ detail: "Incorrect username or password" }, { status: 401 });
    }

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.hashed_password);
    
    if (!isPasswordValid) {
      return NextResponse.json({ detail: "Incorrect username or password" }, { status: 401 });
    }

    // Normalize role
    let normalizedRole: UserRole = 'member';
    if (user.role === 'super_admin' || user.role === 'admin') {
      normalizedRole = user.role === 'super_admin' ? 'super_admin' : 'manager';
    } else if (user.role === 'manager') {
      normalizedRole = 'manager';
    }

    const userPayload = {
      id: Number(user.id),
      username: user.username,
      role: normalizedRole,
      mess_id: user.mess_id ? Number(user.mess_id) : null,
      member_id: user.member_id ? Number(user.member_id) : null,
      created_at: user.created_at,
      mess_name: user.mess_name || undefined
    };

    // Generate JWT access token with all claims
    const token = createAccessToken(userPayload);

    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      user: userPayload
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Authentication failed" }, { status: 500 });
  }
}
