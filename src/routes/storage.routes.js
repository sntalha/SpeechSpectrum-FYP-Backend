import { Router } from "express";
import Storage from "../controllers/storage.controller.js";
import { imageUpload, documentUpload } from "../middlewares/multer-middleware.js";

const router = Router();

// Image routes
router.post('/images', imageUpload.single('image'), Storage.uploadImage);
router.delete('/images', Storage.deleteImage);

// Document routes
router.post('/documents', documentUpload.single('document'), Storage.uploadDocument);
router.delete('/documents', Storage.deleteDocument);

export default router;
