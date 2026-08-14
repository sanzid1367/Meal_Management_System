import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sql, initDb } from '@/lib/db';
import { getCurrentUser, requireAuth, createAccessToken } from '@/lib/auth';

function generateJoinCode(length = 7): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function GET(request: Request) {
  try {
    await initDb();
    const user = await requireAuth(request);
    if (!user) {
      return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
    }

    if (user.role === 'super_admin') {
      const messes = await sql`
        SELECT m.id, m.name, m.join_code, m.created_at, m.created_by,
               COUNT(DISTINCT mem.id)::int AS member_count,
               COUNT(DISTINCT u.id)::int AS user_count
        FROM messes m
        LEFT JOIN members mem ON mem.mess_id = m.id
        LEFT JOIN users u ON u.mess_id = m.id
        GROUP BY m.id
        ORDER BY m.id ASC
      `;
      return NextResponse.json(messes);
    }

    if (!user.mess_id) {
      return NextResponse.json({ detail: "No mess assigned to user" }, { status: 404 });
    }

    const currentMess = await sql`
      SELECT m.id, m.name, m.join_code, m.created_at, m.created_by,
             COUNT(DISTINCT mem.id)::int AS member_count
      FROM messes m
      LEFT JOIN members mem ON mem.mess_id = m.id
      WHERE m.id = ${user.mess_id}
      GROUP BY m.id
      LIMIT 1
    `;

    if (currentMess.length === 0) {
      return NextResponse.json({ detail: "Mess not found" }, { status: 404 });
    }

    return NextResponse.json(currentMess[0]);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch mess info" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const user = await requireAuth(request);
    if (!user) {
      return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ detail: "Mess name is required" }, { status: 400 });
    }

    let joinCode = generateJoinCode();
    // Ensure uniqueness
    let exists = await sql`SELECT id FROM messes WHERE join_code = ${joinCode} LIMIT 1`;
    while (exists.length > 0) {
      joinCode = generateJoinCode();
      exists = await sql`SELECT id FROM messes WHERE join_code = ${joinCode} LIMIT 1`;
    }

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const createdMess = await sql`
      INSERT INTO messes (name, join_code, created_at, created_by)
      VALUES (${name}, ${joinCode}, ${now}, ${user.id})
      RETURNING *
    `;

    const mess = createdMess[0];

    // Always associate user with their newly created mess
    await sql`
      UPDATE users 
      SET mess_id = ${mess.id},
          role = CASE WHEN role = 'super_admin' THEN 'super_admin' ELSE 'manager' END
      WHERE id = ${user.id}
    `;

    // Refresh token with new claims
    const updatedUser = {
      username: user.username,
      id: user.id,
      role: user.role === 'super_admin' ? 'super_admin' : 'manager',
      mess_id: mess.id,
      member_id: user.member_id
    };

    const token = createAccessToken(updatedUser);

    return NextResponse.json({
      mess,
      user: updatedUser,
      access_token: token
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to create mess" }, { status: 500 });
  }
}
