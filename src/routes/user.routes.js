import { Router } from "express";
import User from "../controllers/user.controller.js";
import { verifyToken } from "../middlewares/auth-middleware.js";

const router = Router();

// Public signup for parents and experts. To create admins pass `role: 'admin'` and an admin Authorization header.
router.post('/signup', User.signup);
router.post('/login', User.login);
router.post('/logout', verifyToken, User.logout);
router.get('/profile', verifyToken, User.getProfile);
router.get('/profile/:user_id', verifyToken, User.getProfile);
router.put('/profile', verifyToken, User.updateProfile);
router.put('/profile/:user_id', verifyToken, User.updateProfile);
router.delete('/profile', verifyToken, User.deleteProfile);
router.delete('/profile/:user_id', verifyToken, User.deleteProfile);

export default router;