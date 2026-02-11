import { Router } from 'express';
import Link from '../controllers/link.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.post('/create', Link.createLink);
router.get('/parent', Link.getParentLinks);
router.get('/expert', Link.getExpertLinks);

export default router;
