import { Router } from 'express';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.get('/', (req, res) => {
	return res.status(410).json({
		success: false,
		message: 'Feedback endpoint is deprecated. Use appointment records endpoints instead.'
	});
});

export default router;
