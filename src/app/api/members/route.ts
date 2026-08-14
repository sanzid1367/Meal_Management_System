import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, initDb } from '@/lib/db';
import { getCurrentUser, requireManager } from '@/lib/auth';
import { getDefaultMessId, getActiveMonth } from '@/lib/db-helpers';

export async function GET(request: Request) {
  try {
    await initDb();

    const user = await getCurrentUser(request);
    if (user && user.role !== 'super_admin' && user.membership_status !== 'active') {
      return NextResponse.json({ detail: "Active membership required", code: "MEMBERSHIP_INACTIVE" }, { status: 403 });
    }
    const isPrivileged = user?.role === 'manager' || user?.role === 'super_admin';
    const messId = user?.mess_id || (await getDefaultMessId());

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    // Auto-sync: Ensure every registered user in this mess has a member profile
    try {
      const missingUsers = await sql`
        SELECT u.id, u.username, u.mess_id, u.created_at
        FROM users u
        WHERE u.mess_id = ${messId}
          AND NOT EXISTS (
            SELECT 1 FROM members m 
            WHERE m.mess_id = u.mess_id AND LOWER(m.name) = LOWER(u.username)
          )
      `;

      for (const u of missingUsers) {
        const todayStr = new Date().toISOString().split('T')[0];
        const nowStr = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const inserted = await sql`
          INSERT INTO members (mess_id, name, entry_date, is_active, created_at, user_id)
          VALUES (${u.mess_id}, ${u.username}, ${todayStr}, 1, ${nowStr}, ${u.id})
          RETURNING id
        `;
        if (inserted.length > 0) {
          await sql`UPDATE users SET member_id = ${inserted[0].id} WHERE id = ${u.id}`;
        }
      }
    } catch (syncErr) {
      console.warn("Auto-sync users error:", syncErr);
    }

    let members;
    if (includeInactive) {
      members = await sql`
        SELECT * FROM members 
        WHERE mess_id = ${messId}
        ORDER BY is_active DESC, LOWER(name)
      `;
    } else {
      members = await sql`
        SELECT * FROM members 
        WHERE mess_id = ${messId} AND is_active = 1 
        ORDER BY is_active DESC, LOWER(name)
      `;
    }

    const processed = members.map((m: any) => ({
      ...m,
      is_active: Number(m.is_active),
      phone: (isPrivileged || user?.member_id === m.id) ? m.phone : null
    }));

    return NextResponse.json(processed);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch members" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const manager = await requireManager(request);
    if (!manager || !manager.mess_id) {
      return NextResponse.json({ detail: "Not enough permissions or no mess assigned" }, { status: 403 });
    }

    const { name, phone, entry_date, password } = await request.json();
    if (!name || !entry_date) {
      return NextResponse.json({ detail: "Name and entry date are required" }, { status: 400 });
    }

    const trimmedName = name.trim();
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    
    // Check if a member with this name already exists in this mess
    const existingMember = await sql`
      SELECT id FROM members 
      WHERE mess_id = ${manager.mess_id} AND LOWER(name) = LOWER(${trimmedName})
      LIMIT 1
    `;

    let memberId: number;
    let created;

    if (existingMember.length > 0) {
      memberId = existingMember[0].id;
      // Reactivate if inactive
      const updated = await sql`
        UPDATE members 
        SET is_active = 1, phone = COALESCE(${phone || null}, phone)
        WHERE id = ${memberId}
        RETURNING *
      `;
      created = updated[0];
    } else {
      const result = await sql`
        INSERT INTO members (mess_id, name, phone, entry_date, created_at)
        VALUES (${manager.mess_id}, ${trimmedName}, ${phone || null}, ${entry_date}, ${now})
        RETURNING *
      `;
      created = result[0];
      memberId = created.id;
    }

    // Auto-create opening balance of 0 for the active month
    try {
      const activeMonth = await getActiveMonth(manager.mess_id);
      if (activeMonth && memberId) {
        await sql`
          INSERT INTO opening_balances (member_id, month_id, amount, note, created_at, mess_id)
          VALUES (${memberId}, ${activeMonth.id}, 0, 'Enrolled by manager', ${now}, ${manager.mess_id})
          ON CONFLICT (member_id, month_id) DO NOTHING
        `;
      }
    } catch (monthErr) {
      console.warn("Could not auto-create opening balance:", monthErr);
    }

    // If manager provided a login password for this member, create or update user credentials
    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password.trim(), 10);
      const existingUser = await sql`
        SELECT id FROM users WHERE LOWER(username) = LOWER(${trimmedName}) LIMIT 1
      `;
      if (existingUser.length > 0) {
        await sql`
          UPDATE users 
          SET hashed_password = ${hashedPassword},
              mess_id = ${manager.mess_id},
              member_id = ${memberId}
          WHERE id = ${existingUser[0].id}
        `;
      } else {
        const newUser = await sql`
          INSERT INTO users (username, hashed_password, role, mess_id, member_id, created_at)
          VALUES (${trimmedName}, ${hashedPassword}, 'member', ${manager.mess_id}, ${memberId}, ${now})
          RETURNING id
        `;
        if (newUser.length > 0) {
          await sql`UPDATE members SET user_id = ${newUser[0].id} WHERE id = ${memberId}`;
        }
      }
    }

    const responseMember = {
      ...created,
      is_active: Number(created.is_active)
    };

    return NextResponse.json(responseMember, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to create member" }, { status: 500 });
  }
}
