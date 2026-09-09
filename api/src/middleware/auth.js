import { ROLES } from '../config.js';
import { verifyToken } from '../services/auth.js';

// Every protected route goes through requireAuth. Identity comes from a signed JWT,
// so the client cannot claim a role it was not issued - which is the difference
// between this and a role dropdown.

export function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated', detail: 'Sign in to continue.' });
  }

  const claims = verifyToken(token);
  if (!claims) {
    return res.status(401).json({ error: 'Session invalid', detail: 'Your session expired. Please sign in again.' });
  }

  req.user = claims;
  req.perms = ROLES[claims.role];
  if (!req.perms) {
    return res.status(403).json({ error: 'Forbidden', detail: 'Unknown role on this account.' });
  }
  next();
}

/**
 * Site scoping - the access rule that actually matters here.
 * An Ops Manager is scoped to their own hub; another hub's staffing position is not
 * their business. Runs after validation, so req.validated.site is already clean.
 */
export function requireSiteAccess(req, res, next) {
  const site = req.validated?.site;
  if (!site) return next();

  const allowed = req.user?.sites ?? [];
  if (allowed.length > 0 && !allowed.includes(site)) {
    return res.status(403).json({
      error: 'Forbidden',
      detail: `Your account has access to ${allowed.join(', ')} only.`,
    });
  }
  next();
}

export const requireWrite = (req, res, next) =>
  req.perms?.canWrite
    ? next()
    : res.status(403).json({ error: 'Forbidden', detail: `${req.perms.label} has read-only access.` });

export const requireReset = (req, res, next) =>
  req.perms?.canReset
    ? next()
    : res.status(403).json({ error: 'Forbidden', detail: 'Only an Admin can reset demo data.' });
