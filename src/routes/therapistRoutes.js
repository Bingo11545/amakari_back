import express from 'express';
import {
  getAllTherapists,
  getMyClients,
  getMyEarnings,
  getMyProfile,
  getTherapistById,
  updateAvailability,
  updateMyProfile
} from '../controllers/therapistController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRoles } from '../middleware/authorize.js';

const router = express.Router();

// Public / client accessible
router.get('/', getAllTherapists);

// Therapist private portal actions
router.get('/me', authenticate, requireRoles('THERAPIST'), getMyProfile);
router.put('/me', authenticate, requireRoles('THERAPIST'), updateMyProfile);
router.put('/availability', authenticate, requireRoles('THERAPIST'), updateAvailability);
router.get('/clients', authenticate, requireRoles('THERAPIST'), getMyClients);
router.get('/earnings', authenticate, requireRoles('THERAPIST'), getMyEarnings);

// Single therapist profile (public or admin)
router.get('/:id', getTherapistById);

export default router;
