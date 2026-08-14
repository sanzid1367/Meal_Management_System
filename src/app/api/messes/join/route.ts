import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireAuth, createAccessToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await initDb();
    const user = await requireAuth(request);
    if (!user) {
      return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const joinCode = body.join_code?.trim().toUpperCase();

    if (!joinCode) {
      return NextResponse.json({ detail: "Join code is required" }, { status: 400 });
    }

    const messList = await sql`
      SELECT id, name, join_code 
      FROM messes 
      WHERE UPPER(join_code) = ${joinCode} 
      LIMIT 1
    `;

    if (messList.length === 0) {
      return NextResponse.json({ detail: "Invalid join code. Mess not found." }, { status: 404 });
    }

    const targetMess = messList[0];

    // Check if there is an existing member profile with the same username/name in this mess
    const matchingMember = await sql`
      SELECT id FROM members 
      WHERE mess_id = ${targetMess.id} AND LOWER(name) = LOWER(${user.username})
      LIMIT 1
    `;

    const memberId = matchingMember.length > 0 ? matchingMember[0].id : user.member_id;

    // Update user's mess_id & member_id
    await sql`
      UPDATE users 
      SET mess_id = ${targetMess.id},
          member_id = ${memberId}
      WHERE id = ${user.id}
    `;

    const updatedUser = {
      username: user.username,
      id: user.id,
      role: user.role === 'super_admin' ? 'super_admin' : 'member',
      mess_id: targetMess.id,
      member_id: memberId
    };

    const token = createAccessToken(updatedUser);

    return NextResponse.json({
      mess: targetMess,
      user: updatedUser,
      access_token: token,
      message: `Successfully joined ${targetMess.name}!`
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to join mess" }, { status: 500 });
  }
}
