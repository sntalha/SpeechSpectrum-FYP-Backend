import { Router } from 'express';
import Appointment from '../controllers/appointment.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.post('/appointments', Appointment.bookAppointment);
router.get('/appointments/my', Appointment.getMyAppointments);
router.get('/appointments/:appointmentId', Appointment.getAppointmentById);
router.patch('/appointments/:appointmentId/confirm', Appointment.confirmAppointment);
router.patch('/appointments/:appointmentId/complete', Appointment.completeAppointment);
router.patch('/appointments/:appointmentId/cancel', Appointment.cancelAppointment);
router.patch('/appointments/:appointmentId/no-show', Appointment.markNoShow);
router.get('/appointments', Appointment.getAllAppointments);
router.post('/appointments/generate-zoom-link', Appointment.generateZoomLink);

export default router;
