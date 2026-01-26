import { Router } from "express";
import Admin from "../controllers/admin.controller.js";
import { supabaseClientMiddleware, supabaseAdminClientMiddleware } from "../middlewares/auth-middleware.js";

const router = Router();

// All admin routes require authentication
// GET endpoints (use regular middleware for auth)
router.get('/pending-requests', supabaseClientMiddleware, Admin.getPendingRequests);
router.get('/approved-experts', supabaseClientMiddleware, Admin.getApprovedExperts);
router.get('/rejected-experts', supabaseClientMiddleware, Admin.getRejectedExperts);
router.get('/approval-stats', supabaseClientMiddleware, Admin.getApprovalStats);
router.get('/expert-documents/:expert_id', supabaseClientMiddleware, Admin.getExpertDocuments);

// POST endpoints for approval/rejection (use admin middleware to bypass RLS)
router.post('/approve/:expert_id', supabaseAdminClientMiddleware, Admin.approveExpert);
router.post('/reject/:expert_id', supabaseAdminClientMiddleware, Admin.rejectExpert);

export default router;
