import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors";
import { z } from "zod";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

const server = new McpServer({
  name: "SafeGuard-Intelligence",
  version: "1.0.0",
});

server.tool(
  "analyze_psychosocial_risk",
  "Menganalisis risiko psikososial pasien",
  {
    patient_fhir_data: z.string().describe("Data FHIR pasien"),
    assessment_scores: z.string().describe("Skor DASS-21 atau SRQ-20")
  },
  async ({ patient_fhir_data, assessment_scores }) => {
    try {
      // PERBAIKAN: Gunakan ai.models.generateContent (Sintaks @google/genai)
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analisis risiko psikososial pasien: ${patient_fhir_data} dengan skor: ${assessment_scores}. Berikan output Tingkat Risiko (L0-L3) dan Rekomendasi.`
      });
      
      return { 
        content: [{ type: "text", text: response.text || "Gagal mendapatkan hasil." }] 
      };
    } catch (err) {
      return { 
        content: [{ type: "text", text: "AI Error: " + String(err) }], 
        isError: true 
      };
    }
  }
);

const app = express();
app.use(cors());
app.use(express.json());

let activeTransport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  console.log("--- New SSE Connection ---");
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  activeTransport = new SSEServerTransport("/messages", res);
  await server.connect(activeTransport);

  req.on("close", () => {
    activeTransport = null;
  });
});

app.post("/messages", async (req, res) => {
  if (activeTransport) {
    await activeTransport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active session.");
  }
});

app.get("/", (req, res) => res.send("SafeGuard MCP is Ready and Stable!"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});