import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../database/db.js';
import { logAudit } from '../services/auditService.js';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export async function register(req, res) {
  try {
    const { name, email, password, role = 'USER', focusAreas, license, specialty, experience } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = db.findOne('users', (u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const assignedRole = role === 'THERAPIST' ? 'THERAPIST' : 'USER';

    const newUser = await db.insert('users', {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: assignedRole,
      isActive: true,
      permissions: []
    });

    let therapistProfile = null;
    if (assignedRole === 'THERAPIST') {
      const initials = name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      therapistProfile = await db.insert('therapists', {
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        initials: initials || 'TH',
        license: license || 'Pending Verification',
        title: specialty ? `${specialty} Specialist` : 'Licensed Psychotherapist',
        specialty: specialty || 'General Psychotherapy',
        focusAreas: Array.isArray(focusAreas) ? focusAreas : [],
        experience: experience || '1+ years',
        bio: 'Professional psychotherapist offering compassionate, client-centered care.',
        hourlyRate: 130,
        status: 'pending', // Requires Super/Sub Admin approval
        rating: 0,
        clientsCount: 0,
        availability: [
          { day: 'Monday', slots: ['09:00 - 10:00', '11:00 - 12:00', '14:00 - 15:00'] },
          { day: 'Wednesday', slots: ['10:00 - 11:00', '13:00 - 14:00'] },
          { day: 'Friday', slots: ['09:00 - 10:00', '15:00 - 16:00'] }
        ]
      });

      await logAudit(
        { user: newUser, ip: req.ip },
        'THERAPIST_APPLICATION_SUBMITTED',
        'THERAPIST',
        `Therapist applied: ${newUser.name} (${newUser.email}), License: ${license}`
      );
    } else {
      await logAudit(
        { user: newUser, ip: req.ip },
        'USER_REGISTERED',
        'USER',
        `New client registered: ${newUser.name} (${newUser.email})`
      );
    }

    const token = generateToken(newUser);
    return res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions || [],
        therapistId: therapistProfile?.id,
        therapistStatus: therapistProfile?.status
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to complete registration.' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = db.findOne('users', (u) => u.email.toLowerCase() === normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Forbidden', message: 'This account has been deactivated.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    let therapistProfile = null;
    if (user.role === 'THERAPIST') {
      therapistProfile = db.findOne('therapists', (t) => t.userId === user.id);
    }

    const token = generateToken(user);

    await logAudit(
      { user, ip: req.ip },
      'AUTH_LOGIN',
      'USER',
      `Successful login: ${user.name} (${user.role})`
    );

    return res.json({
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        therapistId: therapistProfile?.id,
        therapistStatus: therapistProfile?.status
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to process login.' });
  }
}

export async function getMe(req, res) {
  try {
    const user = db.findById('users', req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found.' });
    }

    let therapistProfile = null;
    if (user.role === 'THERAPIST') {
      therapistProfile = db.findOne('therapists', (t) => t.userId === user.id);
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        profile: user.profile || {},
        therapistId: therapistProfile?.id,
        therapistStatus: therapistProfile?.status
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to fetch user data.' });
  }
}

export async function updateProfile(req, res) {
  try {
    const { name, phone, timezone, focusAreas } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (phone || timezone || focusAreas) {
      updates.profile = {
        ...(req.user.profile || {}),
        phone: phone || req.user.profile?.phone,
        timezone: timezone || req.user.profile?.timezone,
        focusAreas: focusAreas || req.user.profile?.focusAreas
      };
    }

    const updatedUser = await db.update('users', req.user.id, updates);
    await logAudit(req, 'USER_PROFILE_UPDATED', 'USER', `Profile updated for ${updatedUser.name}`);

    return res.json({
      message: 'Profile updated successfully.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        permissions: updatedUser.permissions || [],
        profile: updatedUser.profile || {}
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to update profile.' });
  }
}
