import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import JSZip from "jszip";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ANDROID_PROJECT_DIR = path.resolve(__dirname, "android-studio-project");

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function collectFilesRecursively(dirPath: string, baseDir: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".gradle" || entry.name === "build" || entry.name === ".idea") {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
    }
  }
  return files.sort();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timezone: "Asia/Dhaka" });
  });

  // Optional Gemini Smart Productivity Coach (receives ONLY aggregated metrics, never raw GPS coordinates)
  app.post("/api/coach/analyze", async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "GEMINI_API_KEY is not configured in environment secrets.",
      });
      return;
    }

    const { language, summary } = req.body ?? {};
    if (!summary || typeof summary !== "object") {
      res.status(400).json({ error: "Aggregated summary payload is required." });
      return;
    }

    const langLabel = language === "en" ? "English" : "Bengali (bn-BD)";
    const sanitizedSummary = {
      periodDaysAnalyzed: Number(summary.periodDaysAnalyzed ?? 0),
      totalShopHours: Number(summary.totalShopHours ?? 0),
      totalBusinessOutsideHours: Number(summary.totalBusinessOutsideHours ?? 0),
      totalPersonalOutsideHours: Number(summary.totalPersonalOutsideHours ?? 0),
      dailyTargetHours: Number(summary.dailyTargetHours ?? 0),
      goalAchievementRatePct: Number(summary.goalAchievementRatePct ?? 0),
      avgArrivalDelayMinutes: Number(summary.avgArrivalDelayMinutes ?? 0),
      exitCount: Number(summary.exitCount ?? 0),
      revenuePerHourBdt: Number(summary.revenuePerHourBdt ?? 0),
      profitPerHourBdt: Number(summary.profitPerHourBdt ?? 0),
      currentStreakDays: Number(summary.currentStreakDays ?? 0),
      topLeakageReasons: Array.isArray(summary.topLeakageReasons)
        ? summary.topLeakageReasons.slice(0, 5)
        : [],
    };

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Analyze this shop owner's aggregated time & business productivity metrics and respond strictly in ${langLabel}.
Metrics: ${JSON.stringify(sanitizedSummary)}
Rules:
1. Never invent statistics not present in the metrics.
2. Clearly separate factual observations from practical habit suggestions.
3. Keep tone encouraging, practical, respectful, and concise.
4. Suggest 1 realistic weekly challenge and 2 concrete habit adjustments.`,
        config: {
          systemInstruction:
            "You are a practical business productivity coach for a retail/shop owner in Bangladesh (BDT currency, Asia/Dhaka schedule). Never fabricate numbers or mention raw GPS coordinates.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              observations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Factual observations grounded strictly in the provided metrics.",
              },
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Practical, non-judgmental habit improvement suggestions.",
              },
              weeklyChallenge: {
                type: Type.STRING,
                description: "One concrete achievable challenge for the next 7 days.",
              },
            },
            required: ["observations", "suggestions", "weeklyChallenge"],
          },
        },
      });

      const raw = (response.text ?? "{}").trim();
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate coaching analysis";
      res.status(502).json({ error: message });
    }
  });

  // Android Studio Project Explorer API
  app.get("/api/android-project/tree", (_req, res) => {
    const files = collectFilesRecursively(ANDROID_PROJECT_DIR, ANDROID_PROJECT_DIR);
    res.json({ files });
  });

  app.get("/api/android-project/file", (req, res) => {
    const relPath = typeof req.query.path === "string" ? req.query.path : "";
    if (!relPath || relPath.includes("..")) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    const targetPath = path.resolve(ANDROID_PROJECT_DIR, relPath);
    if (!targetPath.startsWith(ANDROID_PROJECT_DIR) || !fs.existsSync(targetPath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const content = fs.readFileSync(targetPath, "utf-8");
    res.json({ path: relPath, content });
  });

  app.get("/api/android-project/download", async (_req, res) => {
    if (!fs.existsSync(ANDROID_PROJECT_DIR)) {
      res.status(404).json({ error: "Android project source directory not found." });
      return;
    }
    const files = collectFilesRecursively(ANDROID_PROJECT_DIR, ANDROID_PROJECT_DIR);
    const zip = new JSZip();
    for (const rel of files) {
      const abs = path.join(ANDROID_PROJECT_DIR, rel);
      zip.file(`ShopTimeMaster/${rel}`, fs.readFileSync(abs));
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="ShopTimeMaster-AndroidStudio.zip"');
    res.send(buffer);
  });

  const getApkPath = () => {
    const namedApk = path.join(
      ANDROID_PROJECT_DIR,
      "app/build/outputs/apk/debug/SHOP-TIME-MASTER-v1.0.0-debug.apk"
    );
    if (fs.existsSync(namedApk)) return namedApk;
    const defaultApk = path.join(
      ANDROID_PROJECT_DIR,
      "app/build/outputs/apk/debug/app-debug.apk"
    );
    if (fs.existsSync(defaultApk)) return defaultApk;
    return null;
  };

  app.get("/api/android-project/apk-info", (_req, res) => {
    const apkPath = getApkPath();
    if (!apkPath) {
      res.json({
        available: false,
        sizeBytes: 0,
        filename: "SHOP-TIME-MASTER-v1.0.0-debug.apk",
      });
      return;
    }
    const stat = fs.statSync(apkPath);
    res.json({
      available: stat.size > 0,
      sizeBytes: stat.size,
      filename: "SHOP-TIME-MASTER-v1.0.0-debug.apk",
    });
  });

  app.get("/api/android-project/apk", (_req, res) => {
    const apkPath = getApkPath();
    if (!apkPath) {
      res.status(404).json({ error: "APK has not been built yet." });
      return;
    }
    const stat = fs.statSync(apkPath);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="SHOP-TIME-MASTER-v1.0.0-debug.apk"'
    );
    res.setHeader("Content-Length", String(stat.size));
    fs.createReadStream(apkPath).pipe(res);
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SHOP TIME MASTER server listening on http://localhost:${PORT}`);
  });
}

startServer();
