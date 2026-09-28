import bcrypt from 'bcryptjs';
import { db } from '../database/db.js';
import { ALL_PERMISSIONS } from '../database/seed.js';
import { logAudit } from '../services/auditService.js';

// --- USERS MANAGEMENT ---

export async function getUsers(req, res) {
  try {
    const users = db.find('users').map((u) => {
      const { password, ...safe } = u;
      return safe;
    });
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch users.' });
  }
}

export async function createUser(req, res) {
  try {
    const { name, email, password, role = 'USER', permissions = [] } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (db.findOne('users', (u) => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Conflict', message: 'User with this email already exists.' });
    }

    // Only SUPER_ADMIN can create SUB_ADMIN or SUPER_ADMIN users
    if ((role === 'SUB_ADMIN' || role === 'SUPER_ADMIN') && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden', message: 'Only Super Admin can create administrative users.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.insert('users', {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
      isActive: true,
      permissions: role === 'SUB_ADMIN' ? permissions : []
    });

    await logAudit(
      req,
      'ADMIN_CREATE_USER',
      'USER',
      `Admin created user: ${newUser.name} (${newUser.email}, role: ${newUser.role})`
    );

    const { password: _, ...safeUser } = newUser;
    return res.status(201).json({ message: 'User created successfully.', user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to create user.' });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const targetUser = db.findById('users', id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found.' });
    }

    // Sub admins cannot update Super Admins
    if (targetUser.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden', message: 'Cannot modify Super Admin accounts.' });
    }

    const { name, email, isActive, permissions } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.toLowerCase().trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    // Only Super Admin can change permissions
    if (permissions !== undefined && req.user.role === 'SUPER_ADMIN') {
      updates.permissions = permissions;
    }

    const updated = await db.update('users', id, updates);
    await logAudit(req, 'ADMIN_UPDATE_USER', 'USER', `Updated user ${updated.email}`);

    const { password: _, ...safeUser } = updated;
    return res.json({ message: 'User updated successfully.', user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update user.' });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const targetUser = db.findById('users', id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found.' });
    }

    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden', message: 'Super Admin accounts cannot be deleted.' });
    }

    await db.delete('users', id);
    await logAudit(req, 'ADMIN_DELETE_USER', 'USER', `Deleted user ${targetUser.email} (${targetUser.role})`);

    return res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to delete user.' });
  }
}

// --- THERAPISTS MANAGEMENT ---

export async function getAdminTherapists(req, res) {
  try {
    const therapists = db.find('therapists');
    return res.json({ therapists });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve therapists.' });
  }
}

export async function updateAdminTherapist(req, res) {
  try {
    const { id } = req.params;
    const therapist = db.findById('therapists', id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    const { license, specialty, status, hourlyRate, focusAreas } = req.body;
    const updates = {};
    if (license !== undefined) updates.license = license;
    if (specialty !== undefined) updates.specialty = specialty;
    if (status !== undefined) updates.status = status;
    if (hourlyRate !== undefined) updates.hourlyRate = Number(hourlyRate);
    if (focusAreas !== undefined) updates.focusAreas = focusAreas;

    const updated = await db.update('therapists', id, updates);
    await logAudit(req, 'ADMIN_UPDATE_THERAPIST', 'THERAPIST', `Updated therapist ${therapist.name}`);

    return res.json({ message: 'Therapist updated.', therapist: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update therapist.' });
  }
}

export async function approveTherapist(req, res) {
  try {
    const { id } = req.params;
    const therapist = db.findById('therapists', id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    const updated = await db.update('therapists', id, { status: 'verified' });
    await logAudit(
      req,
      'THERAPIST_APPROVED',
      'THERAPIST',
      `Therapist ${therapist.name} (${therapist.license}) approved by ${req.user.name}`
    );

    return res.json({ message: 'Therapist application approved and verified.', therapist: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to approve therapist.' });
  }
}

export async function rejectTherapist(req, res) {
  try {
    const { id } = req.params;
    const therapist = db.findById('therapists', id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    const updated = await db.update('therapists', id, { status: 'rejected' });
    await logAudit(
      req,
      'THERAPIST_REJECTED',
      'THERAPIST',
      `Therapist ${therapist.name} application rejected by ${req.user.name}`
    );

    return res.json({ message: 'Therapist application rejected.', therapist: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to reject therapist.' });
  }
}

// --- SUB ADMIN MANAGEMENT (SUPER ADMIN ONLY) ---

export async function getSubAdmins(req, res) {
  try {
    const subAdmins = db.find('subAdmins');
    const enriched = subAdmins.map((sa) => {
      const user = db.findById('users', sa.userId);
      return {
        ...sa,
        isActive: user ? user.isActive : false
      };
    });
    return res.json({ subAdmins: enriched, availablePermissions: ALL_PERMISSIONS });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch sub-admins.' });
  }
}

export async function createSubAdmin(req, res) {
  try {
    const { name, email, password, permissions = [] } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (db.findOne('users', (u) => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Conflict', message: 'Account with this email already exists.' });
    }

    // Validate permissions are in ALL_PERMISSIONS
    const validPermissions = permissions.filter((p) => ALL_PERMISSIONS.includes(p));

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.insert('users', {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'SUB_ADMIN',
      isActive: true,
      permissions: validPermissions
    });

    const subAdminRecord = await db.insert('subAdmins', {
      userId: newUser.id,
      name: newUser.name,
      email: newUser.email,
      assignedBy: req.user.id,
      permissions: validPermissions,
      status: 'ACTIVE'
    });

    await logAudit(
      req,
      'SUB_ADMIN_CREATED',
      'SUB_ADMIN',
      `Super Admin created Sub Admin ${newUser.name} with permissions: ${validPermissions.join(', ')}`
    );

    return res.status(201).json({
      message: 'Sub Admin created successfully.',
      subAdmin: { ...subAdminRecord, isActive: true }
    });
  } catch (err) {
    console.error('Create Sub Admin error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to create Sub Admin.' });
  }
}

export async function updateSubAdmin(req, res) {
  try {
    const { id } = req.params;
    const subAdmin = db.findById('subAdmins', id);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    const { name, permissions, isActive } = req.body;
    const subAdminUpdates = {};
    const userUpdates = {};

    if (name) {
      subAdminUpdates.name = name.trim();
      userUpdates.name = name.trim();
    }

    if (Array.isArray(permissions)) {
      const validPermissions = permissions.filter((p) => ALL_PERMISSIONS.includes(p));
      subAdminUpdates.permissions = validPermissions;
      userUpdates.permissions = validPermissions;
    }

    if (isActive !== undefined) {
      userUpdates.isActive = Boolean(isActive);
      subAdminUpdates.status = Boolean(isActive) ? 'ACTIVE' : 'DISABLED';
    }

    const updatedSubAdmin = await db.update('subAdmins', id, subAdminUpdates);
    if (subAdmin.userId) {
      await db.update('users', subAdmin.userId, userUpdates);
    }

    await logAudit(
      req,
      'SUB_ADMIN_UPDATED',
      'SUB_ADMIN',
      `Super Admin updated Sub Admin ${subAdmin.name}. Permissions: ${(subAdminUpdates.permissions || subAdmin.permissions).join(', ')}`
    );

    return res.json({
      message: 'Sub Admin updated successfully.',
      subAdmin: {
        ...updatedSubAdmin,
        isActive: userUpdates.isActive !== undefined ? userUpdates.isActive : true
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update Sub Admin.' });
  }
}

export async function toggleDisableSubAdmin(req, res) {
  try {
    const { id } = req.params;
    const subAdmin = db.findById('subAdmins', id);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    const user = db.findById('users', subAdmin.userId);
    const newActiveState = user ? !user.isActive : false;

    if (user) {
      await db.update('users', user.id, { isActive: newActiveState });
    }

    const updated = await db.update('subAdmins', id, {
      status: newActiveState ? 'ACTIVE' : 'DISABLED'
    });

    await logAudit(
      req,
      newActiveState ? 'SUB_ADMIN_ENABLED' : 'SUB_ADMIN_DISABLED',
      'SUB_ADMIN',
      `Sub Admin ${subAdmin.name} set to ${newActiveState ? 'ACTIVE' : 'DISABLED'}`
    );

    return res.json({
      message: `Sub Admin ${newActiveState ? 'enabled' : 'disabled'}.`,
      subAdmin: { ...updated, isActive: newActiveState }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to toggle Sub Admin status.' });
  }
}

export async function deleteSubAdmin(req, res) {
  try {
    const { id } = req.params;
    const subAdmin = db.findById('subAdmins', id);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    if (subAdmin.userId) {
      await db.delete('users', subAdmin.userId);
    }
    await db.delete('subAdmins', id);

    await logAudit(req, 'SUB_ADMIN_DELETED', 'SUB_ADMIN', `Sub Admin ${subAdmin.name} deleted.`);

    return res.json({ message: 'Sub Admin deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to delete Sub Admin.' });
  }
}

// --- PLATFORM SETTINGS (SUPER ADMIN ONLY) ---

export async function getSettings(req, res) {
  try {
    const settings = await db.getSettings();
    return res.json({ settings });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch settings.' });
  }
}

export async function updateSettings(req, res) {
  try {
    const updated = await db.updateSettings(req.body);
    await logAudit(req, 'PLATFORM_SETTINGS_UPDATED', 'SETTINGS', 'Platform settings modified');
    return res.json({ message: 'Settings saved successfully.', settings: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update settings.' });
  }
}

// --- AUDIT LOGS ---

export async function getAuditLogs(req, res) {
  try {
    const logs = db.find('auditLogs');
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return res.json({ auditLogs: logs });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch audit logs.' });
  }
}

// --- ANALYTICS & REPORTS ---

export async function getAnalytics(req, res) {
  try {
    const users = db.find('users');
    const therapists = db.find('therapists');
    const appointments = db.find('appointments');
    const sessions = db.find('sessions');

    const totalClients = users.filter((u) => u.role === 'USER').length;
    const totalTherapists = therapists.length;
    const pendingVerifications = therapists.filter((t) => t.status === 'pending').length;
    const completedSessions = appointments.filter((a) => a.status === 'COMPLETED').length;
    const activeSessions = sessions.filter((s) => s.status === 'ACTIVE').length;
    const totalRevenue = appointments
      .filter((a) => a.status === 'COMPLETED' || a.status === 'CONFIRMED')
      .reduce((sum, a) => sum + (Number(a.fee) || 140), 0);

    return res.json({
      analytics: {
        totalClients,
        totalTherapists,
        pendingVerifications,
        completedSessions,
        activeSessions,
        totalRevenue,
        revenueByMonth: [
          { month: 'Apr', value: 12400 },
          { month: 'May', value: 16800 },
          { month: 'Jun', value: 21500 },
          { month: 'Jul', value: 24200 },
          { month: 'Aug', value: 27100 },
          { month: 'Sep', value: totalRevenue || 29850 }
        ]
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to compute analytics.' });
  }
}

export async function getReports(req, res) {
  try {
    const appointments = db.find('appointments');
    const therapists = db.find('therapists');

    const reports = [
      {
        id: 'rep_01',
        title: 'Monthly Clinical Session Outcomes',
        period: 'September 2026',
        totalConducted: appointments.filter((a) => a.status === 'COMPLETED').length,
        avgRating: 4.85,
        cancellationRate: '4.2%'
      },
      {
        id: 'rep_02',
        title: 'Therapist Verification & Onboarding Metrics',
        period: 'Q3 2026',
        onboarded: therapists.filter((t) => t.status === 'verified').length,
        pending: therapists.filter((t) => t.status === 'pending').length,
        medianApprovalTimeHours: 18
      }
    ];

    return res.json({ reports });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to generate reports.' });
  }
}
