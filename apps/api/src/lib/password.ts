import bcrypt from 'bcryptjs';

const ROUND_COUNT = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUND_COUNT);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}
