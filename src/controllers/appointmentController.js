import { db } from '../database/db.js';
import { logAudit } from '../services/auditService.js';

export async function createAppointment(req, res) {
  try {
    const { therapistId, date, startTime, endTime, type = 'Individual session', notes } = req.body;
    const clientId = req.user.id;

    if (!therapistId || !date || !startTime) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Therapist, date, and start time are required to book an appointment.'
      });
    }

    const therapist = db.findById('therapists', therapistId);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    if (therapist.status !== 'APPROVED' && therapist.status !== 'verified') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'This therapist is not currently approved to accept bookings.'
      });
    }

    // Enforce active package with remaining sessions for USER role
    let userPackage = null;
    if (req.user.role === 'USER') {
      userPackage = db.findOne(
        'userPackages',
        (up) =>
          up.userId === clientId &&
          up.therapistId === therapist.id &&
          up.status === 'ACTIVE' &&
          up.sessionsRemaining > 0
      );

      if (!userPackage) {
        return res.status(403).json({
          error: 'Package Required',
          message: 'An active therapy package with remaining sessions is required to book an appointment with this therapist. Please select and purchase a package first.'
        });
      }
    }

    // Default 50 minute session duration if endTime not provided
    let calculatedEndTime = endTime;
    if (!calculatedEndTime) {
      const [h, m] = startTime.split(':').map(Number);
      const totalMinutes = h * 60 + m + 50;
      const endH = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const endM = String(totalMinutes % 60).padStart(2, '0');
      calculatedEndTime = `${endH}:${endM}`;
    }

    // Conflict prevention: prevent double-booking the same therapist at overlapping times
    const existingAppointments = db.find(
      'appointments',
      (a) =>
        a.therapistId === therapist.id &&
        a.date === date &&
        a.status !== 'CANCELLED'
    );

    const hasConflict = existingAppointments.some((a) => {
      return startTime < a.endTime && calculatedEndTime > a.startTime;
    });

    if (hasConflict) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Therapist is unavailable at this selected time. Please choose another time slot.'
      });
    }

    // 1. Create linked Psychotherapy Session
    const roomId = `amakari_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const session = await db.insert('sessions', {
      appointmentId: null, // linked right below
      userPackageId: userPackage ? userPackage.id : null,
      clientId,
      therapistId: therapist.id,
      therapistUserId: therapist.userId,
      roomId,
      status: 'SCHEDULED', // SCHEDULED, ACTIVE, ENDED, CANCELLED
      startedAt: null,
      endedAt: null
    });

    // 2. Create Appointment
    const appointment = await db.insert('appointments', {
      clientId,
      clientName: req.user.name,
      clientEmail: req.user.email,
      therapistId: therapist.id,
      therapistUserId: therapist.userId,
      therapistName: therapist.name,
      userPackageId: userPackage ? userPackage.id : null,
      date,
      startTime,
      endTime: calculatedEndTime,
      type,
      fee: therapist.hourlyRate || 140,
      status: 'CONFIRMED', // PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW
      sessionId: session.id,
      notes: notes || ''
    });

    // Link appointmentId back to session
    await db.update('sessions', session.id, { appointmentId: appointment.id });
    session.appointmentId = appointment.id;

    await logAudit(
      req,
      'APPOINTMENT_BOOKED',
      'APPOINTMENT',
      `Client ${req.user.name} booked appointment with ${therapist.name} for ${date} at ${startTime}`
    );

    return res.status(201).json({
      message: 'Appointment booked successfully.',
      appointment,
      session
    });
  } catch (err) {
    console.error('Appointment booking error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to book appointment.' });
  }
}

export async function getMyAppointments(req, res) {
  try {
    let appointments = [];

    if (req.user.role === 'USER') {
      appointments = db.find('appointments', (a) => a.clientId === req.user.id);
    } else if (req.user.role === 'THERAPIST') {
      const therapist = db.findOne('therapists', (t) => t.userId === req.user.id);
      if (therapist) {
        appointments = db.find('appointments', (a) => a.therapistId === therapist.id);
      }
    } else if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'SUB_ADMIN') {
      appointments = db.find('appointments');
    }

    // Sort by date and startTime descending
    appointments.sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));

    return res.json({ appointments });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch appointments.' });
  }
}

export async function getAppointmentById(req, res) {
  try {
    const { id } = req.params;
    const appointment = db.findById('appointments', id);
    if (!appointment) {
      return res.status(404).json({ error: 'Not Found', message: 'Appointment not found.' });
    }

    // Resource ownership check
    const isClient = appointment.clientId === req.user.id;
    const isTherapist = appointment.therapistUserId === req.user.id;
    const isAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'SUB_ADMIN';

    if (!isClient && !isTherapist && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied to this appointment.' });
    }

    return res.json({ appointment });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch appointment.' });
  }
}

export async function cancelAppointment(req, res) {
  try {
    const { id } = req.params;
    const appointment = db.findById('appointments', id);
    if (!appointment) {
      return res.status(404).json({ error: 'Not Found', message: 'Appointment not found.' });
    }

    const isClient = appointment.clientId === req.user.id;
    const isTherapist = appointment.therapistUserId === req.user.id;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isSubAdmin = req.user.role === 'SUB_ADMIN' && req.user.permissions?.includes('APPOINTMENT_MANAGE');

    if (!isClient && !isTherapist && !isSuperAdmin && !isSubAdmin) {
      return res.status(403).json({ error: 'Forbidden', message: 'You are not authorized to cancel this appointment.' });
    }

    const updatedAppointment = await db.update('appointments', id, { status: 'CANCELLED' });

    if (appointment.sessionId) {
      await db.update('sessions', appointment.sessionId, { status: 'CANCELLED' });
    }

    await logAudit(
      req,
      'APPOINTMENT_CANCELLED',
      'APPOINTMENT',
      `Appointment ${id} cancelled by ${req.user.name} (${req.user.role})`
    );

    return res.json({ message: 'Appointment cancelled successfully.', appointment: updatedAppointment });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to cancel appointment.' });
  }
}
