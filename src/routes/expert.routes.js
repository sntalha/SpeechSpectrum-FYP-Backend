import { Router } from 'express';
import Expert from '../controllers/expert.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.get('/', Expert.getAllExperts);

export default router;
