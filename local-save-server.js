const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const PORT = 5501;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/save-product-assets") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const { category, productId, images = [], video = "" } = JSON.parse(body);
        const safeCat = String(category).replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        const safeId = String(productId).replace(/[^A-Za-z0-9\-_]/g, "").trim();
        const folderPath = path.join(ROOT_DIR, "assets", "Categories", safeCat, safeId);

        fs.mkdirSync(folderPath, { recursive: true });

        const savedImages = [];
        images.forEach((imgData, idx) => {
          if (typeof imgData === "string" && imgData.startsWith("data:")) {
            const match = imgData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (match) {
              const ext = match[1] === "png" ? "png" : "jpg";
              const fileName = `image-${idx + 1}.${ext}`;
              fs.writeFileSync(path.join(folderPath, fileName), Buffer.from(match[2], "base64"));
              savedImages.push(`assets/Categories/${safeCat}/${safeId}/${fileName}`);
            }
          } else if (imgData) {
            savedImages.push(imgData);
          }
        });

        let savedVideo = video || "";
        if (typeof video === "string" && video.startsWith("data:")) {
          const vMatch = video.match(/^data:video\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (vMatch) {
            const vName = `video-1.mp4`;
            fs.writeFileSync(path.join(folderPath, vName), Buffer.from(vMatch[2], "base64"));
            savedVideo = `assets/Categories/${safeCat}/${safeId}/${vName}`;
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, folderPath, images: savedImages, video: savedVideo }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/delete-product-assets") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const { category, productId } = JSON.parse(body);
        const safeCat = String(category || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        const safeId = String(productId || "").replace(/[^A-Za-z0-9\-_]/g, "").trim();
        if (safeCat && safeId) {
          const folderPath = path.join(ROOT_DIR, "assets", "Categories", safeCat, safeId);
          if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  const urlPath = (req.url || "/").split("?")[0];
  let filePath = path.join(ROOT_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT_DIR, "index.html");
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Jewellery by Riddhi local server running at http://localhost:${PORT}/admin-products.html`);
});
