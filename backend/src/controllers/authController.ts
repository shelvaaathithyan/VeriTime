import { Request, Response } from 'express';
import { login, deleteSession, bearerToken, AuthedRequest } from '../services/authService';

// POST /api/auth/login
export function loginHandler(req: Request, res: Response): void {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  const result = login(String(username), String(password));
  if (!result) {
    res.status(401).json({ error: 'Incorrect username or password' });
    return;
  }
  res.json(result);
}

// POST /api/auth/logout
export function logoutHandler(req: Request, res: Response): void {
  const token = bearerToken(req);
  if (token) deleteSession(token);
  res.json({ success: true });
}

// GET /api/auth/me
export function meHandler(req: AuthedRequest, res: Response): void {
  res.json({ user: req.user });
}
