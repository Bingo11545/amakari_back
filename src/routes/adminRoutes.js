import express from 'express';
import {
  activatePermission,
  approveTherapist,
  createAdminPackage,
  createSubAdmin,
  createUser,
  deleteAdminPackage,
  deleteSubAdmin,
  deleteUser,
  disablePermission,
  getAdminPackages,
  getAdminTherapists,
  getAnalytics,
  getAuditLogs,
  getPayments,
  getReports,
  getSettings,
  getSubAdmins,
  getUsers,
  registerTherapistDirectly,
  rejectTherapist,
  removePermission,
  toggleDisableSubAdmin,
  updateAdminPackage,
  updateAdminTherapist,
  updateSettings,
  updateSubAdmin,
  updateUser
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRoles } from '../middleware/authorize.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Require at least administrative role
router.use(authenticate, requireRoles('SUPER_ADMIN', 'SUB_ADMIN'));

// --- User Management ---
router.get('/users', requirePermission('USER_VIEW'), getUsers);
router.post('/users', requirePermission('USER_CREATE'), createUser);
router.put('/users/:id', requirePermission('USER_UPDATE'), updateUser);
router.delete('/users/:id', requirePermission('USER_DELETE'), deleteUser);

// --- Therapist Management ---
router.get('/therapists', requirePermission('THERAPIST_VIEW'), getAdminTherapists);
router.post('/therapists/direct', requireRoles('SUPER_ADMIN'), registerTherapistDirectly);
router.put('/therapists/:id', requirePermission('THERAPIST_UPDATE'), updateAdminTherapist);
router.post('/therapists/:id/approve', requirePermission('THERAPIST_APPROVE'), approveTherapist);
router.post('/therapists/:id/reject', requirePermission('THERAPIST_REJECT'), rejectTherapist);

// --- Sub Admin & Permission Governance (SUPER_ADMIN ONLY) ---
router.get('/sub-admins', requireRoles('SUPER_ADMIN'), getSubAdmins);
router.post('/sub-admins', requireRoles('SUPER_ADMIN'), createSubAdmin);
router.put('/sub-admins/:id', requireRoles('SUPER_ADMIN'), updateSubAdmin);
router.post('/permissions/activate', requireRoles('SUPER_ADMIN'), activatePermission);
router.post('/permissions/disable', requireRoles('SUPER_ADMIN'), disablePermission);
router.post('/permissions/remove', requireRoles('SUPER_ADMIN'), removePermission);
router.put('/sub-admins/:id/toggle', requireRoles('SUPER_ADMIN'), toggleDisableSubAdmin);
router.delete('/sub-admins/:id', requireRoles('SUPER_ADMIN'), deleteSubAdmin);

// --- Therapy Packages Management ---
router.get('/packages', requirePermission('PACKAGE_VIEW'), getAdminPackages);
router.post('/packages', requirePermission('PACKAGE_MANAGE'), createAdminPackage);
router.put('/packages/:id', requirePermission('PACKAGE_MANAGE'), updateAdminPackage);
router.delete('/packages/:id', requirePermission('PACKAGE_MANAGE'), deleteAdminPackage);

// --- Payments & Platform Revenue ---
router.get('/payments', requirePermission('PAYMENT_VIEW'), getPayments);

// --- Analytics & Reports ---
router.get('/analytics', requirePermission('ANALYTICS_VIEW'), getAnalytics);
router.get('/reports', requirePermission('REPORT_VIEW'), getReports);

// --- Platform Settings (SUPER_ADMIN ONLY) ---
router.get('/settings', requireRoles('SUPER_ADMIN'), getSettings);
router.put('/settings', requireRoles('SUPER_ADMIN'), updateSettings);

// --- Audit Logs ---
router.get('/audit-logs', requirePermission('AUDIT_LOG_VIEW'), getAuditLogs);

export default router;
