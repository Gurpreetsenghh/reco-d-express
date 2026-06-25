import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({});

const waitForFileProcessing = async (name) => {
  let file = await ai.files.getFile({ name });
  while (file.state === "PROCESSING") {
    console.log("⏳ Waiting for video processing on Gemini servers...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    file = await ai.files.getFile({ name });
  }
  if (file.state === "FAILED") {
    throw new Error("Video processing failed on Gemini servers.");
  }
  return file;
};

export const processAITranscription = async (filePath) => {
  let uploadedFile = null;

  try {
    await fs.promises.stat(filePath);

    console.log("🟢 Initiating Gemini processing...");

    uploadedFile = await ai.files.upload({ 
      file: filePath,
      mimeType: "video/webm" 
    });
    console.log(`🟢 File uploaded to Gemini: ${uploadedFile.uri}`);

    await waitForFileProcessing(uploadedFile.name);

    const prompt = `Process the speech in this media file.
1. Generate a complete and highly accurate transcript.
2. Based on the transcript, create a suitable title.
3. Based on the transcript, create a concise summary.
Return the output EXACTLY as a JSON object with the following keys: "title", "summary", and "transcript".`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          {
            fileData: {
              fileUri: uploadedFile.uri,
              mimeType: uploadedFile.mimeType
            }
          },
          {
            text: prompt
          }
        ]
      }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsedData = JSON.parse(response.text);
    console.log("🟢 Gemini processing complete.");

    return {
      transcript: parsedData.transcript,
      content: JSON.stringify({
        title: parsedData.title,
        summary: parsedData.summary,
      }),
    };

  } catch (error) {
    console.error("🔴 Gemini Processing Error:", error);
    throw error; 
  } finally {
    if (uploadedFile) {
      try {
        await ai.files.delete({ name: uploadedFile.name });
        console.log("🟢 Cleaned up file from Gemini File API.");
      } catch (cleanupError) {
        console.error("🟡 Failed to delete file from Gemini:", cleanupError.message);
      }
    }
  }
};