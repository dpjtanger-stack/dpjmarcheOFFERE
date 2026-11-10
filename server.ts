import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Standalone Windows Executable Installer (.EXE) download route
  app.get(["/download-setup", "/FinAudit_Justice_Setup.exe"], (req, res) => {
    const setupExe = path.join(process.cwd(), "dist-electron", "FinAudit_Justice_Setup.exe");
    if (fs.existsSync(setupExe)) {
      res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
      res.setHeader('Content-Disposition', 'attachment; filename="FinAudit_Justice_Setup.exe"');
      res.setHeader('Transfer-Encoding', 'chunked');
      fs.createReadStream(setupExe).pipe(res);
    } else {
      res.status(404).send("ملف تثبيت البرنامج (FinAudit_Justice_Setup.exe) قيد التجهيز، يرجى الانتظار لحظات.");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
