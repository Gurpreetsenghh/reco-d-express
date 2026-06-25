import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// The SDK automatically picks up process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({});

export const processAITranscription = async (filePath) => {
  let uploadedFile = null;

  try {
    // 1. Verify file exists
    await fs.promises.stat(filePath);

    console.log("🟢 Initiating Gemini processing...");

    // 2. Upload file to Gemini's File API 
    // This allows processing large audio/video files directly.
    uploadedFile = await ai.files.upload({ file: filePath });
    console.log(`🟢 File uploaded to Gemini: ${uploadedFile.uri}`);

    // 3. Define the prompt for the multimodal task
    const prompt = `Process the speech in this media file.
1. Generate a complete and highly accurate transcript.
2. Based on the transcript, create a suitable title.
3. Based on the transcript, create a concise summary.
Return the output EXACTLY as a JSON object with the following keys: "title", "summary", and "transcript".`;

    // 4. Generate transcript and summary in a single pass
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [uploadedFile, prompt],
      config: {
        // Enforce a strict JSON response
        responseMimeType: "application/json",
      },
    });

    const parsedData = JSON.parse(response.text);
    console.log("🟢 Gemini processing complete.");

    // 5. Map the output to match the exact shape server.js already expects
    return {
      transcript: parsedData.transcript,
      content: JSON.stringify({
        title: parsedData.title,
        summary: parsedData.summary,
      }),
    };

  } catch (error) {
    console.error("🔴 Gemini Processing Error:", error);
    throw error; // Let the caller handle the rejection
  } finally {
    // 6. Guarantee cleanup of the remote file to avoid hitting storage quotas
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