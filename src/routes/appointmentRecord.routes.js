import { Router } from 'express';
import AppointmentRecord from '../controllers/appointmentRecord.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.post('/appointments/:appointmentId/records', AppointmentRecord.createRecord);
router.get('/appointments/:appointmentId/records', AppointmentRecord.getRecord);
router.put('/appointments/:appointmentId/records/:recordId', AppointmentRecord.updateRecord);

export default router;
