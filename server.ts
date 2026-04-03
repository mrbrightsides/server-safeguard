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

// Daftarkan Tool
server.tool(
  "analyze_psychosocial_risk",
  "Menganalisis risiko psikososial pasien",
  {
    patient_fhir_data: z.string().describe("Data FHIR pasien"),
    assessment_scores: z.string().describe("Skor DASS-21 atau SRQ-20")
  },
  async ({ patient_fhir_data, assessment_scores }) => {
    const response = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(
      `Analisis risiko psikososial pasien: ${patient_fhir_data} dengan skor: ${assessment_scores}`
    );
    return { content: [{ type: "text", text: response.response.text() }] };
  }
);

const app = express();
app.use(cors());
app.use(express.json());

// PENTING: Map untuk mengelola banyak sesi koneksi
const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  console.log("--- New Connection Request ---");
  
  // Buat transport baru untuk sesi ini
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  console.log(`Session Created: ${sessionId}`);

  // Hubungkan server ke transport ini
  await server.connect(transport);

  // Kirim heartbeat setiap 15 detik supaya Render nggak mutus koneksi
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  res.on("close", () => {
    console.log(`Session Closed: ${sessionId}`);
    clearInterval(keepAlive);
    transports.delete(sessionId);
  });
});

app.post("/messages", async (req, res) => {
  // Ambil sessionId dari query parameter yang dikirim Prompt Opinion
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    console.error(`Session not found: ${sessionId}`);
    res.status(400).send("Invalid Session ID");
  }
});

app.get("/", (req, res) => res.send("SafeGuard MCP is Ready!"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});