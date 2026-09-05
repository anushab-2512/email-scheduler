import { Router } from 'express';
import multer from 'multer';
import { emailController } from '../controllers/email.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

router.use(authMiddleware);

router.post('/schedule', emailController.schedule);
router.post('/parse-csv', upload.single('file'), emailController.parseCsv);
router.get('/campaigns', emailController.getCampaigns);
router.get('/campaigns/:id', emailController.getCampaignById);
router.get('/recipients', emailController.getAllRecipients);
router.get('/events', emailController.events);
router.get('/scheduled', emailController.getScheduled);
router.get('/sent', emailController.getSent);
router.get('/search', emailController.search);
router.get('/:id', emailController.getById);
router.delete('/campaigns/:id', emailController.deleteCampaign);
router.delete('/:id', emailController.deleteCampaign);

export default router;
