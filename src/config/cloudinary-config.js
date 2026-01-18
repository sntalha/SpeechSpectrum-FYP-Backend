import { v2 as cloudinary } from "cloudinary";
import Constants from "../constant.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";

cloudinary.config({
  cloud_name: Constants.CLOUD_NAME,
  api_key: Constants.CLOUD_API_KEY,
  api_secret: Constants.CLOUD_API_SECRET,
});

/* Images */
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "FYP/images",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png"],
  },
});

/* Speech Recordings */
const speechRecordingStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "FYP/speech_recordings",
    resource_type: "video", // audio treated as video
    allowed_formats: ["wav", "mp3"],
  },
});

/* Documents */
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "FYP/documents",
    resource_type: "raw",
    allowed_formats: ["pdf", "doc", "docx"],
  },
});

export {
  cloudinary,
  imageStorage,
  speechRecordingStorage,
  documentStorage,
};