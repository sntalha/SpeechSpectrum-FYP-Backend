import { v2 as cloudinary } from "cloudinary";
import Constants from "../constant.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";

cloudinary.config({
  cloud_name: Constants.CLOUD_NAME,
  api_key: Constants.CLOUD_API_KEY,
  api_secret: Constants.CLOUD_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "FYP_Speech_Recordings",
    resource_type: "video", 
    allowed_formats: ["wav", "mp3"], 
  },
});

export { cloudinary, storage };