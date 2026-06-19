import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadVideoToCloudinary = (filePath, filename) => {
  return new Promise((resolve, reject) => {
    

    console.log("🟢 Came for the upload in cloudinaryService.js");

    const cloudinaryUpload = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "reco-d",
        public_id: filename,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        console.log("🟢 Video uploaded to Cloudinary:", result.secure_url);
        resolve(result);
      }
    );

    fs.createReadStream(filePath).pipe(cloudinaryUpload);
  });
};