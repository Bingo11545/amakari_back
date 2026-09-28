import bcrypt from 'bcryptjs';
import { db } from './db.js';

export const ALL_PERMISSIONS = [
  'USER_VIEW',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'THERAPIST_VIEW',
  'THERAPIST_UPDATE',
  'THERAPIST_APPROVE',
  'APPOINTMENT_VIEW',
  'APPOINTMENT_MANAGE',
  'SESSION_VIEW',
  'SESSION_MANAGE',
  'REPORT_VIEW',
  'ANALYTICS_VIEW',
  'PAYMENT_VIEW',
  'PAYMENT_MANAGE',
  'AUDIT_LOG_VIEW'
];

export async function seedDatabase(force = false) {
  await db.init();

  const existingUsers = db.find('users');
  if (existingUsers.length > 0 && !force) {
    return;
  }

  const hashedPasswordAdmin = await bcrypt.hash('Admin123!', 10);
  const hashedPasswordTherapist = await bcrypt.hash('Therapist123!', 10);
  const hashedPasswordClient = await bcrypt.hash('Client123!', 10);

  // 1. Super Admin
  const superAdmin = await db.insert('users', {
    id: 'user_superadmin_01',
    name: 'Amakari Super Admin',
    email: 'superadmin@amakari.com',
    password: hashedPasswordAdmin,
    role: 'SUPER_ADMIN',
    isActive: true,
    permissions: [...ALL_PERMISSIONS]
  });

  // 2. Sub Admin
  const subAdminPermissions = [
    'USER_VIEW',
    'USER_UPDATE',
    'THERAPIST_VIEW',
    'THERAPIST_APPROVE',
    'APPOINTMENT_VIEW',
    'SESSION_VIEW',
    'ANALYTICS_VIEW',
    'REPORT_VIEW'
  ];

  const subAdminUser = await db.insert('users', {
    id: 'user_subadmin_01',
    name: 'Clinical Operations Sub Admin',
    email: 'subadmin@amakari.com',
    password: hashedPasswordAdmin,
    role: 'SUB_ADMIN',
    isActive: true,
    permissions: subAdminPermissions
  });

  await db.insert('subAdmins', {
    id: 'subadmin_record_01',
    userId: subAdminUser.id,
    name: subAdminUser.name,
    email: subAdminUser.email,
    assignedBy: superAdmin.id,
    permissions: subAdminPermissions,
    status: 'ACTIVE'
  });

  // 3. Therapists
  const therapist1User = await db.insert('users', {
    id: 'user_therapist_01',
    name: 'Dr. Amara Reyes, LMFT',
    email: 'therapist@amakari.com',
    password: hashedPasswordTherapist,
    role: 'THERAPIST',
    isActive: true,
    permissions: []
  });

  const therapist1 = await db.insert('therapists', {
    id: 'therapist_01',
    userId: therapist1User.id,
    name: therapist1User.name,
    email: therapist1User.email,
    initials: 'AR',
    license: 'LMFT-98421',
    title: 'Licensed Marriage & Family Therapist',
    specialty: 'Anxiety & Trauma Specialist',
    focusAreas: ['Anxiety', 'Trauma', 'Stress', 'Relationships'],
    experience: '9 years',
    bio: 'Dedicated to helping individuals navigate anxiety, stress, and relational dynamics with evidence-based cognitive and somatic approaches.',
    hourlyRate: 140,
    status: 'verified', // 'pending' | 'verified' | 'rejected' | 'suspended'
    rating: 4.9,
    clientsCount: 18,
    availability: [
      { day: 'Monday', slots: ['09:00 - 10:00', '10:30 - 11:30', '14:00 - 15:00', '15:30 - 16:30'] },
      { day: 'Wednesday', slots: ['10:00 - 11:00', '11:30 - 12:30', '15:00 - 16:00'] },
      { day: 'Thursday', slots: ['09:00 - 10:00', '13:00 - 14:00', '16:00 - 17:00'] },
      { day: 'Friday', slots: ['10:00 - 11:00', '13:30 - 14:30'] }
    ]
  });

  const therapist2User = await db.insert('users', {
    id: 'user_therapist_02',
    name: 'Dr. Liam Brooks, PsyD',
    email: 'liam.brooks@amakari.com',
    password: hashedPasswordTherapist,
    role: 'THERAPIST',
    isActive: true,
    permissions: []
  });

  const therapist2 = await db.insert('therapists', {
    id: 'therapist_02',
    userId: therapist2User.id,
    name: therapist2User.name,
    email: therapist2User.email,
    initials: 'LB',
    license: 'PSY-55209',
    title: 'Clinical Psychologist',
    specialty: 'Couples & Family Dynamics',
    focusAreas: ['Couples', 'Relationships', 'Burnout'],
    experience: '12 years',
    bio: 'Specializing in relationship strengthening, executive burnout, and modern conflict resolution therapies.',
    hourlyRate: 160,
    status: 'verified',
    rating: 4.8,
    clientsCount: 22,
    availability: [
      { day: 'Tuesday', slots: ['10:00 - 11:00', '11:30 - 12:30', '14:00 - 15:00'] },
      { day: 'Wednesday', slots: ['09:00 - 10:00', '13:00 - 14:00', '15:30 - 16:30'] },
      { day: 'Thursday', slots: ['11:00 - 12:00', '14:00 - 15:00'] }
    ]
  });

  const therapist3User = await db.insert('users', {
    id: 'user_therapist_03',
    name: 'Maya Chen, LCSW',
    email: 'maya.chen@amakari.com',
    password: hashedPasswordTherapist,
    role: 'THERAPIST',
    isActive: true,
    permissions: []
  });

  await db.insert('therapists', {
    id: 'therapist_03',
    userId: therapist3User.id,
    name: therapist3User.name,
    email: therapist3User.email,
    initials: 'MC',
    license: 'LCSW-33104',
    title: 'Licensed Clinical Social Worker',
    specialty: 'Grief & Major Life Transitions',
    focusAreas: ['Grief', 'Depression', 'Trauma'],
    experience: '6 years',
    bio: 'Compassionate psychotherapy honoring client lived experience and gentle recovery pathways.',
    hourlyRate: 120,
    status: 'pending', // Pending verification
    rating: 0,
    clientsCount: 0,
    availability: [
      { day: 'Monday', slots: ['11:00 - 12:00', '15:00 - 16:00'] },
      { day: 'Friday', slots: ['09:00 - 10:00', '14:00 - 15:00'] }
    ]
  });

  // 4. Clients / Users
  const client1User = await db.insert('users', {
    id: 'user_client_01',
    name: 'Sarah Jenkins',
    email: 'client@amakari.com',
    password: hashedPasswordClient,
    role: 'USER',
    isActive: true,
    permissions: [],
    profile: {
      phone: '+1 (555) 234-5678',
      timezone: 'America/New_York',
      focusAreas: ['Anxiety', 'Stress']
    }
  });

  const client2User = await db.insert('users', {
    id: 'user_client_02',
    name: 'Michael Chen',
    email: 'client2@amakari.com',
    password: hashedPasswordClient,
    role: 'USER',
    isActive: true,
    permissions: [],
    profile: {
      phone: '+1 (555) 345-6789',
      timezone: 'America/Los_Angeles',
      focusAreas: ['Relationships', 'Burnout']
    }
  });

  // 5. Initial Session & Appointment
  const todayStr = new Date().toISOString().split('T')[0];

  const session1 = await db.insert('sessions', {
    id: 'session_01',
    appointmentId: 'appt_01',
    clientId: client1User.id,
    therapistId: therapist1.id,
    therapistUserId: therapist1User.id,
    roomId: 'room_amakari_session_live_01',
    status: 'SCHEDULED', // SCHEDULED, ACTIVE, ENDED, CANCELLED
    startedAt: null,
    endedAt: null
  });

  const appt1 = await db.insert('appointments', {
    id: 'appt_01',
    clientId: client1User.id,
    clientName: client1User.name,
    clientEmail: client1User.email,
    therapistId: therapist1.id,
    therapistUserId: therapist1User.id,
    therapistName: therapist1.name,
    date: todayStr,
    startTime: '15:00',
    endTime: '15:50',
    type: 'Individual session',
    fee: 140,
    status: 'CONFIRMED', // PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW
    sessionId: session1.id,
    notes: 'Initial evaluation and anxiety reduction strategies'
  });

  // 6. Historical completed appointment
  await db.insert('appointments', {
    id: 'appt_02_completed',
    clientId: client1User.id,
    clientName: client1User.name,
    clientEmail: client1User.email,
    therapistId: therapist1.id,
    therapistUserId: therapist1User.id,
    therapistName: therapist1.name,
    date: '2026-09-18',
    startTime: '14:00',
    endTime: '14:50',
    type: 'Individual session',
    fee: 140,
    status: 'COMPLETED',
    sessionId: 'session_02_completed',
    notes: 'Follow-up on mindfulness exercises'
  });

  // 7. Audit Logs
  await db.insert('auditLogs', {
    id: 'audit_01',
    actorId: superAdmin.id,
    actorEmail: superAdmin.email,
    actorRole: 'SUPER_ADMIN',
    action: 'SYSTEM_INITIALIZATION',
    resource: 'DATABASE',
    details: 'System seeded with default admin, therapist, client accounts and roles.',
    timestamp: new Date().toISOString()
  });

  // 8. Platform Settings
  await db.updateSettings({
    platformName: 'Amakari Psychotherapy',
    sessionDurationMinutes: 50,
    cancellationBufferHours: 24,
    videoProvider: 'Native WebRTC Mesh / P2P with Secure Signaling',
    maintenanceMode: false,
    requireTherapistVerification: true
  });

  console.log('Database seeded successfully.');
}
