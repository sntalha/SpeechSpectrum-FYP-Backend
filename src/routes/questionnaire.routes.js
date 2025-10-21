import { Router } from "express";
import QuestionnaireSubmission from "../controllers/questionnaire.controller.js";
import { verifyToken } from "../middlewares/auth-middleware.js";

const router = Router();

// All routes require authentication
router.use(verifyToken);

// CRUD operations for questionnaire submissions
router.post('/', QuestionnaireSubmission.createSubmission);
router.get('/', QuestionnaireSubmission.getSubmissions);
router.get('/:submission_id', QuestionnaireSubmission.getSubmission);
router.put('/:submission_id', QuestionnaireSubmission.updateSubmission);
router.delete('/:submission_id', QuestionnaireSubmission.deleteSubmission);

export default router;