import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors";
import { z } from "zod";

(res as any).flushHeaders?.();

const app = express();
app.use(cors());
app.use(express.json());

// 1. Inisialisasi Gemini dengan aman (Anti-Crash)
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("⚠️ WARNING: GEMINI_API_KEY is missing in Environment Variables!");
}
const ai = new GoogleGenAI({ apiKey: apiKey || "dummy_key" });

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
      if (!apiKey || apiKey === "dummy_key") {
        throw new Error("API Key Gemini belum diset di server.");
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analisis risiko psikososial pasien: ${patient_fhir_data} dengan skor: ${assessment_scores}. Berikan output Tingkat Risiko (L0-L3) dan Rekomendasi.`
      });
      
      return { 
        content: [{ type: "text", text: response.text || "AI tidak memberikan respon." }] 
      };
    } catch (err) {
      console.error("Tool Error:", err);
      return { 
        content: [{ type: "text", text: "Error: " + (err instanceof Error ? err.message : String(err)) }], 
        isError: true 
      };
    }
  }
);

// 3. SSE Transport Management
let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  console.log("--- New SSE Connection Attempt ---");
  
  // Proteksi untuk browser biasa / Health Check Render
  if (!req.headers.accept?.includes('text/event-stream')) {
    return res.send("SafeGuard MCP SSE is Active. Connect via Prompt Opinion.");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  transport = new SSEServerTransport("/messages", res);
  
  try {
    await server.connect(transport);
    console.log("✅ MCP Server connected to SSE");
  } catch (error) {
    console.error("❌ Failed to connect MCP server:", error);
  }

  req.on("close", () => {
    console.log("Connection Closed");
    transport = null;
  });
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active session.");
  }
});

app.get("/", (req, res) => {
  res.send("<h1>SafeGuard MCP Online</h1><p>Status: Ready</p>");
});

// PENTING: Gunakan process.env.PORT agar Render bisa mendeteksi portnya
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});