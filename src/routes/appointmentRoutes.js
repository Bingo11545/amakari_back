import express from 'express';
import {
  cancelAppointment,
  createAppointment,
  getAppointmentById,
  getMyAppointments
} from '../controllers/appointmentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, createAppointment);
router.get('/', authenticate, getMyAppointments);
router.get('/:id', authenticate, getAppointmentById);
router.put('/:id/cancel', authenticate, cancelAppointment);

export default router;
