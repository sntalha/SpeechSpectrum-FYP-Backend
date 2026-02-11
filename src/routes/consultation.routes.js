import { Router } from 'express';
import Consultation from '../controllers/consultation.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.post('/request', Consultation.requestConsultation);
router.post('/respond', Consultation.respondConsultation);

export default router;
