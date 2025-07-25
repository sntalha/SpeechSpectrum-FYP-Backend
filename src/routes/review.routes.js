import express from 'express';
import { authMiddleware } from '../middlewares/auth-middleware.js';
import Review from '../controllers/review.controller.js';

const router = express.Router();

router.post("/create", authMiddleware, Review.create);
router.delete("/remove/:id", authMiddleware, Review.remove);
router.get("/product-reviews/:productId", Review.getProductRatings);

export default router;