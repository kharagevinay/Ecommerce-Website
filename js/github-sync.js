// ==========================================
// GITHUB CONTENTS API SYNC (Jewellery by Riddhi)
// Automatically creates/updates/deletes folders & files in GitHub repo
// ==========================================
const GH_CFG_STORAGE_KEY = "riddhi_github_api_cfg_v1";

function getGitHubSyncConfig() {
  try {
    const raw = localStorage.getItem(GH_CFG_STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (cfg && cfg.owner && cfg.repo && cfg.token) {
      return {
        owner: String(cfg.owner).trim(),
        repo: String(cfg.repo).trim(),
        branch: String(cfg.branch || "main").trim() || "main",
        token: String(cfg.token).trim()
      };
    }
  } catch (e) {}
  return null;
}

function saveGitHubSyncConfig(owner, repo, branch, token) {
  const cleanOwner = String(owner || "").trim();
  const cleanRepo = String(repo || "").trim();
  const cleanBranch = String(branch || "main").trim() || "main";
  const cleanToken = String(token || "").trim();
  if (!cleanOwner || !cleanRepo || !cleanToken) {
    throw new Error("Owner, Repo Name aur GitHub Token teeno zaroori hain.");
  }
  const cfg = { owner: cleanOwner, repo: cleanRepo, branch: cleanBranch, token: cleanToken };
  localStorage.setItem(GH_CFG_STORAGE_KEY, JSON.stringify(cfg));
  return cfg;
}

function clearGitHubSyncConfig() {
  localStorage.removeItem(GH_CFG_STORAGE_KEY);
}

function detectGitHubOwnerRepoFromUrl() {
  try {
    const host = (window.location.hostname || "").toLowerCase();
    const pathParts = (window.location.pathname || "").split("/").filter(Boolean);
    if (host.endsWith(".github.io")) {
      const owner = host.replace(".github.io", "");
      const repo = pathParts.length > 0 ? pathParts[0] : `${owner}.github.io`;
      return { owner, repo, branch: "main" };
    }
  } catch (e) {}
  return { owner: "", repo: "", branch: "main" };
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function githubApiRequest(cfg, apiPath, options = {}) {
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${apiPath}`;
  const headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${cfg.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { message: text }; }
  return { ok: res.ok, status: res.status, data: json };
}

async function testGitHubConnection(cfg) {
  const r = await githubApiRequest(cfg, `branches/${encodeURIComponent(cfg.branch)}`, { method: "GET" });
  if (!r.ok) {
    throw new Error((r.data && r.data.message) || `GitHub HTTP ${r.status}`);
  }
  return true;
}

async function getGitHubFileSha(cfg, repoFilePath) {
  const cleanPath = String(repoFilePath || "").replace(/^\/+/, "");
  const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
  const r = await githubApiRequest(cfg, `contents/${encodedPath}?ref=${encodeURIComponent(cfg.branch)}`, { method: "GET" });
  if (r.ok && r.data && r.data.sha) return r.data.sha;
  return null;
}

async function putGitHubFileBase64(cfg, repoFilePath, base64Content, commitMsg) {
  const cleanPath = String(repoFilePath || "").replace(/^\/+/, "");
  const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
  const existingSha = await getGitHubFileSha(cfg, cleanPath);
  const bodyObj = {
    message: commitMsg || `Update ${cleanPath} via Admin Panel`,
    content: base64Content,
    branch: cfg.branch
  };
  if (existingSha) bodyObj.sha = existingSha;

  const r = await githubApiRequest(cfg, `contents/${encodedPath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj)
  });
  if (!r.ok) {
    throw new Error((r.data && r.data.message) || `Failed to write ${cleanPath}`);
  }
  return cleanPath;
}

async function deleteGitHubFile(cfg, repoFilePath, commitMsg) {
  const cleanPath = String(repoFilePath || "").replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("Comming-Soon.png") || cleanPath.includes("logo.png")) return false;
  const existingSha = await getGitHubFileSha(cfg, cleanPath);
  if (!existingSha) return false;
  const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
  const r = await githubApiRequest(cfg, `contents/${encodedPath}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: commitMsg || `Delete ${cleanPath} via Admin Panel`,
      sha: existingSha,
      branch: cfg.branch
    })
  });
  return r.ok;
}

async function deleteGitHubFolderRecursive(cfg, folderRepoPath, commitMsg) {
  const cleanFolder = String(folderRepoPath || "").replace(/^\/+|\/+$/g, "");
  if (!cleanFolder) return;
  const encodedPath = cleanFolder.split("/").map(encodeURIComponent).join("/");
  const r = await githubApiRequest(cfg, `contents/${encodedPath}?ref=${encodeURIComponent(cfg.branch)}`, { method: "GET" });
  if (!r.ok || !Array.isArray(r.data)) return;
  for (const item of r.data) {
    if (item.type === "dir") {
      await deleteGitHubFolderRecursive(cfg, item.path, commitMsg);
    } else if (item.type === "file" && item.sha) {
      const fEncoded = item.path.split("/").map(encodeURIComponent).join("/");
      await githubApiRequest(cfg, `contents/${fEncoded}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commitMsg || `Remove ${item.path} via Admin Panel`,
          sha: item.sha,
          branch: cfg.branch
        })
      });
    }
  }
}

function buildUpdatedDataJsText(categoriesList, productsList) {
  const safeCats = Array.isArray(categoriesList) ? categoriesList : (typeof CATEGORIES !== "undefined" ? CATEGORIES : []);
  const safeProds = Array.isArray(productsList) ? productsList : (typeof PRODUCTS !== "undefined" ? PRODUCTS : []);
  return (
    `// Auto-synced catalog from Jewellery by Riddhi Admin Panel\n` +
    `const APPS_SCRIPT_URL = ${JSON.stringify(typeof APPS_SCRIPT_URL !== "undefined" ? APPS_SCRIPT_URL : "")};\n` +
    `const ADMIN_USERNAME = ${JSON.stringify(typeof ADMIN_USERNAME !== "undefined" ? ADMIN_USERNAME : "riddhi_admin")};\n` +
    `const ADMIN_LOCAL_HASH = ${JSON.stringify(typeof ADMIN_LOCAL_HASH !== "undefined" ? ADMIN_LOCAL_HASH : "")};\n` +
    `const WHATSAPP_NUMBER = ${JSON.stringify(typeof WHATSAPP_NUMBER !== "undefined" ? WHATSAPP_NUMBER : "918412981213")};\n` +
    `const BRAND_PHONE_DISPLAY = ${JSON.stringify(typeof BRAND_PHONE_DISPLAY !== "undefined" ? BRAND_PHONE_DISPLAY : "+91 84129 81213")};\n` +
    `const INSTAGRAM_HANDLE = ${JSON.stringify(typeof INSTAGRAM_HANDLE !== "undefined" ? INSTAGRAM_HANDLE : "@jewellery_by_riddhi")};\n` +
    `const INSTAGRAM_URL = ${JSON.stringify(typeof INSTAGRAM_URL !== "undefined" ? INSTAGRAM_URL : "https://www.instagram.com/jewellery_by_riddhi/")};\n` +
    `const INDIAN_CITIES = ${JSON.stringify(typeof INDIAN_CITIES !== "undefined" ? INDIAN_CITIES : [], null, 2)};\n\n` +
    `const CATEGORIES = ${JSON.stringify(safeCats, null, 2)};\n\n` +
    `const SAMPLE_VIDEO = ${JSON.stringify(typeof SAMPLE_VIDEO !== "undefined" ? SAMPLE_VIDEO : "")};\n\n` +
    `const PRODUCTS = ${JSON.stringify(safeProds, null, 2)};\n`
  );
}

async function syncCategoryToGitHubRepo(catObj, oldName, allCategoriesList, allProductsList) {
  const cfg = getGitHubSyncConfig();
  if (!cfg || !catObj) return { ok: false, skipped: true };

  const safeCat = String(catObj.name || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
  const slug = safeCat.replace(/\s+/g, "-");
  let finalImageRelPath = catObj.image || "assets/Categories/Comming-Soon.png";

  if (oldName && oldName.trim().toLowerCase() !== safeCat.toLowerCase()) {
    const safeOld = String(oldName).replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
    const oldSlug = safeOld.replace(/\s+/g, "-");
    await deleteGitHubFolderRecursive(cfg, `assets/Categories/${safeOld}`, `Rename category ${safeOld} -> ${safeCat}`);
    for (const ext of ["jpg", "jpeg", "png"]) {
      await deleteGitHubFile(cfg, `assets/Categories/${oldSlug}-Category.${ext}`, `Remove old category cover ${oldSlug}`);
    }
  }

  if (typeof catObj.image === "string" && catObj.image.startsWith("data:")) {
    const match = catObj.image.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      const ext = match[1].includes("png") ? "png" : "jpg";
      finalImageRelPath = `assets/Categories/${slug}-Category.${ext}`;
      await putGitHubFileBase64(cfg, finalImageRelPath, match[2], `Add/Update category cover ${finalImageRelPath}`);
    }
  }

  const gitkeepPath = `assets/Categories/${safeCat}/.gitkeep`;
  await putGitHubFileBase64(cfg, gitkeepPath, utf8ToBase64("Category folder for " + safeCat + "\n"), `Ensure folder assets/Categories/${safeCat}`);

  const updatedCats = (allCategoriesList || []).map(c =>
    (c && c.name === catObj.name) ? { ...c, image: finalImageRelPath } : c
  );
  const dataJsStr = buildUpdatedDataJsText(updatedCats, allProductsList);
  await putGitHubFileBase64(cfg, "js/data.js", utf8ToBase64(dataJsStr), `Sync js/data.js for category ${safeCat}`);

  return { ok: true, image: finalImageRelPath };
}

async function deleteCategoryFromGitHubRepo(catName, remainingCategories, remainingProducts) {
  const cfg = getGitHubSyncConfig();
  if (!cfg || !catName) return { ok: false, skipped: true };

  const safeCat = String(catName).replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
  const slug = safeCat.replace(/\s+/g, "-");
  await deleteGitHubFolderRecursive(cfg, `assets/Categories/${safeCat}`, `Delete category folder ${safeCat}`);
  for (const ext of ["jpg", "jpeg", "png"]) {
    await deleteGitHubFile(cfg, `assets/Categories/${slug}-Category.${ext}`, `Delete category image ${slug}`);
  }
  const dataJsStr = buildUpdatedDataJsText(remainingCategories, remainingProducts);
  await putGitHubFileBase64(cfg, "js/data.js", utf8ToBase64(dataJsStr), `Remove category ${safeCat} from js/data.js`);
  return { ok: true };
}

async function syncProductToGitHubRepo(prodObj, oldCategory, allProductsList, allCategoriesList) {
  const cfg = getGitHubSyncConfig();
  if (!cfg || !prodObj) return { ok: false, skipped: true };

  const safeCat = String(prodObj.category || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
  const safeOldCat = String(oldCategory || "").replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
  const safeId = String(prodObj.id || "").replace(/[^A-Za-z0-9\-_]/g, "").trim();
  const folderRel = `assets/Categories/${safeCat}/${safeId}`;

  if (safeOldCat && safeOldCat.toLowerCase() !== safeCat.toLowerCase()) {
    await deleteGitHubFolderRecursive(cfg, `assets/Categories/${safeOldCat}/${safeId}`, `Move ${safeId} from ${safeOldCat} to ${safeCat}`);
  }

  const finalImages = [];
  const rawImgs = Array.isArray(prodObj.images) ? prodObj.images : [];
  for (let i = 0; i < rawImgs.length; i++) {
    const imgData = rawImgs[i];
    if (typeof imgData === "string" && imgData.startsWith("data:")) {
      const match = imgData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) {
        const ext = match[1].includes("png") ? "png" : "jpg";
        const fileRel = `${folderRel}/image-${i + 1}.${ext}`;
        await putGitHubFileBase64(cfg, fileRel, match[2], `Upload ${fileRel}`);
        finalImages.push(fileRel);
      }
    } else if (imgData) {
      let norm = String(imgData);
      if (safeOldCat && safeOldCat.toLowerCase() !== safeCat.toLowerCase()) {
        norm = norm.replace(new RegExp(`assets/Categories/${safeOldCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${safeId}/`, "i"), `${folderRel}/`);
      }
      finalImages.push(norm);
    }
  }

  let finalVideo = String(prodObj.video || "").trim();
  if (finalVideo.startsWith("data:")) {
    const vMatch = finalVideo.match(/^data:video\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (vMatch) {
      const vRel = `${folderRel}/video-1.mp4`;
      await putGitHubFileBase64(cfg, vRel, vMatch[2], `Upload ${vRel}`);
      finalVideo = vRel;
    }
  } else if (finalVideo && safeOldCat && safeOldCat.toLowerCase() !== safeCat.toLowerCase()) {
    finalVideo = finalVideo.replace(new RegExp(`assets/Categories/${safeOldCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${safeId}/`, "i"), `${folderRel}/`);
  }

  const syncedProds = (allProductsList || []).map(p =>
    (p && p.id === prodObj.id)
      ? { ...p, category: safeCat, images: finalImages.length ? finalImages : p.images, video: finalVideo }
      : p
  );
  const dataJsStr = buildUpdatedDataJsText(allCategoriesList, syncedProds);
  await putGitHubFileBase64(cfg, "js/data.js", utf8ToBase64(dataJsStr), `Sync js/data.js for product ${safeId}`);

  return { ok: true, images: finalImages, video: finalVideo };
}

async function deleteProductFromGitHubRepo(category, productId, remainingProducts, allCategoriesList) {
  const cfg = getGitHubSyncConfig();
  if (!cfg || !category || !productId) return { ok: false, skipped: true };

  const safeCat = String(category).replace(/[^A-Za-z0-9\-_ ]/g, "").trim();
  const safeId = String(productId).replace(/[^A-Za-z0-9\-_]/g, "").trim();
  await deleteGitHubFolderRecursive(cfg, `assets/Categories/${safeCat}/${safeId}`, `Delete product folder ${safeCat}/${safeId}`);

  const dataJsStr = buildUpdatedDataJsText(allCategoriesList, remainingProducts);
  await putGitHubFileBase64(cfg, "js/data.js", utf8ToBase64(dataJsStr), `Remove product ${safeId} from js/data.js`);
  return { ok: true };
}

function injectGitHubSyncModalAndWiring(badgeElementId) {
  if (!document.getElementById("githubSyncConfigModal")) {
    const modalHtml = `
      <div class="modal fade" id="githubSyncConfigModal" tabindex="-1" aria-hidden="true" style="z-index: 1095;">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content" style="background-color: var(--cream-bg); border-radius: 16px; border: 2px solid var(--accent-gold);">
            <div class="modal-header text-white py-3" style="background-color: var(--primary-green); border-radius: 14px 14px 0 0;">
              <h6 class="modal-title brand-font fw-bold m-0">
                <i class="bi bi-github me-2 text-warning"></i>GitHub Auto-Folder &amp; File Sync Setup
              </h6>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <form id="githubSyncCfgForm" onsubmit="handleSaveGitHubSyncForm(event)">
              <div class="modal-body small">
                <div class="alert alert-info py-2 px-3 mb-3" style="font-size: 11.5px; border-radius: 10px;">
                  <strong>Yeh kya karta hai?</strong> Jab aap live GitHub site se Category ya Product Add/Edit/Delete karenge, toh yeh automatic aapke GitHub repo ke <code>assets/Categories/...</code> folder me images/videos aur <code>js/data.js</code> commit karega!
                </div>
                <div id="ghCfgTestStatus" class="alert d-none py-2 px-3 small mb-2"></div>
                <div class="row g-2 mb-2">
                  <div class="col-6">
                    <label class="form-label fw-semibold mb-1">GitHub Username / Owner *</label>
                    <input type="text" id="ghCfgOwner" class="form-control form-control-sm" placeholder="e.g. vinaykharage" required>
                  </div>
                  <div class="col-6">
                    <label class="form-label fw-semibold mb-1">Repository Name *</label>
                    <input type="text" id="ghCfgRepo" class="form-control form-control-sm" placeholder="e.g. jewellery-by-riddhi" required>
                  </div>
                </div>
                <div class="mb-2">
                  <label class="form-label fw-semibold mb-1">Branch Name *</label>
                  <input type="text" id="ghCfgBranch" class="form-control form-control-sm" value="main" placeholder="main" required>
                </div>
                <div class="mb-2">
                  <label class="form-label fw-semibold mb-1">GitHub Fine-Grained Personal Access Token *</label>
                  <input type="password" id="ghCfgToken" class="form-control form-control-sm" placeholder="github_pat_... ya ghp_..." required>
                  <div class="text-muted mt-1" style="font-size: 10.5px;">
                    GitHub → <strong>Settings → Developer settings → Personal access tokens → Fine-grained tokens</strong> me jakar sirf is repo ke liye <strong>Contents: Read &amp; Write</strong> permission wala token banayein. (Token sirf aapke browser me save rahega).
                  </div>
                </div>
              </div>
              <div class="modal-footer border-0 pt-0 justify-content-between">
                <button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3" onclick="handleDisconnectGitHubSync()">
                  Disconnect
                </button>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-outline-secondary btn-sm rounded-pill px-3" data-bs-dismiss="modal">Close</button>
                  <button type="submit" id="ghCfgSaveSubmitBtn" class="btn btn-green btn-sm rounded-pill px-4 fw-semibold">
                    <i class="bi bi-check2-circle me-1"></i> Verify &amp; Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }
  window._activeGhBadgeId = badgeElementId || "ghSyncNavBadge";
  refreshGitHubSyncBadgeUI(window._activeGhBadgeId);
}

function refreshGitHubSyncBadgeUI(badgeId) {
  const el = document.getElementById(badgeId || window._activeGhBadgeId || "ghSyncNavBadge");
  if (!el) return;
  const cfg = getGitHubSyncConfig();
  if (cfg) {
    el.className = "btn btn-success btn-sm rounded-pill px-3 fw-semibold";
    el.innerHTML = `<i class="bi bi-github me-1"></i> GitHub Connected ✓`;
  } else {
    el.className = "btn btn-outline-light btn-sm rounded-pill px-3 fw-semibold";
    el.innerHTML = `<i class="bi bi-github me-1"></i> Connect GitHub Repo`;
  }
}

function openGitHubSyncConfigModal() {
  injectGitHubSyncModalAndWiring(window._activeGhBadgeId);
  const existing = getGitHubSyncConfig();
  const auto = detectGitHubOwnerRepoFromUrl();
  document.getElementById("ghCfgOwner").value = (existing && existing.owner) || auto.owner || "";
  document.getElementById("ghCfgRepo").value = (existing && existing.repo) || auto.repo || "";
  document.getElementById("ghCfgBranch").value = (existing && existing.branch) || auto.branch || "main";
  document.getElementById("ghCfgToken").value = (existing && existing.token) || "";
  const st = document.getElementById("ghCfgTestStatus");
  if (st) st.classList.add("d-none");
  bootstrap.Modal.getOrCreateInstance(document.getElementById("githubSyncConfigModal")).show();
}

async function handleSaveGitHubSyncForm(e) {
  e.preventDefault();
  const owner = document.getElementById("ghCfgOwner").value.trim();
  const repo = document.getElementById("ghCfgRepo").value.trim();
  const branch = document.getElementById("ghCfgBranch").value.trim() || "main";
  const token = document.getElementById("ghCfgToken").value.trim();
  const st = document.getElementById("ghCfgTestStatus");
  const btn = document.getElementById("ghCfgSaveSubmitBtn");

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Verifying...`;
  try {
    const cfg = saveGitHubSyncConfig(owner, repo, branch, token);
    await testGitHubConnection(cfg);
    st.className = "alert alert-success py-2 px-3 small mb-2";
    st.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> Connected to <strong>${owner}/${repo}</strong> (${branch})! Ab Add/Edit/Delete par GitHub ke <code>assets/</code> folder me files automatically banengi.`;
    st.classList.remove("d-none");
    refreshGitHubSyncBadgeUI();
    setTimeout(() => {
      const m = bootstrap.Modal.getInstance(document.getElementById("githubSyncConfigModal"));
      if (m) m.hide();
    }, 1100);
  } catch (err) {
    clearGitHubSyncConfig();
    refreshGitHubSyncBadgeUI();
    st.className = "alert alert-danger py-2 px-3 small mb-2";
    st.textContent = "Connection failed: " + (err.message || "Check Owner, Repo name, Branch & Token permissions.");
    st.classList.remove("d-none");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Verify &amp; Save`;
  }
}

function handleDisconnectGitHubSync() {
  clearGitHubSyncConfig();
  refreshGitHubSyncBadgeUI();
  const st = document.getElementById("ghCfgTestStatus");
  if (st) {
    st.className = "alert alert-warning py-2 px-3 small mb-2";
    st.textContent = "GitHub Repo disconnected from this browser.";
    st.classList.remove("d-none");
  }
}
