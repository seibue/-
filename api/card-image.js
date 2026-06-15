const https = require("https");

const ALLOWED_HOSTS = new Set(["digimoncard.com"]);
const API_VERSION = "20260616-digimoncardcom-image-proxy";

function sendText(response, statusCode, text) {
  if (typeof response.status === "function") {
    response.status(statusCode).send(text);
    return;
  }
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function imageUrlFromRequest(request) {
  const url = new URL(request.url || "", "http://localhost");
  const raw = request.query?.src || url.searchParams.get("src");
  if (!raw) return null;
  const imageUrl = new URL(raw);
  if (!isAllowedImageUrl(imageUrl)) return null;
  return imageUrl;
}

function isAllowedImageUrl(imageUrl) {
  return imageUrl.protocol === "https:" && ALLOWED_HOSTS.has(imageUrl.hostname);
}

function proxyImage(imageUrl, response, redirects = 0) {
  https
    .get(
      imageUrl,
      {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          Referer: "https://digimoncard.com/",
          "User-Agent": "Mozilla/5.0 (compatible; Jeonjeokmon/1.0; +https://jeonjeokmon.vercel.app/)",
        },
      },
      (upstream) => {
        if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location && redirects < 3) {
          const redirectedUrl = new URL(upstream.headers.location, imageUrl);
          upstream.resume();
          if (!isAllowedImageUrl(redirectedUrl)) {
            sendText(response, 400, `invalid image source ${API_VERSION}`);
            return;
          }
          proxyImage(redirectedUrl, response, redirects + 1);
          return;
        }

        if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
          upstream.resume();
          sendText(response, upstream.statusCode || 502, `image proxy failed ${API_VERSION}`);
          return;
        }

        const contentType = upstream.headers["content-type"] || "image/png";
        const headers = {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "s-maxage=604800, stale-while-revalidate=2592000",
          "Content-Type": contentType,
        };
        if (upstream.headers["content-length"]) headers["Content-Length"] = upstream.headers["content-length"];

        if (typeof response.status === "function") {
          response.status(200);
          Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
          upstream.pipe(response);
          return;
        }

        response.writeHead(200, headers);
        upstream.pipe(response);
      }
    )
    .on("error", () => {
      sendText(response, 502, `image proxy failed ${API_VERSION}`);
    });
}

function handler(request, response) {
  try {
    const imageUrl = imageUrlFromRequest(request);
    if (!imageUrl) {
      sendText(response, 400, `invalid image source ${API_VERSION}`);
      return;
    }
    proxyImage(imageUrl, response);
  } catch (error) {
    sendText(response, 400, `invalid image source ${API_VERSION}`);
  }
}

module.exports = handler;
