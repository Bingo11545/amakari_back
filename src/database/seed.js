import bcrypt from 'bcryptjs';
import { db } from './db.js';

export const ALL_PERMISSIONS = [
  'USER_VIEW',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'THERAPIST_VIEW',
  'THERAPIST_APPROVE',
  'THERAPIST_UPDATE',
  'THERAPIST_REJECT',
  'APPOINTMENT_VIEW',
  'APPOINTMENT_MANAGE',
  'SESSION_VIEW',
  'SESSION_MANAGE',
  'PACKAGE_VIEW',
  'PACKAGE_MANAGE',
  'PAYMENT_VIEW',
  'PAYMENT_MANAGE',
  'REPORT_VIEW',
  'ANALYTICS_VIEW',
  'AUDIT_LOG_VIEW'
];

export async function seedDatabase(force = false) {
  await db.init();

  // Ensure therapy packages exist
  const existingPackages = db.find('therapyPackages');
  if (existingPackages.length === 0) {
    await db.insert('therapyPackages', {
      id: 'pkg_weekly_01',
      name: 'Weekly Psychotherapy Package',
      type: 'WEEKLY',
      durationDays: 7,
      sessionsCount: 4,
      basePrice: 2000,
      currency: 'ETB',
      description: '4 focused psychotherapy sessions per week for intensive acute care and goal stabilization.',
      isActive: true
    });

    await db.insert('therapyPackages', {
      id: 'pkg_monthly_01',
      name: 'Monthly Comprehensive Psychotherapy Package',
      type: 'MONTHLY',
      durationDays: 30,
      durationMonthsEquivalent: 1,
      sessionsCount: 8,
      basePrice: 4000,
      currency: 'ETB',
      description: '8 sessions per month with full clinical tracking and between-session cognitive exercises.',
      isActive: true
    });
  }

  // Ensure therapists have registration_type and APPROVED status
  const therapists = db.find('therapists');
  for (const t of therapists) {
    if (!t.registration_type || t.status === 'verified') {
      await db.update('therapists', t.id, {
        registration_type: t.registration_type || 'ADMIN_REGISTERED',
        status: t.status === 'verified' ? 'APPROVED' : t.status
      });
    }
  }

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
    permissions: ALL_PERMISSIONS.map((p) => ({
      permission: p,
      status: 'ACTIVATED',
      assignedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString()
    }))
  });

  // 2. Sub Admin
  const subAdminInitialPerms = [
    { permission: 'USER_VIEW', status: 'ACTIVATED' },
    { permission: 'USER_UPDATE', status: 'ACTIVATED' },
    { permission: 'THERAPIST_VIEW', status: 'ACTIVATED' },
    { permission: 'THERAPIST_APPROVE', status: 'ACTIVATED' },
    { permission: 'THERAPIST_REJECT', status: 'ACTIVATED' },
    { permission: 'APPOINTMENT_VIEW', status: 'ACTIVATED' },
    { permission: 'SESSION_VIEW', status: 'ACTIVATED' },
    { permission: 'PACKAGE_VIEW', status: 'ACTIVATED' },
    { permission: 'PAYMENT_VIEW', status: 'ACTIVATED' },
    { permission: 'ANALYTICS_VIEW', status: 'ACTIVATED' },
    { permission: 'REPORT_VIEW', status: 'ACTIVATED' },
    { permission: 'USER_DELETE', status: 'PENDING' }, // Pending permission
    { permission: 'PAYMENT_MANAGE', status: 'PENDING' } // Pending permission
  ];

  const subAdminUser = await db.insert('users', {
    id: 'user_subadmin_01',
    name: 'Clinical Operations Sub Admin',
    email: 'subadmin@amakari.com',
    password: hashedPasswordAdmin,
    role: 'SUB_ADMIN',
    isActive: true,
    permissions: subAdminInitialPerms
  });

  const subAdminRecord = await db.insert('subAdmins', {
    id: 'subadmin_record_01',
    userId: subAdminUser.id,
    name: subAdminUser.name,
    email: subAdminUser.email,
    assignedBy: superAdmin.id,
    permissions: subAdminInitialPerms,
    status: 'ACTIVE'
  });

  for (const perm of subAdminInitialPerms) {
    await db.insert('subAdminPermissions', {
      subAdminId: subAdminRecord.id,
      userId: subAdminUser.id,
      permission: perm.permission,
      status: perm.status,
      assignedBy: superAdmin.id,
      assignedAt: new Date().toISOString(),
      activatedAt: perm.status === 'ACTIVATED' ? new Date().toISOString() : null
    });
  }

  // 3. Therapy Packages (Platform Offering in ETB)
  const weeklyPkg = await db.insert('therapyPackages', {
    id: 'pkg_weekly_01',
    name: 'Weekly Psychotherapy Package',
    type: 'WEEKLY',
    durationDays: 7,
    durationMonthsEquivalent: 0.25,
    sessionsCount: 4,
    basePrice: 2000,
    currency: 'ETB',
    description: '4 focused psychotherapy sessions per week for intensive acute care and goal stabilization.',
    isActive: true
  });

  const monthlyPkg = await db.insert('therapyPackages', {
    id: 'pkg_monthly_01',
    name: 'Monthly Comprehensive Psychotherapy Package',
    type: 'MONTHLY',
    durationDays: 30,
    durationMonthsEquivalent: 1,
    sessionsCount: 8,
    basePrice: 4000,
    currency: 'ETB',
    description: '8 sessions per month with full clinical tracking and between-session cognitive exercises.',
    isActive: true
  });

  // 4. Therapists (Both Types: ADMIN_REGISTERED and APPLIED)
  // Type 1: Admin Registered Therapist (status: APPROVED)
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
    phone: '+251 91 123 4567',
    registration_type: 'ADMIN_REGISTERED',
    status: 'APPROVED', // APPROVED, PENDING, REJECTED, SUSPENDED
    initials: 'AR',
    license: 'LMFT-98421',
    qualifications: 'M.S. Clinical Psychology, Addis Ababa University; Certified CBT Practitioner',
    title: 'Licensed Marriage & Family Therapist',
    specialty: 'Anxiety & Trauma Specialist',
    focusAreas: ['Anxiety', 'Trauma', 'Stress', 'Relationships'],
    experience: '9 years clinical psychotherapy',
    bio: 'Dedicated to helping individuals navigate anxiety, stress, and relational dynamics with evidence-based cognitive and somatic approaches.',
    hourlyRate: 1400,
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
    phone: '+251 92 234 5678',
    registration_type: 'ADMIN_REGISTERED',
    status: 'APPROVED',
    initials: 'LB',
    license: 'PSY-55209',
    qualifications: 'Doctor of Psychology (PsyD); Fellow, Ethiopian Psychological Association',
    title: 'Clinical Psychologist',
    specialty: 'Couples & Family Dynamics',
    focusAreas: ['Couples', 'Relationships', 'Burnout'],
    experience: '12 years',
    bio: 'Specializing in relationship strengthening, executive burnout, and modern conflict resolution therapies.',
    hourlyRate: 1600,
    rating: 4.8,
    clientsCount: 22,
    availability: [
      { day: 'Tuesday', slots: ['10:00 - 11:00', '11:30 - 12:30', '14:00 - 15:00'] },
      { day: 'Wednesday', slots: ['09:00 - 10:00', '13:00 - 14:00', '15:30 - 16:30'] },
      { day: 'Thursday', slots: ['11:00 - 12:00', '14:00 - 15:00'] }
    ]
  });

  // Type 2: Applied Therapist (status: PENDING)
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
    phone: '+251 93 345 6789',
    registration_type: 'APPLIED',
    status: 'PENDING', // PENDING review by Super Admin or authorized Sub Admin
    initials: 'MC',
    license: 'LCSW-33104',
    qualifications: 'Master of Social Work, Clinical Track',
    title: 'Licensed Clinical Social Worker',
    specialty: 'Grief & Major Life Transitions',
    focusAreas: ['Grief', 'Depression', 'Trauma'],
    experience: '6 years',
    bio: 'Compassionate psychotherapy honoring client lived experience and gentle recovery pathways.',
    hourlyRate: 1200,
    rating: 0,
    clientsCount: 0,
    availability: [
      { day: 'Monday', slots: ['11:00 - 12:00', '15:00 - 16:00'] },
      { day: 'Friday', slots: ['09:00 - 10:00', '14:00 - 15:00'] }
    ]
  });

  // 5. Clients / Users
  const client1User = await db.insert('users', {
    id: 'user_client_01',
    name: 'Sarah Jenkins',
    email: 'client@amakari.com',
    password: hashedPasswordClient,
    role: 'USER',
    isActive: true,
    permissions: [],
    profile: {
      phone: '+251 94 456 7890',
      timezone: 'Africa/Addis_Ababa',
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
      phone: '+251 95 567 8901',
      timezone: 'Africa/Addis_Ababa',
      focusAreas: ['Relationships', 'Burnout']
    }
  });

  // 6. Payment & UserPackage (3 Months Purchase: 8 sessions * 3 = 24 sessions, 4,000 * 3 = 12,000 ETB)
  const now = new Date();
  const expireDate = new Date();
  expireDate.setMonth(now.getMonth() + 3);

  const initialPayment = await db.insert('payments', {
    id: 'pay_01',
    payment_id: 'PAY-AMAKARI-2026-001',
    user_id: client1User.id,
    userName: client1User.name,
    therapist_id: therapist1.id,
    therapistName: therapist1.name,
    package_id: monthlyPkg.id,
    packageName: monthlyPkg.name,
    package_duration: 3, // 3 months
    amount: 12000,
    currency: 'ETB',
    payment_method: 'TELEBIRR',
    transaction_reference: 'TXN-TB-99882233',
    status: 'PAID', // PENDING, PAID, FAILED, CANCELLED, REFUNDED
    created_at: now.toISOString(),
    paid_at: now.toISOString()
  });

  const initialUserPackage = await db.insert('userPackages', {
    id: 'upkg_01',
    userId: client1User.id,
    therapistId: therapist1.id,
    packageId: monthlyPkg.id,
    packageName: monthlyPkg.name,
    durationMonths: 3,
    totalPrice: 12000,
    currency: 'ETB',
    startDate: now.toISOString().split('T')[0],
    expirationDate: expireDate.toISOString().split('T')[0],
    sessionsPurchased: 24,
    sessionsUsed: 1,
    sessionsRemaining: 23,
    paymentId: initialPayment.id,
    paymentStatus: 'PAID',
    status: 'ACTIVE' // ACTIVE, DEPLETED, EXPIRED
  });

  // 7. Initial Session & Appointment
  const todayStr = new Date().toISOString().split('T')[0];

  const session1 = await db.insert('sessions', {
    id: 'session_01',
    appointmentId: 'appt_01',
    clientId: client1User.id,
    therapistId: therapist1.id,
    therapistUserId: therapist1User.id,
    userPackageId: initialUserPackage.id,
    roomId: 'room_amakari_session_live_01',
    status: 'SCHEDULED', // SCHEDULED, ACTIVE, ENDED, CANCELLED
    startedAt: null,
    endedAt: null
  });

  await db.insert('appointments', {
    id: 'appt_01',
    clientId: client1User.id,
    clientName: client1User.name,
    clientEmail: client1User.email,
    therapistId: therapist1.id,
    therapistUserId: therapist1User.id,
    therapistName: therapist1.name,
    userPackageId: initialUserPackage.id,
    date: todayStr,
    startTime: '15:00',
    endTime: '15:50',
    type: 'Individual session',
    fee: 1400,
    currency: 'ETB',
    status: 'CONFIRMED', // PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW
    sessionId: session1.id,
    notes: 'Initial evaluation and anxiety reduction strategies'
  });

  // 8. Completed historical appointment
  await db.insert('appointments', {
    id: 'appt_02_completed',
    clientId: client1User.id,
    clientName: client1User.name,
    clientEmail: client1User.email,
    therapistId: therapist1.id,
    therapistUserId: therapist1User.id,
    therapistName: therapist1.name,
    userPackageId: initialUserPackage.id,
    date: '2026-09-18',
    startTime: '14:00',
    endTime: '14:50',
    type: 'Individual session',
    fee: 1400,
    currency: 'ETB',
    status: 'COMPLETED',
    sessionId: 'session_02_completed',
    notes: 'Follow-up on mindfulness exercises'
  });

  // 9. Audit Logs
  await db.insert('auditLogs', {
    id: 'audit_01',
    actorId: superAdmin.id,
    actorEmail: superAdmin.email,
    actorRole: 'SUPER_ADMIN',
    action: 'SYSTEM_INITIALIZATION',
    resource: 'DATABASE',
    details: 'System seeded with ETB packages, Admin Registered and Applied therapist workflows, and Sub Admin permission governance.',
    timestamp: new Date().toISOString()
  });

  // 10. Platform Settings
  await db.updateSettings({
    platformName: 'Amakari Psychotherapy',
    sessionDurationMinutes: 50,
    cancellationBufferHours: 24,
    defaultCurrency: 'ETB',
    videoProvider: 'Native WebRTC Mesh / P2P with Secure Signaling',
    maintenanceMode: false,
    requireTherapistVerification: true
  });

  console.log('Database seeded with full Ethiopian Birr (ETB) packages, multi-month pricing, and Sub Admin permission status workflow.');
}
