import { db } from '../database/db.js';

/**
 * Helper to check if a user has an active permission.
 * - SUPER_ADMIN always has all permissions.
 * - SUB_ADMIN must possess the permission WITH status === 'ACTIVATED'.
 *   Pending or Disabled permissions NEVER grant access.
 */
export function hasActivePermission(user, requiredPermission) {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'SUB_ADMIN') return false;

  // 1. Check live subAdminPermissions collection first
  const dbPermission = db.findOne(
    'subAdminPermissions',
    (p) =>
      (p.userId === user.id || p.subAdminId === user.subAdminId) &&
      p.permission === requiredPermission
  );

  if (dbPermission) {
    return dbPermission.status === 'ACTIVATED';
  }

  // 2. Check user.permissions array
  if (Array.isArray(user.permissions)) {
    for (const item of user.permissions) {
      if (typeof item === 'string' && item === requiredPermission) {
        // String format defaults to activated if not in subAdminPermissions
        return true;
      }
      if (typeof item === 'object' && item !== null) {
        if (item.permission === requiredPermission && item.status === 'ACTIVATED') {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks for a specific permission with ACTIVATED status.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    if (req.user.role === 'SUB_ADMIN') {
      if (hasActivePermission(req.user, permission)) {
        return next();
      }

      // Check if permission is pending to provide a clear informative message
      const dbPermission = db.findOne(
        'subAdminPermissions',
        (p) => p.userId === req.user.id && p.permission === permission
      );
      if (dbPermission && dbPermission.status === 'PENDING') {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Permission '${permission}' is currently PENDING approval/activation by the Super Administrator.`
        });
      }

      return res.status(403).json({
        error: 'Forbidden',
        message: `Permission denied. Required permission '${permission}' is not activated on this account.`
      });
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied. Administrative role required.'
    });
  };
}

/**
 * Checks if user has ANY of the specified permissions with ACTIVATED status.
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
      const hasAny = permissions.some((p) => hasActivePermission(req.user, p));
      if (hasAny) {
        return next();
      }
      return res.status(403).json({
        error: 'Forbidden',
        message: `Permission denied. Requires at least one activated permission from: ${permissions.join(', ')}`
      });
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied. Administrative role required.'
    });
  };
}
