import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthUser } from '@myanmart/shared';
import type { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';

interface TokenPayload {
  id: string;
  role: AuthUser['role'];
  iat: number;
  exp: number;
}

function getSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return env.JWT_SECRET;
}

function getSignOptions(): SignOptions {
  const expiresIn = env.JWT_EXPIRES_IN;
  return { expiresIn: typeof expiresIn === 'number' ? expiresIn : (expiresIn as unknown as StringValue) };
}

export function signToken(user: AuthUser): string {
  const payload = {
    id: user.id,
    role: user.role,
  };
  return jwt.sign(payload, getSecret(), getSignOptions());
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, getSecret()) as TokenPayload | undefined;
  if (!decoded) {
    throw new Error('Invalid token');
  }
  return decoded;
}
