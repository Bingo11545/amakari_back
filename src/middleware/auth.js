import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../database/db.js';

export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'No authentication token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    const user = db.findById('users', decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User account no longer exists.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Forbidden', message: 'User account has been disabled.' });
    }

    // Attach therapist profile id if applicable
    if (user.role === 'THERAPIST') {
      const therapistProfile = db.findOne('therapists', (t) => t.userId === user.id);
      if (therapistProfile) {
        user.therapistId = therapistProfile.id;
        user.therapistStatus = therapistProfile.status;
      }
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Session token has expired.' });
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid authentication token.' });
  }
}
