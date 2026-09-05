import { Router } from 'express';
import { slackController } from '../controllers/slack.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Connect and callback need special handling — connect requires auth, callback does not (redirect from Slack)
router.get('/connect', authMiddleware, slackController.connect);
router.get('/callback', slackController.callback); // No auth — this is a redirect from Slack
router.post('/disconnect', authMiddleware, slackController.disconnect);
router.get('/status', authMiddleware, slackController.status);

export default router;
