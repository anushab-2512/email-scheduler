import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);
router.get('/demo-login', authController.demoLogin);
router.get('/me', authMiddleware, authController.me);
router.post('/logout', authController.logout);

export default router;
