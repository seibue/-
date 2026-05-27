const http = require("http");
const fs = require("fs");
const path = require("path");
const cardImageApi = require("./api/card-image.js");
const koreanCardApi = require("./api/korean-card.js");

const root = process.cwd();
const port = Number(process.env.PORT || 8787);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

http
  .createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    if (requestPath === "/api/korean-card") {
      koreanCardApi(request, response);
      return;
    }
    if (requestPath === "/api/card-image") {
      cardImageApi(request, response);
      return;
    }

    const safePath = requestPath === "/" ? "/index.html" : requestPath;
    const filePath = path.normalize(path.join(root, safePath));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      });
      response.end(data);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Preview server: http://127.0.0.1:${port}/`);
  });
