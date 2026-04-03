import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { GoogleGenAI } from "@google/genai";
import express from "express";

// 1. Inisialisasi Gemini (The Brain)
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY! });
const model = "gemini-3-flash-preview";

// 2. Buat MCP Server (The Translator)
const server = new McpServer({
  name: "SafeGuard-Intelligence",
  version: "1.0.0",
});

// 3. Daftarkan "Superpower" (Tool) SafeGuard
server.tool(
  "analyze_psychosocial_risk",
  {
    patient_fhir_data: { type: "string", description: "Data FHIR pasien dari Prompt Opinion" },
    assessment_scores: { type: "string", description: "Skor DASS-21 atau SRQ-20" }
  },
  async ({ patient_fhir_data, assessment_scores }) => {
    // Panggil Gemini untuk analisis
    const response = await ai.models.generateContent({
      model: model,
      contents: `Analisis risiko psikososial pasien berdasarkan data FHIR: ${patient_fhir_data} 
                dan skor asesmen: ${assessment_scores}. 
                Berikan output: Tingkat Risiko (L0-L3), Kode ICD-10 yang relevan, dan Rekomendasi Klinis.`
    });

    return {
      content: [{ type: "text", text: response.text }]
    };
  }
);

// 4. Jalankan Server via HTTP (SSE) agar bisa diakses Prompt Opinion
const app = express();
let transport: SSEServerTransport;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  await transport.handlePostMessage(req, res);
});

app.listen(3001, () => {
  console.log("SafeGuard MCP Server running on port 3001");
});