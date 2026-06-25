import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import fs from "fs";
import http from "http";
import dotenv from "dotenv";
import { Readable } from "stream";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

import { uploadVideoToCloudinary } from "./services/cloudinaryService.js";
import { processAITranscription } from "./services/geminiService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e8, 
  pingTimeout: 60000,     
  pingInterval: 25000,
});

const uploadDir = path.join(__dirname, "temp_upload");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);
  socket.emit("connected");
  
  let isProcessing = false;

  socket.on("video-chunks", async (data) => {
    try {
      console.log("🟢 Receiving video chunk for:", data.filename);

      const filePath = path.join(uploadDir, data.filename);
      const writeStream = fs.createWriteStream(filePath, { flags: "a" });

      const buffer = Buffer.from(data.chunks);
      const readStream = Readable.from(buffer);

      readStream.pipe(writeStream);

      writeStream.on("finish", () => {
        console.log("🟢 Chunk saved for:", data.filename);
      });

      writeStream.on("error", (error) => {
        console.error("🔴 Error saving chunk:", error);
        socket.emit("upload-error", { message: "Failed to save video chunk" });
      });
    } catch (error) {
      console.error("🔴 Error processing video chunk:", error);
      socket.emit("upload-error", { message: "Failed to process video chunk" });
    }
  });

  socket.on("process-video", async (data) => {
    if (!socket.connected) {
      console.warn("🟡 Aborted processing: Socket is already disconnected.");
      return;
    }

    const filePath = path.join(uploadDir, data.filename);

    try {
      isProcessing = true;
      console.log("🟢 Processing video:", data.filename);

      console.log("🟢 Came on File Check");
      if (!fs.existsSync(filePath)) {
        throw new Error("Video file not found");
      }

      console.log("🟢 Came on processing");
      const processing = await axios.post(
        `${process.env.NEXT_API_HOST}recording/${data.userId}/processing`,
        { filename: data.filename }
      );

      if (processing.status !== 200) {
        throw new Error("Failed to create processing file");
      }

      const uploadResult = await uploadVideoToCloudinary(filePath, data.filename);
      const cloudinaryUrl = uploadResult.secure_url;

      if (processing.data.plan === "PRO") {
        // ISOLATED TRY-CATCH FOR AI
        try {
          const aiResult = await processAITranscription(filePath);
          
          if (aiResult) {
            const titleAndSummaryGenerated = await axios.post(
              `${process.env.NEXT_API_HOST}recording/${data.userId}/transcribe`,
              {
                filename: data.filename,
                content: aiResult.content,
                transcript: aiResult.transcript,
              }
            );

            if (titleAndSummaryGenerated.status !== 200) {
              console.log("🔴 Error : Something Went Wrong with transcription title and description");
            }
          }
        } catch (aiError) {
          console.error("🔴 AI Processing failed, but proceeding to save video:", aiError.message);
          // Optional: Emit a warning to the client that AI failed but video is safe
          if (socket.connected) {
            socket.emit("ai-processing-error", { message: "Video saved, but AI summary failed." });
          }
        }
      }

      // THIS WILL NOW RUN EVEN IF AI FAILS
      const stopProcessing = await axios.post(
        `${process.env.NEXT_API_HOST}recording/${data.userId}/complete`,
        { 
          filename: data.filename,
          videoUrl: cloudinaryUrl,
         }
      );

      if (stopProcessing.status !== 200) {
        throw new Error("Failed to complete processing");
      }

    } catch (error) {
      console.error("🔴 Error processing video:", error);
      if (socket.connected) {
        socket.emit("processing-error", { message: "Failed to complete processing" });
      }
    } finally {
      isProcessing = false;
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error("🔴 Error deleting file:", err);
          } else {
            console.log("🟢 Deleted file:", data.filename);
          }
        });
      }
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔴 Socket disconnected: ${socket.id} due to ${reason}`);
    if (isProcessing) {
      console.warn("🟡 Socket disconnected mid-processing. Cleaning up resource allocation...");
    }
  });
});

process.on("unhandledRejection", (error) => {
  console.error("🔴 Unhandled Rejection:", error);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🟢 Server listening on port ${PORT}`);
});