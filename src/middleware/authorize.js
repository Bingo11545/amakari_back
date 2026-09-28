/**
 * Enforces one or more allowed roles.
 * Example: requireRoles('SUPER_ADMIN', 'SUB_ADMIN')
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Role ${req.user.role} is not permitted to perform this action.`
      });
    }

    next();
  };
}
