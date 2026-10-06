// backend/src/services/authService.ts
// Username/password login with server-side session tokens.

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import db from '../models/database';
import { verifyPassword } from './password';

export type Role = 'STUDENT' | 'TEACHER';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  studentId: string | null;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

const SESSION_DAYS = 7;

function toAuthUser(row: any): AuthUser {
  return { id: row.id, username: row.username, name: row.name, role: row.role, studentId: row.student_id };
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))
  `).run(token, userId, `+${SESSION_DAYS} days`);
  return token;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function login(username: string, password: string): { token: string; user: AuthUser } | null {
  const row = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username.trim()) as any;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { token: createSession(row.id), user: toAuthUser(row) };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function userForToken(token: string): AuthUser | null {
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as any;
  return row ? toAuthUser(row) : null;
}

// Middleware: rejects requests without a valid session (optionally limited to certain roles)
export function requireAuth(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const token = bearerToken(req);
    const user = token ? userForToken(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Please log in' });
      return;
    }
    if (roles.length > 0 && !roles.includes(user.role)) {
      res.status(403).json({ error: 'You do not have access to this page' });
      return;
    }
    req.user = user;
    next();
  };
}

