import multer from "multer";
import { speechRecordingStorage, imageStorage, documentStorage } from "../config/cloudinary-config.js";

/* Speech Recording Upload */
const speechUpload = multer({
  storage: speechRecordingStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
});

/* Image Upload */
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* Document Upload */
const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

export { speechUpload, imageUpload, documentUpload };