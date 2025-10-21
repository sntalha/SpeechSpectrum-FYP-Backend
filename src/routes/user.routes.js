import { Router } from "express";
import User from "../controllers/user.controller.js";
import { verifyToken } from "../middlewares/auth-middleware.js";

const router = Router();

router.post('/signup', User.signup);
router.post('/login', User.login);
router.get('/profile', verifyToken, User.getProfile);
router.put('/profile', verifyToken, User.updateProfile);
router.delete('/profile', verifyToken, User.deleteProfile);

export default router;