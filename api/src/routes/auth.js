import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/index.js';
import { SITES } from '../config.js';
import { verifyPassword, signToken } from '../services/auth.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/async.js';

const router = Router();

// Login gets a much tighter limit than the rest of the API - 10 attempts per 15
// minutes per IP, so the endpoint cannot be used to grind through passwords.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts', detail: 'Too many sign-in attempts. Try again in a few minutes.' },
});

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3, 'must be at least 3 characters').max(32),
  password: z.string().min(6, 'must be at least 6 characters').max(128),
});

router.post('/login', loginLimiter, validate(loginSchema, 'body'), wrap(async (req, res) => {
  const { username, password } = req.validated;
  const user = await User.findOne({ username }).lean();

  // Same message and same work whether the user exists or the password is wrong,
  // so the response cannot be used to discover which usernames are valid.
  const ok = user && verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Sign-in failed', detail: 'Incorrect username or password.' });
  }

  const scoped = user.sites?.length ? SITES.filter((s) => user.sites.includes(s.code)) : SITES;

  res.json({
    token: signToken(user),
    user: { username: user.username, name: user.displayName, role: user.role, sites: scoped },
  });
}));

/** Lets the frontend restore a session on reload without a second login. */
router.get('/me', requireAuth, (req, res) => {
  const scoped = req.user.sites?.length ? SITES.filter((s) => req.user.sites.includes(s.code)) : SITES;
  res.json({
    user: { username: req.user.sub, name: req.user.name, role: req.user.role, sites: scoped },
    permissions: req.perms,
  });
});

export default router;
