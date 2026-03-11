#!/usr/bin/env node
// QAPi Dashboard – minimal static file dev server
// Usage: node dev-server.js [port]
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || Number(process.argv[2]) || 8080;
const ROOT = __dirname;

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

const server = http.createServer((req, res) => {
  // Normalise URL – strip query strings and fragments
  const urlPath = req.url.split("?")[0].split("#")[0];

  // Default to index.html for root
  const relPath = urlPath === "/" ? "/index.html" : urlPath;

  // Resolve to absolute path and prevent path traversal
  const filePath = path.resolve(ROOT, "." + relPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
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
  console.log(`[QAPi Dashboard] Serving files from: ${ROOT}`);
});
