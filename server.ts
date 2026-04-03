import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors";
import { z } from "zod";

// 1. Inisialisasi Gemini
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

const server = new McpServer({
  name: "SafeGuard-Intelligence",
  version: "1.0.0",
});

// 2. Daftarkan Tool
server.tool(
  "analyze_psychosocial_risk",
  "Menganalisis risiko psikososial pasien",
  {
    patient_fhir_data: z.string().describe("Data FHIR pasien"),
    assessment_scores: z.string().describe("Skor DASS-21 atau SRQ-20")
  },
  async ({ patient_fhir_data, assessment_scores }) => {
    try {
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const response = await model.generateContent(
        `Analisis risiko psikososial pasien: ${patient_fhir_data} dengan skor: ${assessment_scores}. Berikan output Tingkat Risiko (L0-L3) dan Rekomendasi.`
      );
      return { content: [{ type: "text", text: response.response.text() }] };
    } catch (err) {
      return { content: [{ type: "text", text: "AI Error: " + String(err) }], isError: true };
    }
  }
);

const app = express();
app.use(cors());
app.use(express.json());

// Variabel global untuk menyimpan transport aktif
let activeTransport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  console.log("--- New SSE Connection ---");
  
  // Paksa header SSE agar tidak di-buffer oleh Render/Vercel
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  // Buat transport tanpa sessionId yang ribet
  activeTransport = new SSEServerTransport("/messages", res);
  
  await server.connect(activeTransport);

  req.on("close", () => {
    console.log("SSE Connection Closed");
    activeTransport = null;
  });
});

app.post("/messages", async (req, res) => {
  console.log("--- Received POST Message ---");
  
  if (activeTransport) {
    try {
      await activeTransport.handlePostMessage(req, res);
    } catch (err) {
      console.error("Error handling message:", err);
      res.status(500).send("Internal Error");
    }
  } else {
    console.error("No active transport found for POST");
    res.status(400).send("No active session. Please reconnect to /sse first.");
  }
});

app.get("/", (req, res) => res.send("SafeGuard MCP is Ready and Stable!"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});