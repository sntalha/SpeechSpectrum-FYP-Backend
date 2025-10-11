
import { Router } from 'express';
import Test from '../controllers/test.controller.js';

const router = Router();

router.post('/add', Test.addName);
router.get('/all', Test.getAll);

export default router;
