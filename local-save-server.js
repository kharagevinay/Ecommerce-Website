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

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function writeDataJsOnDisk(productsList, categoriesList) {
  try {
    const dataJsPath = path.join(ROOT_DIR, "js", "data.js");
    if (!fs.existsSync(dataJsPath)) return;
    let currentContent = fs.readFileSync(dataJsPath, "utf8");

    if (Array.isArray(categoriesList) && categoriesList.length > 0) {
      const catMatch = currentContent.match(/const CATEGORIES = \[[\s\S]*?\n\];/);
      if (catMatch) {
        currentContent = currentContent.replace(
          catMatch[0],
          `const CATEGORIES = ${JSON.stringify(categoriesList, null, 2)};`
        );
      }
    }

    if (Array.isArray(productsList)) {
      const prodMatch = currentContent.match(/const PRODUCTS = \[[\s\S]*?\n\];/);
      if (prodMatch) {
        currentContent = currentContent.replace(
          prodMatch[0],
          `const PRODUCTS = ${JSON.stringify(productsList, null, 2)};`
        );
      }
    }

    fs.writeFileSync(dataJsPath, currentContent, "utf8");
    console.log("[UPDATED] js/data.js synced with local disk");
  } catch (err) {
    console.error("[WARN] Could not auto-update js/data.js:", err.message);
  }
}

const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/save-product-assets") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const { category, oldCategory = "", productId, images = [], video = "", allProducts = null, allCategories = null } = JSON.parse(body);
        const safeCat = String(category).replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        const safeOldCat = String(oldCategory || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        const safeId = String(productId).replace(/[^A-Za-z0-9\-_]/g, "").trim();
        const folderPath = path.join(ROOT_DIR, "assets", "Categories", safeCat, safeId);

        // If category changed during edit, move existing folder first so existing relative files are preserved
        if (safeOldCat && safeOldCat.toLowerCase() !== safeCat.toLowerCase()) {
          const oldFolderPath = path.join(ROOT_DIR, "assets", "Categories", safeOldCat, safeId);
          if (fs.existsSync(oldFolderPath)) {
            fs.mkdirSync(path.join(ROOT_DIR, "assets", "Categories", safeCat), { recursive: true });
            if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
            fs.renameSync(oldFolderPath, folderPath);
          }
        }

        fs.mkdirSync(folderPath, { recursive: true });

        const savedImages = [];
        images.forEach((imgData, idx) => {
          if (typeof imgData === "string" && imgData.startsWith("data:")) {
            const match = imgData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (match) {
              const ext = match[1].includes("png") ? "png" : "jpg";
              const fileName = `image-${idx + 1}.${ext}`;
              fs.writeFileSync(path.join(folderPath, fileName), Buffer.from(match[2], "base64"));
              savedImages.push(`assets/Categories/${safeCat}/${safeId}/${fileName}`);
            }
          } else if (imgData) {
            // Rewrite old category path prefix if category was renamed
            let normalized = imgData;
            if (safeOldCat && safeOldCat.toLowerCase() !== safeCat.toLowerCase()) {
              normalized = normalized.replace(
                new RegExp(`assets/Categories/${safeOldCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${safeId}/`, "i"),
                `assets/Categories/${safeCat}/${safeId}/`
              );
            }
            savedImages.push(normalized);
          }
        });

        // Remove stale image-N files that are no longer referenced
        const keepBasenames = new Set(savedImages.map(p => path.basename(p)));
        let savedVideo = video || "";
        if (typeof video === "string" && video.startsWith("data:")) {
          const vMatch = video.match(/^data:video\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
          if (vMatch) {
            const vName = `video-1.mp4`;
            fs.writeFileSync(path.join(folderPath, vName), Buffer.from(vMatch[2], "base64"));
            savedVideo = `assets/Categories/${safeCat}/${safeId}/${vName}`;
          }
        } else if (savedVideo && safeOldCat && safeOldCat.toLowerCase() !== safeCat.toLowerCase()) {
          savedVideo = savedVideo.replace(
            new RegExp(`assets/Categories/${safeOldCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${safeId}/`, "i"),
            `assets/Categories/${safeCat}/${safeId}/`
          );
        }
        if (savedVideo && !savedVideo.startsWith("http")) {
          keepBasenames.add(path.basename(savedVideo));
        }

        if (fs.existsSync(folderPath)) {
          fs.readdirSync(folderPath).forEach(fname => {
            if (!keepBasenames.has(fname)) {
              try { fs.unlinkSync(path.join(folderPath, fname)); } catch (e) {}
            }
          });
        }

        if (Array.isArray(allProducts)) {
          const syncedProds = allProducts.map(p =>
            p && p.id === productId
              ? { ...p, category: safeCat, images: savedImages.length ? savedImages : p.images, video: savedVideo }
              : p
          );
          writeDataJsOnDisk(syncedProds, allCategories);
        }

        console.log(`[SAVED] Product folder updated: ${folderPath}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, folderPath, images: savedImages, video: savedVideo }));
      } catch (err) {
        console.error("[ERROR] save-product-assets:", err);
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
        const { category, productId, deleteCategoryFolder = false, allProducts = null, allCategories = null } = JSON.parse(body);
        const safeCat = String(category || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        const safeId = String(productId || "").replace(/[^A-Za-z0-9\-_]/g, "").trim();
        if (safeCat && safeId) {
          const folderPath = path.join(ROOT_DIR, "assets", "Categories", safeCat, safeId);
          if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`[DELETED] Product folder removed from assets/: ${folderPath}`);
          }
          if (deleteCategoryFolder) {
            const catFolderPath = path.join(ROOT_DIR, "assets", "Categories", safeCat);
            if (fs.existsSync(catFolderPath)) {
              fs.rmSync(catFolderPath, { recursive: true, force: true });
              console.log(`[DELETED] Empty category folder removed from assets/: ${catFolderPath}`);
            }
          }
        }
        if (Array.isArray(allProducts)) {
          writeDataJsOnDisk(allProducts, allCategories);
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

  if (req.method === "POST" && req.url === "/api/save-category-asset") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const { categoryName, oldCategoryName = "", image, allCategories = null, allProducts = null } = JSON.parse(body);
        const safeCat = String(categoryName || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        const safeOld = String(oldCategoryName || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        const catFolder = path.join(ROOT_DIR, "assets", "Categories", safeCat);

        // If category was renamed, rename its subfolder under assets/Categories/
        if (safeOld && safeOld.toLowerCase() !== safeCat.toLowerCase()) {
          const oldCatFolder = path.join(ROOT_DIR, "assets", "Categories", safeOld);
          if (fs.existsSync(oldCatFolder)) {
            if (fs.existsSync(catFolder)) fs.rmSync(catFolder, { recursive: true, force: true });
            fs.renameSync(oldCatFolder, catFolder);
          }
          // Also remove old cover file if renamed
          const oldSlug = safeOld.replace(/\s+/g, "-");
          [".jpg", ".jpeg", ".png"].forEach(ext => {
            const oldCover = path.join(ROOT_DIR, "assets", "Categories", `${oldSlug}-Category${ext}`);
            if (fs.existsSync(oldCover)) {
              try { fs.unlinkSync(oldCover); } catch (e) {}
            }
          });
        }

        fs.mkdirSync(catFolder, { recursive: true });
        let savedPath = image;
        if (typeof image === "string" && image.startsWith("data:")) {
          const match = image.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
          if (match) {
            const ext = match[1].includes("png") ? "png" : "jpg";
            const fileName = `${safeCat.replace(/\s+/g, "-")}-Category.${ext}`;
            fs.writeFileSync(path.join(ROOT_DIR, "assets", "Categories", fileName), Buffer.from(match[2], "base64"));
            savedPath = `assets/Categories/${fileName}`;
          }
        }

        const updatedCats = Array.isArray(allCategories)
          ? allCategories.map(c => (c && c.name === categoryName ? { ...c, image: savedPath } : c))
          : null;

        writeDataJsOnDisk(allProducts, updatedCats);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, image: savedPath }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/delete-category-asset") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const { categoryName, allCategories = null, allProducts = null } = JSON.parse(body);
        const safeCat = String(categoryName || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
        if (safeCat) {
          const catFolder = path.join(ROOT_DIR, "assets", "Categories", safeCat);
          if (fs.existsSync(catFolder)) {
            fs.rmSync(catFolder, { recursive: true, force: true });
          }
          const slug = safeCat.replace(/\s+/g, "-");
          [".jpg", ".jpeg", ".png"].forEach(ext => {
            const coverFile = path.join(ROOT_DIR, "assets", "Categories", `${slug}-Category${ext}`);
            if (fs.existsSync(coverFile)) {
              fs.unlinkSync(coverFile);
            }
          });
        }
        writeDataJsOnDisk(allProducts, allCategories);
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
  console.log(`Jewellery by Riddhi local server running at http://localhost:${PORT}/index.html`);
});
