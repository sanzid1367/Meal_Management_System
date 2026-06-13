import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, initDb } from '@/lib/db';
import { createAccessToken } from '@/lib/auth';

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

    // Get user
    const users = await sql`
      SELECT id, username, hashed_password, role, created_at 
      FROM users 
      WHERE username = ${username} 
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

    // Generate JWT access token
    const token = createAccessToken(user.username);

    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Authentication failed" }, { status: 500 });
  }
}
