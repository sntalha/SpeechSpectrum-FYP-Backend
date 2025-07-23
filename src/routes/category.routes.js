import { Router } from "express";
import Category from "../controllers/category.controller.js";
import {authMiddleware,checkAdmin} from "../middlewares/auth-middleware.js"
import upload from "../middlewares/multer-middleware.js";

const router = Router();

router.post('/create', authMiddleware, checkAdmin, upload.single("image"), Category.create);
router.get('/get-all', Category.getAll);
router.delete('/delete/:id', authMiddleware, checkAdmin, Category.delete);
router.put('/update/:id', authMiddleware, checkAdmin, upload.single("image"), Category.update);

export default router;