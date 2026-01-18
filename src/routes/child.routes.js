import { Router } from "express";
import Child from "../controllers/child.controller.js";
import { supabaseClientMiddleware } from "../middlewares/auth-middleware.js";

const router = Router();

// All routes require authentication
router.use(supabaseClientMiddleware);

// CRUD operations for children
router.post('/', Child.createChild);
router.get('/', Child.getChildren);
router.get('/:child_id', Child.getChild);
router.put('/:child_id', Child.updateChild);
router.delete('/:child_id', Child.deleteChild);

export default router;