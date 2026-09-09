import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Passwords are hashed with scrypt from Node's own crypto module - a memory-hard KDF,
// so it is deliberately slow to brute-force. No plain-text password is ever stored,
// logged, or returned by any endpoint.

const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(password, salt, KEYLEN);
  // Constant-time comparison, so response timing cannot leak how much of the
  // hash matched.
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function secret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  // A demo build must still run without extra configuration, but it should say so
  // rather than silently shipping a predictable signing key.
  if (!secret.warned) {
    console.warn('[auth] JWT_SECRET is not set - using a development fallback. Set it in production.');
    secret.warned = true;
  }
  return 'opspulse-dev-secret-not-for-production';
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.username, name: user.displayName, role: user.role, sites: user.sites ?? [] },
    secret(),
    { expiresIn: '12h' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}
