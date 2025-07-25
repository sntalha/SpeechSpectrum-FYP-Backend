import express from 'express';
import { authMiddleware, checkAdmin } from '../middlewares/auth-middleware.js';
import Orders from '../controllers/order.controller.js';

const router = express.Router();

router.post("/create", authMiddleware, Orders.create);
router.post("/handleStatus", authMiddleware, checkAdmin, Orders.handleStatusByAdmin)
router.get("/getOrders", authMiddleware, Orders.getOrders)

export default router