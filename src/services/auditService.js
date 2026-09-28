import { db } from '../database/db.js';

export async function logAudit(req, action, resource, details) {
  try {
    const actor = req?.user || { id: 'anonymous', email: 'anonymous', role: 'GUEST' };
    const ip = req?.ip || req?.socket?.remoteAddress || 'unknown';

    await db.insert('auditLogs', {
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action,
      resource,
      details,
      ip,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
