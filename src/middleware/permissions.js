/**
 * Checks for a specific permission.
 * - SUPER_ADMIN always has all permissions.
 * - SUB_ADMIN must possess the permission in user.permissions.
 * - Others are denied unless permitted.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    // SUPER_ADMIN has unconditional platform access
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    // SUB_ADMIN must have the explicit permission assigned
    if (req.user.role === 'SUB_ADMIN') {
      const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      if (userPermissions.includes(permission)) {
        return next();
      }
      return res.status(403).json({
        error: 'Forbidden',
        message: `Permission denied. Required permission '${permission}' is not assigned to this account.`
      });
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied. Administrative role required.'
    });
  };
}

/**
 * Checks if user has ANY of the specified permissions
 */
export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    if (req.user.role === 'SUB_ADMIN') {
      const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      const hasAny = permissions.some((p) => userPermissions.includes(p));
      if (hasAny) {
        return next();
      }
      return res.status(403).json({
        error: 'Forbidden',
        message: `Permission denied. Requires at least one of: ${permissions.join(', ')}`
      });
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied. Administrative role required.'
    });
  };
}
