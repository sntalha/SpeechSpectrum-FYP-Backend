import { Router } from 'express';
import Appointment from '../controllers/appointment.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.post('/generate-zoom-link', Appointment.generateZoomLink);
router.post('/create', Appointment.createAppointment);
router.get('/parent', Appointment.getParentAppointments);
router.get('/expert', Appointment.getExpertAppointments);
router.post('/:id/notes', Appointment.addAppointmentNotes);
router.get('/:id/details', Appointment.getAppointmentDetails);
router.post('/:id/feedback', Appointment.addFeedback);

export default router;
