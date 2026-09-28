import bcrypt from 'bcryptjs';
import { db } from '../database/db.js';
import { ALL_PERMISSIONS } from '../database/seed.js';
import { logAudit } from '../services/auditService.js';

// ==========================================
// 1. SUB ADMIN & PERMISSION STATUS GOVERNANCE
// ==========================================

export async function getSubAdmins(req, res) {
  try {
    const subAdmins = db.find('subAdmins');
    const enriched = subAdmins.map((sa) => {
      const user = db.findById('users', sa.userId);
      const permissionsList = db.find('subAdminPermissions', (p) => p.subAdminId === sa.id);
      return {
        ...sa,
        isActive: user ? user.isActive : false,
        permissionsList
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

    const validPermissions = permissions.filter((p) => ALL_PERMISSIONS.includes(p));

    // When Super Admin assigns a new permission, it initially has PENDING status
    const permissionObjects = validPermissions.map((p) => ({
      permission: p,
      status: 'PENDING',
      assignedAt: new Date().toISOString()
    }));

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.insert('users', {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'SUB_ADMIN',
      isActive: true,
      permissions: permissionObjects
    });

    const subAdminRecord = await db.insert('subAdmins', {
      userId: newUser.id,
      name: newUser.name,
      email: newUser.email,
      assignedBy: req.user.id,
      permissions: permissionObjects,
      status: 'ACTIVE'
    });

    // Track each permission assignment
    for (const p of validPermissions) {
      await db.insert('subAdminPermissions', {
        subAdminId: subAdminRecord.id,
        userId: newUser.id,
        permission: p,
        status: 'PENDING',
        assignedBy: req.user.id,
        assignedAt: new Date().toISOString(),
        activatedAt: null
      });
    }

    await logAudit(
      req,
      'SUB_ADMIN_CREATED',
      'SUB_ADMIN',
      `Super Admin created Sub Admin ${newUser.name}. Permissions assigned in PENDING status: ${validPermissions.join(', ')}`
    );

    return res.status(201).json({
      message: 'Sub Admin created successfully. Assigned permissions are currently PENDING activation.',
      subAdmin: { ...subAdminRecord, isActive: true }
    });
  } catch (err) {
    console.error('Create Sub Admin error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to create Sub Admin.' });
  }
}

export async function activatePermission(req, res) {
  try {
    const { subAdminId, userId, permission } = req.body;
    const lookupId = subAdminId || userId;
    const subAdmin = db.findById('subAdmins', lookupId) || db.findOne('subAdmins', (s) => s.userId === lookupId);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    const now = new Date().toISOString();

    // 1. Update subAdminPermissions collection
    const permRecord = db.findOne(
      'subAdminPermissions',
      (p) => (p.subAdminId === subAdmin.id || p.userId === subAdmin.userId) && p.permission === permission
    );
    if (permRecord) {
      await db.update('subAdminPermissions', permRecord.id, {
        status: 'ACTIVATED',
        activatedAt: now
      });
    } else {
      await db.insert('subAdminPermissions', {
        subAdminId,
        userId: subAdmin.userId,
        permission,
        status: 'ACTIVATED',
        assignedBy: req.user.id,
        assignedAt: now,
        activatedAt: now
      });
    }

    // 2. Update user.permissions
    const user = db.findById('users', subAdmin.userId);
    if (user) {
      const currentPerms = Array.isArray(user.permissions) ? user.permissions : [];
      let found = false;
      const updatedPerms = currentPerms.map((item) => {
        if (typeof item === 'object' && item.permission === permission) {
          found = true;
          return { ...item, status: 'ACTIVATED', activatedAt: now };
        }
        return item;
      });
      if (!found) {
        updatedPerms.push({ permission, status: 'ACTIVATED', assignedAt: now, activatedAt: now });
      }
      await db.update('users', user.id, { permissions: updatedPerms });
      await db.update('subAdmins', subAdmin.id, { permissions: updatedPerms });
    }

    await logAudit(
      req,
      'PERMISSION_ACTIVATED',
      'SUB_ADMIN',
      `Super Admin activated permission '${permission}' for Sub Admin ${subAdmin.name}`
    );

    return res.json({ message: `Permission '${permission}' ACTIVATED successfully.` });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to activate permission.' });
  }
}

export async function disablePermission(req, res) {
  try {
    const { subAdminId, userId, permission } = req.body;
    const lookupId = subAdminId || userId;
    const subAdmin = db.findById('subAdmins', lookupId) || db.findOne('subAdmins', (s) => s.userId === lookupId);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    const permRecord = db.findOne(
      'subAdminPermissions',
      (p) => (p.subAdminId === subAdmin.id || p.userId === subAdmin.userId) && p.permission === permission
    );
    if (permRecord) {
      await db.update('subAdminPermissions', permRecord.id, { status: 'DISABLED' });
    }

    const user = db.findById('users', subAdmin.userId);
    if (user) {
      const currentPerms = Array.isArray(user.permissions) ? user.permissions : [];
      const updatedPerms = currentPerms.map((item) => {
        if (typeof item === 'object' && item.permission === permission) {
          return { ...item, status: 'DISABLED' };
        }
        return item;
      });
      await db.update('users', user.id, { permissions: updatedPerms });
      await db.update('subAdmins', subAdmin.id, { permissions: updatedPerms });
    }

    await logAudit(
      req,
      'PERMISSION_DISABLED',
      'SUB_ADMIN',
      `Super Admin disabled permission '${permission}' for Sub Admin ${subAdmin.name}`
    );

    return res.json({ message: `Permission '${permission}' DISABLED.` });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to disable permission.' });
  }
}

export async function removePermission(req, res) {
  try {
    const { subAdminId, userId, permission } = req.body;
    const lookupId = subAdminId || userId;
    const subAdmin = db.findById('subAdmins', lookupId) || db.findOne('subAdmins', (s) => s.userId === lookupId);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    const permRecord = db.findOne(
      'subAdminPermissions',
      (p) => (p.subAdminId === subAdmin.id || p.userId === subAdmin.userId) && p.permission === permission
    );
    if (permRecord) {
      await db.delete('subAdminPermissions', permRecord.id);
    }

    const user = db.findById('users', subAdmin.userId);
    if (user) {
      const currentPerms = Array.isArray(user.permissions) ? user.permissions : [];
      const filtered = currentPerms.filter((item) => {
        const pName = typeof item === 'object' ? item.permission : item;
        return pName !== permission;
      });
      await db.update('users', user.id, { permissions: filtered });
      await db.update('subAdmins', subAdmin.id, { permissions: filtered });
    }

    await logAudit(
      req,
      'PERMISSION_REMOVED',
      'SUB_ADMIN',
      `Super Admin removed permission '${permission}' from Sub Admin ${subAdmin.name}`
    );

    return res.json({ message: `Permission '${permission}' removed.` });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to remove permission.' });
  }
}

export async function updateSubAdmin(req, res) {
  try {
    const { id } = req.params;
    const { name, permissions } = req.body;
    const subAdmin = db.findById('subAdmins', id) || db.findOne('subAdmins', (s) => s.userId === id);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    const updates = {};
    if (name) updates.name = name.trim();

    if (Array.isArray(permissions)) {
      const validPermissions = permissions.filter((p) => ALL_PERMISSIONS.includes(p));
      const existingUserPerms = subAdmin.permissions || [];
      const updatedPermObjects = validPermissions.map((p) => {
        const existing = existingUserPerms.find((ep) => (ep.permission || ep) === p);
        return existing || {
          permission: p,
          status: 'PENDING',
          assignedAt: new Date().toISOString()
        };
      });
      updates.permissions = updatedPermObjects;
    }

    const updatedSubAdmin = await db.update('subAdmins', subAdmin.id, updates);
    if (subAdmin.userId) {
      await db.update('users', subAdmin.userId, updates);
    }

    await logAudit(
      req,
      'SUB_ADMIN_UPDATED',
      'SUB_ADMIN',
      `Super Admin updated Sub Admin ${subAdmin.name}`
    );

    return res.json({
      message: 'Sub Admin updated successfully.',
      subAdmin: updatedSubAdmin
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update Sub Admin.' });
  }
}

export async function toggleDisableSubAdmin(req, res) {
  try {
    const { id } = req.params;
    const subAdmin = db.findById('subAdmins', id) || db.findOne('subAdmins', (s) => s.userId === id);
    if (!subAdmin) {
      return res.status(404).json({ error: 'Not Found', message: 'Sub Admin not found.' });
    }

    const user = db.findById('users', subAdmin.userId);
    const newActiveState = user ? !user.isActive : false;

    if (user) {
      await db.update('users', user.id, { isActive: newActiveState });
    }

    const updated = await db.update('subAdmins', subAdmin.id, {
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
    // Delete permission records
    const perms = db.find('subAdminPermissions', (p) => p.subAdminId === id);
    for (const p of perms) {
      await db.delete('subAdminPermissions', p.id);
    }
    await db.delete('subAdmins', id);

    await logAudit(req, 'SUB_ADMIN_DELETED', 'SUB_ADMIN', `Sub Admin ${subAdmin.name} deleted.`);

    return res.json({ message: 'Sub Admin deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to delete Sub Admin.' });
  }
}

// ==========================================
// 2. THERAPIST MANAGEMENT & REGISTRATION TYPES
// ==========================================

export async function getAdminTherapists(req, res) {
  try {
    const { type, status } = req.query;
    let therapists = db.find('therapists');
    if (type) therapists = therapists.filter((t) => t.registration_type === type);
    if (status) therapists = therapists.filter((t) => t.status === status);

    return res.json({ therapists });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve therapists.' });
  }
}

/**
 * Super Admin Directly Registers a Therapist
 * registration_type = ADMIN_REGISTERED, status = APPROVED
 */
export async function registerTherapistDirectly(req, res) {
  try {
    const {
      name,
      email,
      password,
      phone,
      license,
      specialty,
      experience,
      qualifications,
      hourlyRate,
      bio,
      focusAreas,
      availability
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (db.findOne('users', (u) => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Conflict', message: 'User account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.insert('users', {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'THERAPIST',
      isActive: true,
      permissions: []
    });

    const initials = name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const therapistProfile = await db.insert('therapists', {
      userId: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: phone || '+251 91 000 0000',
      registration_type: 'ADMIN_REGISTERED',
      status: 'APPROVED', // Immediately approved to provide psychotherapy sessions
      initials: initials || 'TH',
      license: license || 'Licensed Clinician',
      qualifications: qualifications || 'Certified Clinical Practitioner',
      title: specialty ? `${specialty} Specialist` : 'Licensed Psychotherapist',
      specialty: specialty || 'General Clinical Psychotherapy',
      focusAreas: Array.isArray(focusAreas) ? focusAreas : ['Anxiety', 'Stress'],
      experience: experience || '3+ years',
      bio: bio || 'Professional clinical therapist directly credentialed by platform administration.',
      hourlyRate: Number(hourlyRate) || 1400,
      currency: 'ETB',
      rating: 5.0,
      clientsCount: 0,
      availability: availability || [
        { day: 'Monday', slots: ['09:00 - 10:00', '11:00 - 12:00', '14:00 - 15:00'] },
        { day: 'Wednesday', slots: ['10:00 - 11:00', '13:00 - 14:00'] },
        { day: 'Friday', slots: ['09:00 - 10:00', '15:00 - 16:00'] }
      ]
    });

    await logAudit(
      req,
      'ADMIN_REGISTERED_THERAPIST',
      'THERAPIST',
      `Super Admin directly registered therapist ${therapistProfile.name} (${therapistProfile.email}, status: APPROVED)`
    );

    return res.status(201).json({
      message: 'Therapist registered directly and activated for practice.',
      therapist: therapistProfile
    });
  } catch (err) {
    console.error('Direct therapist registration error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to directly register therapist.' });
  }
}

export async function approveTherapist(req, res) {
  try {
    const { id } = req.params;
    const therapist = db.findById('therapists', id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    const updated = await db.update('therapists', id, { status: 'APPROVED' });
    await logAudit(
      req,
      'THERAPIST_APPROVED',
      'THERAPIST',
      `Therapist ${therapist.name} application APPROVED by ${req.user.name}`
    );

    return res.json({ message: 'Therapist application approved. Clinician can now accept clients.', therapist: updated });
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

    const updated = await db.update('therapists', id, { status: 'REJECTED' });
    await logAudit(
      req,
      'THERAPIST_REJECTED',
      'THERAPIST',
      `Therapist ${therapist.name} application REJECTED by ${req.user.name}`
    );

    return res.json({ message: 'Therapist application rejected.', therapist: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to reject therapist.' });
  }
}

export async function updateAdminTherapist(req, res) {
  try {
    const { id } = req.params;
    const therapist = db.findById('therapists', id);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    const { license, specialty, status, hourlyRate, focusAreas, qualifications, phone, bio } = req.body;
    const updates = {};
    if (license !== undefined) updates.license = license;
    if (specialty !== undefined) updates.specialty = specialty;
    if (status !== undefined) updates.status = status;
    if (hourlyRate !== undefined) updates.hourlyRate = Number(hourlyRate);
    if (focusAreas !== undefined) updates.focusAreas = focusAreas;
    if (qualifications !== undefined) updates.qualifications = qualifications;
    if (phone !== undefined) updates.phone = phone;
    if (bio !== undefined) updates.bio = bio;

    const updated = await db.update('therapists', id, updates);
    await logAudit(req, 'ADMIN_UPDATE_THERAPIST', 'THERAPIST', `Updated therapist ${therapist.name}`);

    return res.json({ message: 'Therapist updated.', therapist: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update therapist.' });
  }
}

// ==========================================
// 3. THERAPY PACKAGES MANAGEMENT
// ==========================================

export async function getAdminPackages(req, res) {
  try {
    const packages = db.find('therapyPackages');
    return res.json({ packages });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch packages.' });
  }
}

export async function createAdminPackage(req, res) {
  try {
    const { name, type = 'MONTHLY', durationDays, sessionsCount, basePrice, currency = 'ETB', description } = req.body;
    if (!name || !sessionsCount || !basePrice) {
      return res.status(400).json({ error: 'Validation Error', message: 'Package name, session count, and base price are required.' });
    }

    const newPkg = await db.insert('therapyPackages', {
      name: name.trim(),
      type: type.toUpperCase(), // WEEKLY or MONTHLY
      durationDays: Number(durationDays) || (type.toUpperCase() === 'WEEKLY' ? 7 : 30),
      sessionsCount: Number(sessionsCount),
      basePrice: Number(basePrice),
      currency: currency || 'ETB',
      description: description || '',
      isActive: true
    });

    await logAudit(req, 'PACKAGE_CREATED', 'PACKAGE', `Created package ${newPkg.name} (${newPkg.basePrice} ${newPkg.currency})`);

    return res.status(201).json({ message: 'Therapy package created.', package: newPkg });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to create package.' });
  }
}

export async function updateAdminPackage(req, res) {
  try {
    const { id } = req.params;
    const pkg = db.findById('therapyPackages', id);
    if (!pkg) {
      return res.status(404).json({ error: 'Not Found', message: 'Package not found.' });
    }

    const { name, basePrice, sessionsCount, description, isActive } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (basePrice !== undefined) updates.basePrice = Number(basePrice);
    if (sessionsCount !== undefined) updates.sessionsCount = Number(sessionsCount);
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const updated = await db.update('therapyPackages', id, updates);
    await logAudit(req, 'PACKAGE_UPDATED', 'PACKAGE', `Updated package ${pkg.name}`);

    return res.json({ message: 'Package updated.', package: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update package.' });
  }
}

export async function deleteAdminPackage(req, res) {
  try {
    const { id } = req.params;
    await db.delete('therapyPackages', id);
    await logAudit(req, 'PACKAGE_DELETED', 'PACKAGE', `Deleted package ${id}`);
    return res.json({ message: 'Package deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to delete package.' });
  }
}

// ==========================================
// 4. PAYMENTS & PLATFORM REVENUE
// ==========================================

export async function getPayments(req, res) {
  try {
    const payments = db.find('payments');
    payments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json({ payments });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch payments.' });
  }
}

// ==========================================
// 5. USER MANAGEMENT
// ==========================================

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
    const { name, email, password, role = 'USER' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (db.findOne('users', (u) => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Conflict', message: 'User with this email already exists.' });
    }

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
      permissions: []
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

    if (targetUser.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden', message: 'Cannot modify Super Admin accounts.' });
    }

    const { name, email, isActive } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.toLowerCase().trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

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

// ==========================================
// 6. PLATFORM SETTINGS (SUPER ADMIN ONLY)
// ==========================================

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

// ==========================================
// 7. AUDIT LOGS, ANALYTICS & REPORTS
// ==========================================

export async function getAuditLogs(req, res) {
  try {
    const logs = db.find('auditLogs');
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return res.json({ auditLogs: logs });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch audit logs.' });
  }
}

export async function getAnalytics(req, res) {
  try {
    const users = db.find('users');
    const therapists = db.find('therapists');
    const appointments = db.find('appointments');
    const sessions = db.find('sessions');
    const payments = db.find('payments');

    const totalClients = users.filter((u) => u.role === 'USER').length;
    const totalTherapists = therapists.length;
    const pendingVerifications = therapists.filter((t) => t.status === 'PENDING').length;
    const completedSessions = appointments.filter((a) => a.status === 'COMPLETED').length;
    const activeSessions = sessions.filter((s) => s.status === 'ACTIVE').length;
    const totalRevenueETB = payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return res.json({
      analytics: {
        totalClients,
        totalTherapists,
        pendingVerifications,
        completedSessions,
        activeSessions,
        totalRevenue: totalRevenueETB,
        currency: 'ETB',
        revenueByMonth: [
          { month: 'Apr', value: 24000 },
          { month: 'May', value: 36000 },
          { month: 'Jun', value: 48000 },
          { month: 'Jul', value: 52000 },
          { month: 'Aug', value: 68000 },
          { month: 'Sep', value: totalRevenueETB || 84000 }
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
    const payments = db.find('payments');

    const reports = [
      {
        id: 'rep_01',
        title: 'Monthly Psychotherapy Outcomes & Retention',
        period: 'September 2026',
        totalConducted: appointments.filter((a) => a.status === 'COMPLETED').length,
        avgRating: 4.88,
        cancellationRate: '3.8%'
      },
      {
        id: 'rep_02',
        title: 'Therapist Credentialing & Application Pipeline',
        period: 'Q3 2026',
        approvedCount: therapists.filter((t) => t.status === 'APPROVED' || t.status === 'verified').length,
        pendingCount: therapists.filter((t) => t.status === 'PENDING').length,
        adminRegisteredCount: therapists.filter((t) => t.registration_type === 'ADMIN_REGISTERED').length
      },
      {
        id: 'rep_03',
        title: 'Package Sales & Ethiopian Birr Revenue',
        period: 'September 2026',
        totalVolumeETB: payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
        telebirrShare: '68%',
        cbeShare: '32%'
      }
    ];

    return res.json({ reports });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to generate reports.' });
  }
}
