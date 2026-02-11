import { Router } from 'express';
import Appointment from '../controllers/appointment.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.get('/parent', Appointment.getParentFeedback);

export default router;
