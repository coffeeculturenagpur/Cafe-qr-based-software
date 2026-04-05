const http = require("http");
const https = require("https");
const { URL } = require("url");
const QRCode = require("qrcode");
const sharp = require("sharp");
const Cafe = require("../models/Cafe");
const { signTableToken, verifyTableToken } = require("../utils/tableToken");
const { upsertSessionState, getSessionStoreMode } = require("../services/sessionStore");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function bufferFromDataUrl(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = dataUrl.slice(0, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);
  if (meta.includes(";base64")) {
    return Buffer.from(data, "base64");
  }
  return Buffer.from(data, "utf8");
}

function fetchImageBuffer(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    if (url.startsWith("data:")) {
      return resolve(bufferFromDataUrl(url));
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return resolve(null);
    }

    const client = parsed.protocol === "https:" ? https : http;
    const req = client.get(parsed, { headers: { "User-Agent": "QRDine-QR" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchImageBuffer(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });

    req.on("error", () => resolve(null));
  });
}

exports.tableQr = async (req, res) => {
  try {
    const { cafeId, tableNumber, size, baseUrl } = req.query;
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    const num = Number(tableNumber);
    if (!num || num < 1) return res.status(400).json({ message: "tableNumber must be >= 1" });

    const cafe = await Cafe.findById(cafeId).lean();
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    const qrSize = clamp(Number(size || 260), 120, 1024);
    const origin = String(baseUrl || req.get("origin") || process.env.CUSTOMER_BASE_URL || "").trim();
    if (!origin) return res.status(400).json({ message: "baseUrl is required" });
    const token = signTableToken(cafeId, num);
    const tableUrl = `${origin.replace(/\/$/, "")}/${cafeId}?table=${num}&t=${token}`;

    const qrBuffer = await QRCode.toBuffer(tableUrl, {
      type: "png",
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: "H",
    });

    let output = qrBuffer;
    if (cafe.logoUrl) {
      const logoBuffer = await fetchImageBuffer(cafe.logoUrl);
      if (logoBuffer) {
        const logoSize = Math.round(qrSize * 0.22);
        const logoBgSize = Math.round(qrSize * 0.28);

        const logo = await sharp(logoBuffer)
          .resize(logoSize, logoSize, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 0 },
          })
          .png()
          .toBuffer();

        const logoBg = await sharp({
          create: {
            width: logoBgSize,
            height: logoBgSize,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .png()
          .toBuffer();

        const leftBg = Math.round((qrSize - logoBgSize) / 2);
        const topBg = leftBg;
        const leftLogo = Math.round((qrSize - logoSize) / 2);
        const topLogo = leftLogo;

        output = await sharp(qrBuffer)
          .composite([
            { input: logoBg, left: leftBg, top: topBg },
            { input: logo, left: leftLogo, top: topLogo },
          ])
          .png()
          .toBuffer();
      }
    }

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600");
    return res.send(output);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.verifyTableToken = async (req, res) => {
  try {
    const { cafeId, tableNumber, t } = req.query;
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    const num = Number(tableNumber);
    if (!num || num < 1) return res.status(400).json({ message: "tableNumber must be >= 1" });
    if (!t) return res.status(400).json({ message: "table token is required" });

    const ok = verifyTableToken(cafeId, num, t);
    if (!ok) return res.status(400).json({ message: "Invalid table token" });

    await upsertSessionState({
      sessionId: req.sessionId || "",
      cafeId,
      tableNumber: num,
    });

    return res.json({ valid: true, sessionStore: getSessionStoreMode() });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.tableToken = async (req, res) => {
  try {
    const { cafeId, tableNumber } = req.query;
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    const num = Number(tableNumber);
    if (!num || num < 1) return res.status(400).json({ message: "tableNumber must be >= 1" });

    const cafe = await Cafe.findById(cafeId).lean();
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    return res.json({ token: signTableToken(cafeId, num) });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};
