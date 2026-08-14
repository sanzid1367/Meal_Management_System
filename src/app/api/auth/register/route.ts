import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, initDb } from '@/lib/db';
import { createAccessToken } from '@/lib/auth';
import { getDefaultMessId } from '@/lib/db-helpers';
import { UserRole } from '@/types';

function generateJoinCode(length = 7): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: Request) {
  try {
    await initDb();
    const { username, password, role, mess_id, mess_name } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ detail: "Username and password required" }, { status: 400 });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2) {
      return NextResponse.json({ detail: "Username must be at least 2 characters long" }, { status: 400 });
    }

    // Check if username is already registered
    const existing = await sql`
      SELECT id FROM users WHERE LOWER(username) = LOWER(${trimmedUsername}) LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ detail: "Username is already registered. Please sign in or choose another name." }, { status: 400 });
    }

    let targetMessId: number | null = null;
    let targetMessName = "";
    let targetRole: UserRole = role === 'manager' ? 'manager' : 'member';
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const today = new Date().toISOString().split('T')[0];

    // Manager creating a new Mess
    if (targetRole === 'manager' || (mess_name && !mess_id)) {
      if (!mess_name || !mess_name.trim()) {
        return NextResponse.json({ detail: "Please provide a name for your Mess." }, { status: 400 });
      }

      const cleanMessName = mess_name.trim();
      let code = generateJoinCode();
      const newMess = await sql`
        INSERT INTO messes (name, join_code, created_at)
        VALUES (${cleanMessName}, ${code}, ${now})
        RETURNING id, name
      `;
      targetMessId = newMess[0].id;
      targetMessName = newMess[0].name;
      targetRole = 'manager';
    } else if (mess_id) {
      // Member selecting an existing mess by ID
      const foundMess = await sql`
        SELECT id, name FROM messes WHERE id = ${Number(mess_id)} LIMIT 1
      `;
      if (foundMess.length === 0) {
        return NextResponse.json({ detail: "Selected Mess does not exist." }, { status: 400 });
      }
      targetMessId = foundMess[0].id;
      targetMessName = foundMess[0].name;
      targetRole = 'member';
    } else {
      // Fallback to default mess if none selected
      targetMessId = await getDefaultMessId();
      const defaultMess = await sql`SELECT id, name FROM messes WHERE id = ${targetMessId} LIMIT 1`;
      if (defaultMess.length > 0) {
        targetMessName = defaultMess[0].name;
      }
      targetRole = 'member';
    }

    // Check if there is an existing member profile matching the username in that mess
    let memberId: number | null = null;
    if (targetMessId) {
      const matchingMember = await sql`
        SELECT id FROM members 
        WHERE mess_id = ${targetMessId} AND LOWER(name) = LOWER(${trimmedUsername})
        LIMIT 1
      `;
      if (matchingMember.length > 0) {
        memberId = matchingMember[0].id;
      } else {
        // Automatically create a member profile for this member in the mess
        const newMember = await sql`
          INSERT INTO members (mess_id, name, entry_date, is_active, created_at)
          VALUES (${targetMessId}, ${trimmedUsername}, ${today}, 1, ${now})
          RETURNING id
        `;
        if (newMember.length > 0) {
          memberId = newMember[0].id;
        }
      }
    }

    // Hash password and insert user
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await sql`
      INSERT INTO users (username, hashed_password, role, mess_id, member_id, created_at)
      VALUES (${trimmedUsername}, ${hashedPassword}, ${targetRole}, ${targetMessId}, ${memberId}, ${now})
      RETURNING id, username, role, mess_id, member_id, created_at
    `;

    const user = result[0];
    const userPayload = {
      id: Number(user.id),
      username: user.username,
      role: targetRole,
      mess_id: user.mess_id ? Number(user.mess_id) : null,
      member_id: user.member_id ? Number(user.member_id) : null,
      created_at: user.created_at,
      mess_name: targetMessName,
      membership_status: 'active' as const
    };

    const token = createAccessToken(userPayload);

    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      user: userPayload
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Registration failed" }, { status: 500 });
  }
}
