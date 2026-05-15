// Hunt — zero-dependency static server for the public/ frontend.
// Serves public/ as document root and exposes /deployments/*.json from the repo
// root so the on-chain-reading pages can fetch the Hunt contract artifact.
// Run: `npm run dev` (port 3000 by default, override with PORT env var).

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function resolveTarget(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  if (clean === "/" || clean === "") return path.join(PUBLIC_DIR, "index.html");
  if (clean.startsWith("/deployments/")) {
    const rel = clean.slice("/deployments/".length);
    const abs = path.join(DEPLOYMENTS_DIR, rel);
    if (!abs.startsWith(DEPLOYMENTS_DIR + path.sep) && abs !== DEPLOYMENTS_DIR)
      return null;
    return abs;
  }
  const abs = path.join(PUBLIC_DIR, clean);
  if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== PUBLIC_DIR) return null;
  return abs;
}

const server = http.createServer(async (req, res) => {
  // /api/* is the public read-only protocol API (see bin/api.js).
  const urlPath = (req.url || "").split("?")[0].split("#")[0];
  if (urlPath.startsWith("/api")) {
    if (handleApi(req, res)) return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain" });
    res.end("method not allowed");
    return;
  }
  const target = resolveTarget(req.url || "/");
  if (!target) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("bad path");
    return;
  }
  try {
    let filePath = target;
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && stat.isDirectory())
      filePath = path.join(filePath, "index.html");
    const body = await fs.readFile(filePath);
    const type =
      MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "content-length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`[hunt] static server on http://localhost:${PORT}`);
  console.log(`[hunt] serving ${PUBLIC_DIR} + /deployments/*.json`);
});
