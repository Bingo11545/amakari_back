import express from 'express';
import {
  endSession,
  getSessionById,
  joinSession,
  leaveSession
} from '../controllers/sessionController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Secure join: Authenticated User -> Role -> Permission -> Resource Ownership -> Allow / Deny
router.post('/:id/join', authenticate, joinSession);
router.post('/:id/leave', authenticate, leaveSession);
router.post('/:id/end', authenticate, endSession);
router.get('/:id', authenticate, getSessionById);

export default router;
