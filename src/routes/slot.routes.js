import { Router } from 'express';
import Slot from '../controllers/slot.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

router.post('/slots', Slot.createSlot);
router.get('/slots/my', Slot.getMySlots);
router.get('/slots/expert/:expertId', Slot.getSlotsByExpert);
router.put('/slots/:slotId', Slot.updateSlot);
router.delete('/slots/:slotId', Slot.deleteSlot);
router.get('/slots', Slot.getAllSlots);

export default router;
