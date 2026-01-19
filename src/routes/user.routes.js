import { Router } from "express";
import User from "../controllers/user.controller.js";
import { supabaseClientMiddleware, supabaseAdminClientMiddleware } from "../middlewares/auth-middleware.js";

const router = Router();

// Public signup for parents and experts. To create admins pass `role: 'admin'` and an admin Authorization header.
router.post('/signup', supabaseAdminClientMiddleware, User.signup);
router.post('/login', supabaseAdminClientMiddleware, User.login);
router.post('/logout', supabaseClientMiddleware, User.logout);
router.get('/profile', supabaseClientMiddleware, User.getProfile);
router.get('/profile/:user_id', supabaseClientMiddleware, User.getProfile);
router.put('/profile', supabaseClientMiddleware, User.updateProfile);
router.put('/profile/:user_id', supabaseClientMiddleware, User.updateProfile);
router.delete('/profile', supabaseClientMiddleware, User.deleteProfile);
router.delete('/profile/:user_id', supabaseClientMiddleware, User.deleteProfile);

export default router;