import jwt from 'jsonwebtoken';
import { sql } from './db';

const SECRET_KEY = process.env.JWT_SECRET || "super-secret-meal-manager-key-change-in-production";

export interface UserPayload {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

export function createAccessToken(username: string): string {
  // 7 days expiration (matching ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7)
  return jwt.sign({ sub: username }, SECRET_KEY, { expiresIn: '7d' });
}

export async function getCurrentUser(request: Request): Promise<UserPayload | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET_KEY) as { sub: string };
    if (!payload.sub) return null;

    const users = await sql`
      SELECT id, username, role, created_at 
      FROM users 
      WHERE username = ${payload.sub} 
      LIMIT 1
    `;

    if (users.length === 0) return null;
    return {
      id: users[0].id,
      username: users[0].username,
      role: users[0].role,
      created_at: users[0].created_at
    };
  } catch (error) {
    return null;
  }
}

export async function requireAdmin(request: Request): Promise<UserPayload | null> {
  const user = await getCurrentUser(request);
  if (!user || user.role !== 'admin') {
    return null;
  }
  return user;
}
