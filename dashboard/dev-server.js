#!/usr/bin/env node
// QAPi Dashboard – minimal static file dev server with API proxy
// Usage: node dev-server.js [port]
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT     = process.env.PORT || Number(process.argv[2]) || 8080;
const API_HOST = process.env.QAPI_API_HOST || "localhost";
const API_PORT = Number(process.env.QAPI_API_PORT) || 3000;
const ROOT     = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".txt":  "text/plain; charset=utf-8",
};

// Paths forwarded to the API server instead of served statically.
const PROXY_PREFIXES = ["/auth", "/v1", "/modules", "/metrics", "/audit", "/health"];

function shouldProxy(urlPath) {
  return PROXY_PREFIXES.some(
    (p) => urlPath === p || urlPath.startsWith(p + "/") || urlPath.startsWith(p + "?")
  );
}

/**
 * Forward request to the API server and pipe the response back.
 * Streaming – does not buffer the body.
 */
function proxyToApi(clientReq, clientRes) {
  const options = {
    hostname: API_HOST,
    port:     API_PORT,
    path:     clientReq.url,
    method:   clientReq.method,
    headers:  { ...clientReq.headers, host: `${API_HOST}:${API_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on("error", () => {
    clientRes.writeHead(502, { "Content-Type": "application/json" });
    clientRes.end(
      JSON.stringify({ error: `API server unreachable at ${API_HOST}:${API_PORT}`, code: "PROXY_ERROR" })
    );
  });

  clientReq.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  // Strip fragments; preserve query string for proxy
  const urlPath   = req.url.split("#")[0];
  const pathOnly  = urlPath.split("?")[0];

  // ── API proxy ──────────────────────────────────────────────────────────────
  if (shouldProxy(pathOnly)) {
    proxyToApi(req, res);
    return;
  }

  // ── Static file serving ────────────────────────────────────────────────────
  const relPath  = pathOnly === "/" ? "/index.html" : pathOnly;

  // Resolve to absolute path and prevent path traversal via path.relative
  const filePath = path.resolve(ROOT, "." + relPath);
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
      }
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[QAPi Dashboard] Serving at http://localhost:${PORT}`);
  console.log(`[QAPi Dashboard] Static files from: ${ROOT}`);
  console.log(`[QAPi Dashboard] API proxy → http://${API_HOST}:${API_PORT}  (${PROXY_PREFIXES.join(", ")})`);
});
