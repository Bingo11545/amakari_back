import express from 'express';
import { getMyPackages, getPackages, purchasePackage } from '../controllers/packageController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getPackages);
router.post('/purchase', authenticate, purchasePackage);
router.get('/my-packages', authenticate, getMyPackages);

export default router;
