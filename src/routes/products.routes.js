import { Router } from "express";
import {authMiddleware,checkAdmin} from "../middlewares/auth-middleware.js"
import upload from "../middlewares/multer-middleware.js";
import Product from "../controllers/products.controller.js";

const router = Router();

router.post('/create', authMiddleware, checkAdmin, upload.array("images"), Product.create);
router.patch('/update/:id', authMiddleware, checkAdmin, upload.array("images"), Product.update);
router.get('/all', Product.getAll);
router.delete('/delete/:id', authMiddleware, checkAdmin, Product.delete);

export default router;