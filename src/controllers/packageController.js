import { db } from '../database/db.js';
import { logAudit } from '../services/auditService.js';

export async function getPackages(req, res) {
  try {
    const packages = db.find('therapyPackages', (p) => p.isActive !== false);
    return res.json({ packages });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve packages.' });
  }
}

export async function purchasePackage(req, res) {
  try {
    const { therapistId, packageId, durationMonths = 1, paymentMethod = 'TELEBIRR' } = req.body;
    const userId = req.user.id;

    if (!therapistId || !packageId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Therapist ID and Package ID are required for package purchase.'
      });
    }

    const therapist = db.findById('therapists', therapistId);
    if (!therapist) {
      return res.status(404).json({ error: 'Not Found', message: 'Therapist not found.' });
    }

    if (therapist.status !== 'APPROVED' && therapist.status !== 'verified') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot purchase packages for unapproved therapists.'
      });
    }

    const pkg = db.findById('therapyPackages', packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'Not Found', message: 'Selected therapy package not found.' });
    }

    const duration = Math.max(1, parseInt(durationMonths, 10) || 1);
    const totalAmount = pkg.basePrice * duration;
    const totalSessions = pkg.sessionsCount * duration;

    const now = new Date();
    const expireDate = new Date();
    expireDate.setMonth(now.getMonth() + duration);

    // 1. Create Payment record (Recorded under platform/Super Admin account)
    const payment = await db.insert('payments', {
      payment_id: `PAY-AMK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: userId,
      userName: req.user.name,
      therapist_id: therapist.id,
      therapistName: therapist.name,
      package_id: pkg.id,
      packageName: pkg.name,
      package_duration: duration,
      amount: totalAmount,
      currency: 'ETB',
      payment_method: paymentMethod,
      transaction_reference: `TXN-${paymentMethod}-${Date.now()}`,
      status: 'PAID', // Payment verified & confirmed
      created_at: now.toISOString(),
      paid_at: now.toISOString()
    });

    // 2. Activate UserPackage only upon payment confirmation
    const userPackage = await db.insert('userPackages', {
      userId,
      therapistId: therapist.id,
      packageId: pkg.id,
      packageName: pkg.name,
      durationMonths: duration,
      totalPrice: totalAmount,
      currency: 'ETB',
      startDate: now.toISOString().split('T')[0],
      expirationDate: expireDate.toISOString().split('T')[0],
      sessionsPurchased: totalSessions,
      sessionsUsed: 0,
      sessionsRemaining: totalSessions,
      paymentId: payment.id,
      paymentStatus: 'PAID',
      status: 'ACTIVE'
    });

    await logAudit(
      req,
      'PACKAGE_PURCHASED',
      'PAYMENT',
      `Client ${req.user.name} purchased ${pkg.name} (${duration} months, ${totalSessions} sessions) for ${totalAmount} ETB with therapist ${therapist.name}`
    );

    return res.status(201).json({
      message: 'Therapy package successfully purchased and activated.',
      payment,
      userPackage
    });
  } catch (err) {
    console.error('Package purchase error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to process package purchase.' });
  }
}

export async function getMyPackages(req, res) {
  try {
    const packages = db.find('userPackages', (up) => up.userId === req.user.id);
    const enriched = packages.map((up) => {
      const therapist = db.findById('therapists', up.therapistId);
      return {
        ...up,
        therapistName: therapist ? therapist.name : 'Assigned Clinician',
        therapistSpecialty: therapist ? therapist.specialty : ''
      };
    });
    return res.json({ userPackages: enriched });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: 'Failed to retrieve packages.' });
  }
}
