import { Router } from "express";
import Speech from "../controllers/speech.controller.js";
import { supabaseClientMiddleware } from "../middlewares/auth-middleware.js";
import upload from "../middlewares/multer-middleware.js";

const router = Router();

// All routes require authentication
router.use(supabaseClientMiddleware);

router.post('/', upload.single('audio'), Speech.createSubmission);
router.get('/', Speech.getSubmissions);
router.get('/:submission_id', Speech.getSubmission);
router.delete('/:submission_id', Speech.deleteSubmission);

export default router;
