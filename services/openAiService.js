import OpenAI from "openai";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

export const processAITranscription = async (filePath) => {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, async (err, stat) => {
      if (err) {
        return reject(err);
      }

      if (stat.size >= 25000000) {
        console.log("🟡 File too large for Whisper API (>25MB). Skipping transcription.");
        return resolve(null);
      }

      try {
        // 1. Transcription
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: "whisper-1",
          response_format: "text",
        });

        if (!transcription) {
          return resolve(null);
        }
        console.log("🟢 Came for transcription");

        // 2. Summary & Title Generation
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are going to generate a title and a nice description using the speech to text transcription provided: transcription(${transcription})  
              and then return it in json format as {"title":<the title you gave>,"summary":<the summary you created>}`,
            },
          ],
        });

        console.log("🟢 Completion set hai", JSON.stringify(completion, null, 2));

        if (
          !completion ||
          !completion.choices ||
          completion.choices.length === 0 ||
          !completion.choices[0].message
        ) {
          console.error("🔴 Error: OpenAI API did not return a valid response.", completion);
          throw new Error("OpenAI API response is undefined or invalid.");
        }

        console.log("🟢 Completion is finally done");

        resolve({
          transcript: transcription,
          content: completion.choices[0].message.content,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
};