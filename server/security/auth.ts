import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types.js';

const JWT_ACCESS_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.JWT_ACCESS_SECRET || 'smile_playstore_jwt_secret_development_fallback_32_chars';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.AUTH_SECRET || process.env.JWT_SECRET || 'smile_playstore_jwt_refresh_secret_development_fallback_32_chars';

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  username: string;
}

export function generateTokens(payload: AuthPayload) {
  const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);
  if (payload) {
    req.user = payload;
  }
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Insufficient permissions. Required: ${allowedRoles.join(' or ')}` },
      });
    }

    next();
  };
}
