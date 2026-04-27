import { Router } from 'express';
import PaymentController from '../controllers/payment.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.post('/initiate', supabaseClientMiddleware, PaymentController.initiatePayment);
router.post('/verify', supabaseClientMiddleware, PaymentController.verifyPayment);
router.get('/status', supabaseClientMiddleware, PaymentController.getPaymentStatus);

export default router;
