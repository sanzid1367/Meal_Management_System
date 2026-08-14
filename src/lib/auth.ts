import jwt from 'jsonwebtoken';
import { sql } from './db';
import { UserRole, MembershipStatus } from '@/types';

const SECRET_KEY = process.env.JWT_SECRET || "super-secret-meal-manager-key-change-in-production";

export interface UserPayload {
  id: number;
  username: string;
  role: UserRole;
  mess_id: number | null;
  member_id: number | null;
  created_at: string;
  membership_status: MembershipStatus;
  mess_name?: string;
}

interface JWTPayload {
  sub: string;
  userId?: number;
  role?: UserRole;
  messId?: number | null;
  memberId?: number | null;
}

export function createAccessToken(user: {
  username: string;
  id?: number;
  role?: string;
  mess_id?: number | null;
  member_id?: number | null;
}): string {
  return jwt.sign(
    {
      sub: user.username,
      userId: user.id,
      role: user.role,
      messId: user.mess_id,
      memberId: user.member_id
    },
    SECRET_KEY,
    { expiresIn: '7d' }
  );
}

export async function getCurrentUser(request: Request): Promise<UserPayload | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET_KEY) as JWTPayload;
    if (!payload.sub) return null;

    const users = await sql`
      SELECT u.id, u.username, u.role, u.mess_id, u.member_id, u.created_at,
             m.name AS mess_name
      FROM users u
      LEFT JOIN messes m ON m.id = u.mess_id
      WHERE LOWER(u.username) = LOWER(${payload.sub}) 
      LIMIT 1
    `;

    if (users.length === 0) return null;
    const u = users[0];
    
    // Normalize role
    let normalizedRole: UserRole = 'member';
    if (u.role === 'super_admin' || u.role === 'admin') {
      normalizedRole = u.role === 'super_admin' ? 'super_admin' : 'manager';
    } else if (u.role === 'manager') {
      normalizedRole = 'manager';
    }

    let membershipStatus: MembershipStatus = 'active';
    let resolvedMemberId = u.member_id ? Number(u.member_id) : null;

    if (normalizedRole === 'super_admin') {
      membershipStatus = 'active';
    } else if (normalizedRole === 'manager') {
      if (!u.mess_id) {
        membershipStatus = 'unattached';
      } else {
        membershipStatus = 'active';
      }
    } else {
      // Member role: verify real-time membership in the mess
      if (!u.mess_id) {
        membershipStatus = 'unattached';
      } else {
        // Query the member entry for this user
        let memberRow = null;
        if (resolvedMemberId) {
          const res = await sql`
            SELECT id, is_active FROM members 
            WHERE id = ${resolvedMemberId} AND mess_id = ${u.mess_id}
            LIMIT 1
          `;
          if (res.length > 0) memberRow = res[0];
        }

        if (!memberRow) {
          const res = await sql`
            SELECT id, is_active FROM members 
            WHERE mess_id = ${u.mess_id} AND LOWER(name) = LOWER(${u.username})
            LIMIT 1
          `;
          if (res.length > 0) {
            memberRow = res[0];
            resolvedMemberId = Number(memberRow.id);
          }
        }

        if (!memberRow || Number(memberRow.is_active) === 0) {
          membershipStatus = 'removed';
        } else {
          membershipStatus = 'active';
        }
      }
    }

    return {
      id: Number(u.id),
      username: u.username,
      role: normalizedRole,
      mess_id: u.mess_id ? Number(u.mess_id) : null,
      member_id: resolvedMemberId,
      created_at: u.created_at,
      membership_status: membershipStatus,
      mess_name: u.mess_name || undefined
    };
  } catch (error) {
    return null;
  }
}

/**
 * Ensures user is authenticated (any role).
 */
export async function requireAuth(request: Request): Promise<UserPayload | null> {
  return await getCurrentUser(request);
}

/**
 * Ensures user is a Super Admin.
 */
export async function requireSuperAdmin(request: Request): Promise<UserPayload | null> {
  const user = await getCurrentUser(request);
  if (!user || user.role !== 'super_admin') {
    return null;
  }
  return user;
}

/**
 * Ensures user is a Mess Manager or Super Admin.
 */
export async function requireManager(request: Request): Promise<UserPayload | null> {
  const user = await getCurrentUser(request);
  if (!user || (user.role !== 'manager' && user.role !== 'super_admin')) {
    return null;
  }
  if (user.role !== 'super_admin' && user.membership_status !== 'active') {
    return null;
  }
  return user;
}

/**
 * Backward compatibility alias for requireManager
 */
export async function requireAdmin(request: Request): Promise<UserPayload | null> {
  return requireManager(request);
}

/**
 * Ensures user is an active member or manager of a mess.
 * Blocks dropped or unattached users from accessing protected data.
 */
export async function requireActiveTenantUser(request: Request): Promise<UserPayload | null> {
  const user = await getCurrentUser(request);
  if (!user || !user.mess_id || user.membership_status !== 'active') {
    return null;
  }
  return user;
}

/**
 * Ensures user has an assigned mess_id.
 */
export async function requireTenantUser(request: Request): Promise<UserPayload | null> {
  return requireActiveTenantUser(request);
}
