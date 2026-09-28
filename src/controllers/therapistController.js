import { db } from '../database/db.js';
import { logAudit } from '../services/auditService.js';

export async function getAllTherapists(req, res) {
  try {
    const { search, specialty, status } = req.query;
    let list = db.find('therapists');

    // If caller is not an Admin, only return approved therapists
    const isAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'SUB_ADMIN');
    if (!isAdmin) {
      list = list.filter((t) => t.status === 'APPROVED' || t.status === 'verified');
    } else if (status) {
      list = list.filter((t) => t.status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.specialty.toLowerCase().includes(q) ||
          (t.focusAreas && t.focusAreas.some((a) => a.toLowerCase().includes(q)))
      );
    }

    if (specialty && specialty !== 'All') {
      const spec = specialty.toLowerCase();
      list = list.filter(
        (t) =>
          t.specialty.toLowerCase().includes(spec) ||
          (t.focusAreas && t.focusAreas.some((a) => a.toLowerCase().includes(spec)))
      );
    }

    return res.json({ therapists: list });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve therapists.' });
  }
}

export async function getTherapistById(req, res) {
  try {
    const { id } = req.params;
    const therapist = db.findById('therapists', id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    const isAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'SUB_ADMIN');
    const isOwner = req.user && req.user.id === therapist.userId;

    if (!isAdmin && !isOwner && therapist.status !== 'APPROVED' && therapist.status !== 'verified') {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist profile is not currently public.' });
    }

    return res.json({ therapist });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve therapist profile.' });
  }
}

export async function getMyProfile(req, res) {
  try {
    const therapist = db.findOne('therapists', (t) => t.userId === req.user.id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist profile not found for current user.' });
    }
    return res.json({ therapist });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve profile.' });
  }
}

export async function updateMyProfile(req, res) {
  try {
    const therapist = db.findOne('therapists', (t) => t.userId === req.user.id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist profile not found.' });
    }

    const { bio, license, specialty, focusAreas, hourlyRate, title } = req.body;
    const updates = {};
    if (bio !== undefined) updates.bio = bio;
    if (license !== undefined) updates.license = license;
    if (specialty !== undefined) updates.specialty = specialty;
    if (title !== undefined) updates.title = title;
    if (focusAreas !== undefined) updates.focusAreas = Array.isArray(focusAreas) ? focusAreas : [];
    if (hourlyRate !== undefined) updates.hourlyRate = Number(hourlyRate);

    const updated = await db.update('therapists', therapist.id, updates);
    await logAudit(req, 'THERAPIST_PROFILE_UPDATED', 'THERAPIST', `Profile updated by therapist: ${updated.name}`);

    return res.json({ message: 'Profile updated successfully.', therapist: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update profile.' });
  }
}

export async function updateAvailability(req, res) {
  try {
    const therapist = db.findOne('therapists', (t) => t.userId === req.user.id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist profile not found.' });
    }

    const { availability } = req.body;
    if (!Array.isArray(availability)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Availability must be an array of day schedules.' });
    }

    const updated = await db.update('therapists', therapist.id, { availability });
    await logAudit(req, 'THERAPIST_AVAILABILITY_UPDATED', 'THERAPIST', `Availability updated by ${therapist.name}`);

    return res.json({ message: 'Availability schedule saved.', therapist: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update availability.' });
  }
}

export async function getMyClients(req, res) {
  try {
    const therapist = db.findOne('therapists', (t) => t.userId === req.user.id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist profile not found.' });
    }

    const appointments = db.find('appointments', (a) => a.therapistId === therapist.id);
    const clientMap = new Map();

    for (const appt of appointments) {
      if (!clientMap.has(appt.clientId)) {
        const clientUser = db.findById('users', appt.clientId);
        clientMap.set(appt.clientId, {
          id: appt.clientId,
          name: appt.clientName || clientUser?.name || 'Client',
          email: appt.clientEmail || clientUser?.email || '',
          initials: (appt.clientName || clientUser?.name || 'CL')
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase(),
          totalSessions: 0,
          nextSession: null,
          status: 'active'
        });
      }

      const clientRecord = clientMap.get(appt.clientId);
      clientRecord.totalSessions += 1;
      if (appt.status === 'CONFIRMED' || appt.status === 'PENDING') {
        clientRecord.nextSession = `${appt.date}, ${appt.startTime}`;
      }
    }

    return res.json({ clients: Array.from(clientMap.values()) });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve clients.' });
  }
}

export async function getMyEarnings(req, res) {
  try {
    const therapist = db.findOne('therapists', (t) => t.userId === req.user.id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist profile not found.' });
    }

    const appointments = db.find('appointments', (a) => a.therapistId === therapist.id);
    const completed = appointments.filter((a) => a.status === 'COMPLETED');
    const totalEarnings = completed.reduce((sum, a) => sum + (Number(a.fee) || 140), 0);

    return res.json({
      totalEarnings,
      completedSessionsCount: completed.length,
      rate: therapist.hourlyRate || 140,
      recentPayouts: completed.slice(-5).map((a) => ({
        id: a.id,
        date: a.date,
        amount: Number(a.fee) || 140,
        clientName: a.clientName,
        status: 'PAID'
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to compute earnings.' });
  }
}
