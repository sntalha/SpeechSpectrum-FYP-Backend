import { Router } from 'express';
import NotificationController from '../controllers/notification.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.post('/process-scheduled', NotificationController.processScheduled);

router.use(supabaseClientMiddleware);
router.post('/tokens/register', NotificationController.registerToken);
router.post('/tokens/unregister', NotificationController.unregisterToken);
router.put('/preferences', NotificationController.updatePreferences);
router.get('/', NotificationController.getMyNotifications);
router.patch('/:notification_id/read', NotificationController.markAsRead);
router.patch('/read-all', NotificationController.markAllAsRead);

export default router;
