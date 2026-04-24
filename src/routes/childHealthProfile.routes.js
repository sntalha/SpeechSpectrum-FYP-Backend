import { Router } from 'express';
import ChildHealthProfile from '../controllers/childHealthProfile.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';
import { documentUpload } from '../middlewares/multer-middleware.js';

const router = Router();

router.post('/health/:child_id', supabaseClientMiddleware, ChildHealthProfile.createOrUpdateProfile);
router.get('/health/:child_id', supabaseClientMiddleware, ChildHealthProfile.getProfile);
router.put('/health/:child_id', supabaseClientMiddleware, ChildHealthProfile.updateProfile);
router.delete('/health/:child_id', supabaseClientMiddleware, ChildHealthProfile.deleteProfile);
router.post('/health/:child_id/records', supabaseClientMiddleware, documentUpload.single('document'), ChildHealthProfile.addMedicalRecord);
router.delete('/health/:child_id/records/:document_id', supabaseClientMiddleware, ChildHealthProfile.deleteMedicalRecord);
router.put('/health/:child_id/records/:document_id', supabaseClientMiddleware, documentUpload.single('document'), ChildHealthProfile.replaceMedicalRecord);

export default router;
