import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../database/db.js';
import { logAudit } from '../services/auditService.js';

export async function joinSession(req, res) {
  try {
    const { id } = req.params;

    // 1. Is user authenticated? Verified by authenticate middleware (req.user)
    const userId = req.user.id;
    const userRole = req.user.role;

    // 2. Fetch session
    const session = db.findById('sessions', id);
    if (!session) {
      return res.status(404).json({ error: 'Not Found', message: 'Psychotherapy session not found.' });
    }

    // 3. Is user assigned to this session?
    const isClient = session.clientId === userId;
    const isTherapist = session.therapistUserId === userId || (req.user.therapistId && session.therapistId === req.user.therapistId);
    const isSuperAdmin = userRole === 'SUPER_ADMIN';

    if (!isClient && !isTherapist && !isSuperAdmin) {
      await logAudit(
        req,
        'UNAUTHORIZED_SESSION_JOIN_ATTEMPT',
        'SESSION',
        `User ${req.user.name} (${req.user.email}) attempted to join unassigned session ${id}`
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied. You are not an authorized participant in this psychotherapy session.'
      });
    }

    // 4. Is the appointment valid?
    let appointment = null;
    if (session.appointmentId) {
      appointment = db.findById('appointments', session.appointmentId);
      if (appointment && appointment.status === 'CANCELLED') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'This session cannot be joined because the appointment was cancelled.'
        });
      }
    }

    // 5. Is the session available?
    if (session.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Bad Request', message: 'This session has been cancelled.' });
    }
    if (session.status === 'ENDED') {
      return res.status(400).json({ error: 'Bad Request', message: 'This psychotherapy session has already concluded.' });
    }

    // 6. Update session status to ACTIVE if it was SCHEDULED
    const now = new Date().toISOString();
    let updatedSession = session;
    if (session.status === 'SCHEDULED') {
      updatedSession = await db.update('sessions', id, {
        status: 'ACTIVE',
        startedAt: session.startedAt || now
      });
    }

    // 7. Generate cryptographically signed video room token
    const videoToken = jwt.sign(
      {
        sessionId: session.id,
        roomId: session.roomId,
        userId: req.user.id,
        userName: req.user.name,
        role: isTherapist ? 'THERAPIST' : isClient ? 'CLIENT' : 'ADMIN',
        isHost: isTherapist
      },
      config.jwtSecret,
      { expiresIn: '3h' }
    );

    await logAudit(
      req,
      'SESSION_JOINED',
      'SESSION',
      `Participant ${req.user.name} joined session ${id} in room ${session.roomId}`
    );

    // Return authorized video access
    return res.json({
      message: 'Access granted to psychotherapy session.',
      videoAccess: {
        token: videoToken,
        roomId: session.roomId,
        sessionId: session.id,
        role: isTherapist ? 'therapist' : isClient ? 'client' : 'admin',
        participantName: req.user.name,
        participantId: req.user.id,
        startedAt: updatedSession.startedAt || now
      },
      session: updatedSession,
      appointment
    });
  } catch (err) {
    console.error('Error joining session:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to join session.' });
  }
}

export async function leaveSession(req, res) {
  try {
    const { id } = req.params;
    const session = db.findById('sessions', id);
    if (!session) {
      return res.status(404).json({ error: 'Not Found', message: 'Session not found.' });
    }

    await logAudit(
      req,
      'SESSION_LEFT',
      'SESSION',
      `Participant ${req.user.name} left session ${id}`
    );

    return res.json({ message: 'Successfully left session.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to record session exit.' });
  }
}

export async function endSession(req, res) {
  try {
    const { id } = req.params;
    const session = db.findById('sessions', id);
    if (!session) {
      return res.status(404).json({ error: 'Not Found', message: 'Session not found.' });
    }

    const isTherapist = session.therapistUserId === req.user.id || (req.user.therapistId && session.therapistId === req.user.therapistId);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isTherapist && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the attending therapist or Super Admin can formally end the session.'
      });
    }

    const now = new Date().toISOString();
    const updatedSession = await db.update('sessions', id, {
      status: 'ENDED',
      endedAt: now
    });

    if (session.appointmentId) {
      await db.update('appointments', session.appointmentId, { status: 'COMPLETED' });
    }

    await logAudit(
      req,
      'SESSION_ENDED',
      'SESSION',
      `Session ${id} ended by ${req.user.name}`
    );

    return res.json({
      message: 'Psychotherapy session concluded.',
      session: updatedSession
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to conclude session.' });
  }
}

export async function getSessionById(req, res) {
  try {
    const { id } = req.params;
    const session = db.findById('sessions', id);
    if (!session) {
      return res.status(404).json({ error: 'Not Found', message: 'Session not found.' });
    }

    const isClient = session.clientId === req.user.id;
    const isTherapist = session.therapistUserId === req.user.id;
    const isAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'SUB_ADMIN';

    if (!isClient && !isTherapist && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied to this session.' });
    }

    const appointment = session.appointmentId ? db.findById('appointments', session.appointmentId) : null;
    return res.json({ session, appointment });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve session.' });
  }
}
