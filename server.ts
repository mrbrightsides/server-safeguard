import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import { z } from "zod"; // Tambahkan zod untuk validasi parameter

// 1. Inisialisasi Gemini (Gunakan process.env, bukan import.meta.env)
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is required");
}
const ai = new GoogleGenAI({ apiKey });
const modelName = "gemini-3-flash-preview";

// 2. Buat MCP Server
const server = new McpServer({
  name: "SafeGuard-Intelligence",
  version: "1.0.0",
});

// 3. Daftarkan Tool dengan Zod (Ini cara yang benar untuk SDK MCP terbaru)
server.tool(
  "analyze_psychosocial_risk",
  "Menganalisis risiko psikososial pasien berdasarkan data FHIR dan skor asesmen",
  {
    patient_fhir_data: z.string().describe("Data FHIR pasien dari Prompt Opinion"),
    assessment_scores: z.string().describe("Skor DASS-21 atau SRQ-20")
  },
  async ({ patient_fhir_data, assessment_scores }) => {
    try {
      const model = ai.models.generateContent({
        model: modelName,
        contents: `Analisis risiko psikososial pasien berdasarkan data FHIR: ${patient_fhir_data} 
                  dan skor asesmen: ${assessment_scores}. 
                  Berikan output: Tingkat Risiko (L0-L3), Kode ICD-10 yang relevan, dan Rekomendasi Klinis.`
      });

      const response = await model;

      return {
        content: [{ type: "text", text: response.text || "Gagal mendapatkan analisis dari AI." }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }
);

// 4. Jalankan Server via Express (SSE)
const app = express();
app.use(express.json());

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  console.log("New SSE connection established");
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE transport");
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SafeGuard MCP Server running on port ${PORT}`);
});