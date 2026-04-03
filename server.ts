import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors"; // Tambahkan ini
import { z } from "zod";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });
const modelName = "gemini-3-flash-preview";

const server = new McpServer({
  name: "SafeGuard-Intelligence",
  version: "1.0.0",
});

server.tool(
  "analyze_psychosocial_risk",
  "Menganalisis risiko psikososial pasien berdasarkan data FHIR dan skor asesmen",
  {
    patient_fhir_data: z.string().describe("Data FHIR pasien dari Prompt Opinion"),
    assessment_scores: z.string().describe("Skor DASS-21 atau SRQ-20")
  },
  async ({ patient_fhir_data, assessment_scores }) => {
    const model = ai.models.generateContent({
      model: modelName,
      contents: `Analisis risiko psikososial pasien berdasarkan data FHIR: ${patient_fhir_data} 
                dan skor asesmen: ${assessment_scores}. 
                Berikan output: Tingkat Risiko (L0-L3), Kode ICD-10 yang relevan, dan Rekomendasi Klinis.`
    });
    const response = await model;
    return {
      content: [{ type: "text", text: response.text || "Gagal" }]
    };
  }
);

const app = express();

// 1. AKTIFKAN CORS (PENTING BANGET!)
app.use(cors({
  origin: "*", // Izinkan semua origin untuk hackathon
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-mcp-version"]
}));

app.use(express.json());

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  console.log("--- New SSE Connection Attempt ---");
  
  // 2. SET HEADER MANUAL UNTUK SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Matikan buffering di Render/Nginx

  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
  
  req.on('close', () => {
    console.log("Connection closed");
    transport = null;
  });
});

app.post("/messages", async (req, res) => {
  console.log("Received message from Prompt Opinion");
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "No active SSE session" });
  }
});

// Tambahkan route root biar nggak "Cannot GET /"
app.get("/", (req, res) => {
  res.send("SafeGuard MCP Server is Online! Use /sse for connection.");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});