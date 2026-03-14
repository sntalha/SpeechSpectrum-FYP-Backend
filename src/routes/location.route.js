import { Router } from 'express';
import Location from '../controllers/location.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.post('/experts/locations', Location.addLocation);
router.get('/experts/locations', Location.getMyLocations);
router.put('/experts/locations/:locationId', Location.updateLocation);
router.delete('/experts/locations/:locationId', Location.deleteLocation);
router.get('/experts/:expertId/locations', Location.getExpertLocations);

export default router;
