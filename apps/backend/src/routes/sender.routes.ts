import { Router } from 'express';
import { senderController } from '../controllers/sender.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', senderController.list);
router.post('/', senderController.create);
router.put('/:id', senderController.update);
router.delete('/:id', senderController.delete);

export default router;
