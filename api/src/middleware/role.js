import { ROLES } from '../config.js';

// Authorisation is real and enforced server-side; only the identity is stubbed.
// In production the role would come from an OIDC claim after UPS SSO rather than a
// header - but the permission checks below would be unchanged.

export function roleContext(req, res, next) {
  const role = (req.get('X-Role') || 'manager').toLowerCase();
  if (!ROLES[role]) {
    return res.status(400).json({
      error: 'Validation failed',
      details: [{ field: 'X-Role', message: `Unknown role. Expected one of: ${Object.keys(ROLES).join(', ')}` }],
    });
  }
  req.role = role;
  req.perms = ROLES[role];
  next();
}

export const requireWrite = (req, res, next) =>
  req.perms?.canWrite
    ? next()
    : res.status(403).json({ error: 'Forbidden', detail: `${req.perms.label} has read-only access.` });

export const requireReset = (req, res, next) =>
  req.perms?.canReset
    ? next()
    : res.status(403).json({ error: 'Forbidden', detail: 'Only Admin can reset demo data.' });
