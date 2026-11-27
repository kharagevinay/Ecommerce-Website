function handleSmartImgError(imgEl, backupSrc) {
  if (!imgEl) return;
  const triedBackup = imgEl.dataset.triedBackup === "1";
  if (!triedBackup && backupSrc && imgEl.src !== backupSrc && !backupSrc.includes("Comming-Soon.png")) {
    imgEl.dataset.triedBackup = "1";
    imgEl.src = backupSrc;
    return;
  }
  imgEl.onerror = null;
  imgEl.src = "assets/Categories/Comming-Soon.png";
}

// Kisi bhi user-written text ko HTML me dikhane se pehle escape karta hai (XSS se bachav)
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}


function getFullImageUrl(imgPath) {
  if (!imgPath) return "";
  const cleanPath = String(imgPath).trim();
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
  try {
    const baseHref = window.location.href.split("#")[0].split("?")[0];
    return encodeURI(new URL(cleanPath, baseHref).href);
  } catch (e) {
    return cleanPath;
  }
}

function toSheetOrder(o) {
  const mappedItems = (o.items || []).map(it => {
    const prod = PRODUCTS.find(p => p.id === it.id);
    const preOrderStock = typeof it.preOrderStock === "number"
      ? it.preOrderStock
      : (prod ? Math.max(0, parseInt(prod.availableStock, 10) || 0) : 0);
    const offerP = Number(it.price) || (prod ? Number(prod.price) : 0) || 0;
    const actualP = Number(it.actualPrice) || (prod && Number(prod.actualPrice) > offerP ? Number(prod.actualPrice) : offerP);
    return {
      ...it,
      category: it.category || (prod ? prod.category : "") || "",
      price: offerP,
      actualPrice: actualP,
      image: getFullImageUrl(it.image),
      currentStock: preOrderStock
    };
  });
  return {
    orderId: o.orderId,
    timestamp: o.timestamp,
    siteBaseUrl: (typeof window !== 'undefined' && window.location) ? window.location.href.split('#')[0].split('?')[0].replace(/\/[^\/]*$/, '') : '',
    date: o.date,
    total: o.total,
    customer: o.customer,
    items: mappedItems
  };
}


let cart = [];
let favorites = [];
let currentProduct = null;
let currentActiveMedia = { type: "image", src: "" };
let pendingAction = null; // 'order_single' or 'order_cart'
let pendingCustomerObj = null;
let pendingRemoveCartIndex = null;
let pendingCancelOrderId = null;

let productModalInstance = null;
let customerModalInstance = null;
let orderConfirmModalInstance = null;
let removeCartConfirmModalInstance = null;
let adminCancelModalInstance = null;
let policyModalInstance = null;
let orderSuccessModalInstance = null;
let emptyCartModalInstance = null;
let stockEnquiryModalInstance = null;

// ==========================================
// PER-PRODUCT & PER-SIZE LIVE STOCK PERSISTENCE + ADMIN CATALOG SYNC
// ==========================================
const BASELINE_DEFAULT_PRODUCTS = JSON.parse(JSON.stringify(PRODUCTS));

const BASELINE_DEFAULT_CATEGORIES = JSON.parse(JSON.stringify(CATEGORIES));

function syncCustomCategoriesFromStorage() {
  try {
    const raw = localStorage.getItem("riddhi_custom_categories_v1");
    if (raw !== null) {
      const customCats = JSON.parse(raw);
      if (Array.isArray(customCats)) {
        CATEGORIES.splice(0, CATEGORIES.length, ...customCats);
      }
    }
  } catch (e) {}
}

function syncCustomCatalogFromStorage() {
  syncCustomCategoriesFromStorage();
  try {
    const raw = localStorage.getItem("riddhi_custom_products_v1");
    if (raw !== null) {
      const customList = JSON.parse(raw);
      if (Array.isArray(customList)) {
        PRODUCTS.splice(0, PRODUCTS.length, ...customList);
      }
    }
  } catch (e) {}
}

function loadPersistedStock() {
  syncCustomCatalogFromStorage();
  try {
    const sizeStockMap = JSON.parse(localStorage.getItem("riddhi_product_size_stock") || "{}");
    const savedMap = JSON.parse(localStorage.getItem("riddhi_product_stock") || "{}");
    PRODUCTS.forEach(p => {
      if (!Array.isArray(p.sizes) || p.sizes.length === 0) {
        p.sizes = ["Free Size (Adjustable Dori)"];
      }
      if (!p.sizeStock || typeof p.sizeStock !== "object") {
        p.sizeStock = {};
        p.sizes.forEach((sz, i) => {
          p.sizeStock[sz] = i === 0 ? (Math.max(0, parseInt(p.availableStock, 10) || 0)) : 0;
        });
      }
      if (sizeStockMap[p.id] && typeof sizeStockMap[p.id] === "object") {
        p.sizeStock = { ...sizeStockMap[p.id] };
        p.sizes = Object.keys(p.sizeStock);
      } else if (Object.prototype.hasOwnProperty.call(savedMap, p.id)) {
        const firstSz = p.sizes[0] || "Free Size (Adjustable Dori)";
        p.sizeStock[firstSz] = Math.max(0, parseInt(savedMap[p.id], 10) || 0);
      }
      p.availableStock = Object.values(p.sizeStock).reduce((s, v) => s + (Math.max(0, parseInt(v, 10) || 0)), 0);
    });
  } catch (e) {
    console.warn("Could not read persisted stock", e);
  }
}

function savePersistedStock() {
  try {
    const map = {};
    const sizeMap = {};
    PRODUCTS.forEach(p => {
      if (!p.sizeStock || Object.keys(p.sizeStock).length === 0) {
        p.sizeStock = { "Free Size (Adjustable Dori)": Math.max(0, parseInt(p.availableStock, 10) || 0) };
      }
      p.sizes = Object.keys(p.sizeStock);
      p.availableStock = Object.values(p.sizeStock).reduce((s, v) => s + (Math.max(0, parseInt(v, 10) || 0)), 0);
      map[p.id] = p.availableStock;
      sizeMap[p.id] = p.sizeStock;
    });
    localStorage.setItem("riddhi_product_stock", JSON.stringify(map));
    localStorage.setItem("riddhi_product_size_stock", JSON.stringify(sizeMap));
    localStorage.setItem("riddhi_custom_products_v1", JSON.stringify(PRODUCTS));
  } catch (e) {
    console.warn("Could not save persisted stock", e);
  }
}

function getStockForProductSize(prod, sizeName) {
  if (!prod) return 0;
  if (prod.sizeStock && sizeName && Object.prototype.hasOwnProperty.call(prod.sizeStock, sizeName)) {
    return Math.max(0, parseInt(prod.sizeStock[sizeName], 10) || 0);
  }
  return Math.max(0, parseInt(prod.availableStock, 10) || 0);
}

function refreshAllProductViews() {
  renderHomeOffersAndMarquee();
  renderNewArrivals();
  if (document.getElementById("productListView") && !document.getElementById("productListView").classList.contains("d-none")) {
    applyFilters();
  }
  if (document.getElementById("favoritesView") && !document.getElementById("favoritesView").classList.contains("d-none")) {
    renderFavoritesView();
  }
  refreshStockManagerDropdowns();
}

// Deducts stock ONLY for the specific ordered product(s) & selected size
function deductStockForItems(items) {
  let changed = false;
  (items || []).forEach(it => {
    const prod = PRODUCTS.find(p => p.id === it.id && (!it.name || p.name === it.name)) || PRODUCTS.find(p => p.id === it.id);
    if (prod) {
      const orderedQty = Math.max(1, parseInt(it.qty, 10) || 1);
      const sz = it.size || (prod.sizes && prod.sizes[0]) || "Free Size (Adjustable Dori)";
      if (prod.sizeStock && Object.prototype.hasOwnProperty.call(prod.sizeStock, sz)) {
        prod.sizeStock[sz] = Math.max(0, (parseInt(prod.sizeStock[sz], 10) || 0) - orderedQty);
      }
      prod.availableStock = Object.values(prod.sizeStock || {}).reduce((s, v) => s + (Math.max(0, parseInt(v, 10) || 0)), 0);
      changed = true;
    }
  });
  if (changed) {
    savePersistedStock();
    refreshAllProductViews();
  }
}

function initStockCategoryFilters() {
  ["sidebarStockCategoryFilter", "modalStockCategoryFilter"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="All">All Categories</option>` +
      CATEGORIES.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
  });
  refreshStockManagerDropdowns();
}

function syncStockCategoryFilter(source) {
  const srcCat = document.getElementById(source === "sidebar" ? "sidebarStockCategoryFilter" : "modalStockCategoryFilter");
  const otherCat = document.getElementById(source === "sidebar" ? "modalStockCategoryFilter" : "sidebarStockCategoryFilter");
  if (!srcCat) return;
  if (otherCat) otherCat.value = srcCat.value;
  refreshStockManagerDropdowns(srcCat.value);
}

function refreshStockManagerDropdowns(forcedCategory = null) {
  ["sidebar", "modal"].forEach(prefix => {
    const catEl = document.getElementById(`${prefix}StockCategoryFilter`);
    const prodEl = document.getElementById(`${prefix}StockProductSelect`);
    if (!prodEl) return;

    const selectedCat = forcedCategory !== null ? forcedCategory : (catEl ? catEl.value : "All");
    if (catEl && forcedCategory !== null) catEl.value = forcedCategory;

    const prevProdId = prodEl.value;
    const filteredList = selectedCat === "All"
      ? PRODUCTS
      : PRODUCTS.filter(p => p.category.toLowerCase() === selectedCat.toLowerCase());

    if (filteredList.length === 0) {
      prodEl.innerHTML = `<option value="">No products in this category</option>`;
      return;
    }

    prodEl.innerHTML = filteredList.map(p =>
      `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)}) — Stock: ${Math.max(0, parseInt(p.availableStock, 10) || 0)}</option>`
    ).join("");

    if (prevProdId && filteredList.some(p => p.id === prevProdId)) {
      prodEl.value = prevProdId;
    }
    onStockProductSelectChange(prefix);
  });
}

function onStockProductSelectChange(prefix) {
  const prodEl = document.getElementById(`${prefix}StockProductSelect`);
  const qtyInp = document.getElementById(`${prefix}StockQtyInput`);
  if (!prodEl || !qtyInp) return;
  const prod = PRODUCTS.find(p => p.id === prodEl.value);
  if (prod) {
    qtyInp.value = Math.max(0, parseInt(prod.availableStock, 10) || 0);
  }
}

function applyServerStockMap(stockMap) {
  if (!stockMap || typeof stockMap !== "object") return;
  let changed = false;
  PRODUCTS.forEach(p => {
    if (Object.prototype.hasOwnProperty.call(stockMap, p.id)) {
      const srvVal = Math.max(0, parseInt(stockMap[p.id], 10) || 0);
      if (p.availableStock !== srvVal) {
        p.availableStock = srvVal;
        changed = true;
      }
    }
  });
  if (changed) {
    savePersistedStock();
    refreshAllProductViews();
  }
}

async function syncGlobalStockFromSheet() {
  if (!APPS_SCRIPT_URL) return;
  try {
    const remoteRes = await callScript({ action: "getProducts" });
    if (remoteRes && remoteRes.ok) {
      if (Array.isArray(remoteRes.offers)) {
        localStorage.setItem("riddhi_custom_offers_v1", JSON.stringify(remoteRes.offers));
        renderHomeOffersAndMarquee();
      }

      let cachedCats = [];
      try {
        const rc = localStorage.getItem("riddhi_custom_categories_v1");
        if (rc) cachedCats = JSON.parse(rc);
      } catch (e) {}

      const delCats = (Array.isArray(remoteRes.deletedCategoryNames) ? remoteRes.deletedCategoryNames : []).map(x => x.toLowerCase());
      const sheetCats = Array.isArray(remoteRes.categories) ? remoteRes.categories.filter(sc => sc && sc.name && !delCats.includes(sc.name.toLowerCase())) : [];
      const finalCats = sheetCats.map(sc => {
        const cc = Array.isArray(cachedCats) ? cachedCats.find(x => x && x.name.toLowerCase() === sc.name.toLowerCase()) : null;
        const cImg = (cc && cc.image && !cc.image.includes("Comming-Soon.png")) ? cc.image : (sc.image || "assets/Categories/Comming-Soon.png");
        return { ...sc, image: cImg };
      });
      CATEGORIES.splice(0, CATEGORIES.length, ...finalCats);
      localStorage.setItem("riddhi_custom_categories_v1", JSON.stringify(CATEGORIES));
      renderCategories();

      let cachedProds = [];
      try {
        const rp = localStorage.getItem("riddhi_custom_products_v1");
        if (rp) cachedProds = JSON.parse(rp);
      } catch (e) {}

      const deletedIds = Array.isArray(remoteRes.deletedIds) ? remoteRes.deletedIds : [];
      const sheetProds = Array.isArray(remoteRes.products) ? remoteRes.products.filter(sp => sp && sp.id && !deletedIds.includes(sp.id)) : [];
      const finalProds = sheetProds.map(sp => {
        const cp = Array.isArray(cachedProds) ? cachedProds.find(x => x && x.id === sp.id) : null;
        const cpHasImgs = cp && Array.isArray(cp.images) && cp.images.length > 0 && !cp.images.every(u => String(u).includes("Comming-Soon.png"));
        const spHasImgs = Array.isArray(sp.images) && sp.images.length > 0 && !sp.images.every(u => String(u).includes("Comming-Soon.png"));
        const imgs = cpHasImgs ? cp.images : (spHasImgs ? sp.images : ["assets/Categories/Comming-Soon.png"]);
        const vid = (cp && cp.video) ? cp.video : (sp.video || "");
        const szMap = (remoteRes.sizeStock && remoteRes.sizeStock[sp.id] && Object.keys(remoteRes.sizeStock[sp.id]).length > 0)
          ? { ...remoteRes.sizeStock[sp.id] }
          : (sp.sizeStock && Object.keys(sp.sizeStock).length > 0 ? { ...sp.sizeStock } : { "Free Size (Adjustable Dori)": Math.max(0, parseInt(sp.availableStock, 10) || 0) });
        const szList = Object.keys(szMap);
        const totSt = Object.values(szMap).reduce((s, v) => s + (Math.max(0, parseInt(v, 10) || 0)), 0);
        return {
          ...sp,
          images: imgs,
          video: vid,
          sizes: szList,
          sizeStock: szMap,
          availableStock: totSt
        };
      });

      PRODUCTS.splice(0, PRODUCTS.length, ...finalProds);
      savePersistedStock();
      refreshAllProductViews();
    }
  } catch (e) { /* offline fallback */ }
}

async function saveSingleProductStockFromUI(prefix) {
  const prodEl = document.getElementById(`${prefix}StockProductSelect`);
  const qtyInp = document.getElementById(`${prefix}StockQtyInput`);
  if (!prodEl || !qtyInp) return;
  const prod = PRODUCTS.find(p => p.id === prodEl.value);
  if (!prod) return;

  const newStock = Math.max(0, parseInt(qtyInp.value, 10) || 0);
  prod.availableStock = newStock;
  savePersistedStock();
  refreshAllProductViews();

  const s = getAdminSession();
  if (s && s.mode === "sheet" && APPS_SCRIPT_URL) {
    try {
      const r = await callScript({
        action: "setStock",
        token: s.token,
        productId: prod.id,
        productName: prod.name,
        image: getFullImageUrl((prod.images && prod.images[0]) || ""),
        stock: newStock
      });
      if (r && r.ok && r.stock) {
        applyServerStockMap(r.stock);
      }
    } catch (e) { /* saved locally */ }
  }
  alert(`Stock updated for "${prod.name}" (${prod.id}) → ${newStock} pcs`);
}

// ==========================================
// AUTO-DELIVERED TIMER MANUAL TOGGLE (ON / OFF)
// ==========================================
function isAutoDeliverEnabled() {
  const val = localStorage.getItem("riddhi_auto_deliver_enabled");
  return val === null ? true : (val === "true");
}

function syncAutoDeliverUI(enabled) {
  const flag = !!enabled;
  localStorage.setItem("riddhi_auto_deliver_enabled", flag ? "true" : "false");
  const sw1 = document.getElementById("sidebarAutoDeliverSwitch");
  const sw2 = document.getElementById("modalAutoDeliverSwitch");
  const hint = document.getElementById("sidebarAutoDeliverHint");
  if (sw1) sw1.checked = flag;
  if (sw2) sw2.checked = flag;
  if (hint) {
    hint.textContent = flag
      ? "ON: Shipped orders auto-mark Delivered after 5 days."
      : "OFF (Manual Mode): Orders stay Shipped until you manually mark Delivered.";
  }
}

async function toggleAutoDeliverSetting(enabled) {
  const flag = !!enabled;
  syncAutoDeliverUI(flag);
  if (flag) {
    autoDeliverLocalOrders();
    renderMyOrders();
    renderAllCustomersSummary();
  }
  const s = getAdminSession();
  if (s && s.mode === "sheet" && APPS_SCRIPT_URL) {
    try {
      await callScript({ action: "setAutoDeliver", token: s.token, enabled: flag });
    } catch (e) { /* saved locally */ }
  }
}

// ==========================================
// FAVORITES / WISHLIST MANAGEMENT
// ==========================================
function loadFavorites() {
  try {
    const arr = JSON.parse(localStorage.getItem("riddhi_favorites") || "[]");
    favorites = Array.isArray(arr) ? arr : [];
  } catch (e) {
    favorites = [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem("riddhi_favorites", JSON.stringify(favorites));
  } catch (e) {
    console.warn("Could not save favorites", e);
  }
}

function isProductFavorite(productId) {
  return favorites.includes(productId);
}

function updateFavoritesBadge() {
  const badge = document.getElementById("navFavCount");
  if (!badge) return;
  const validCount = favorites.filter(id => PRODUCTS.some(p => p.id === id)).length;
  if (validCount > 0) {
    badge.innerText = validCount;
    badge.classList.remove("d-none");
  } else {
    badge.classList.add("d-none");
  }
}

function toggleFavorite(productId, event) {
  if (event) event.stopPropagation();
  const idx = favorites.indexOf(productId);
  if (idx > -1) {
    favorites.splice(idx, 1);
  } else {
    favorites.push(productId);
  }
  saveFavorites();
  updateFavoritesBadge();
  refreshAllProductViews();
  updateModalFavoriteButton();
}

function toggleCurrentProductFavorite() {
  if (!currentProduct) return;
  toggleFavorite(currentProduct.id);
}

function updateModalFavoriteButton() {
  const btn = document.getElementById("modalFavBtn");
  if (!btn || !currentProduct) return;
  const active = isProductFavorite(currentProduct.id);
  btn.className = active
    ? "btn btn-sm btn-danger rounded-pill px-2 py-0"
    : "btn btn-sm btn-outline-danger rounded-pill px-2 py-0";
  btn.innerHTML = active
    ? `<i class="bi bi-heart-fill me-1"></i><span>Favorited</span>`
    : `<i class="bi bi-heart me-1"></i><span>Favorite</span>`;
}

function openFavoritesView() {
  hideAllViews();
  const fv = document.getElementById("favoritesView");
  if (fv) {
    fv.classList.remove("d-none");
    renderFavoritesView();
    window.scrollTo(0, 0);
  } else {
    window.location.href = "index.html#favorites";
  }
}

function renderFavoritesView() {
  const grid = document.getElementById("favoritesGrid");
  const countBadge = document.getElementById("favoritesCountBadge");
  if (!grid) return;

  const favProducts = PRODUCTS.filter(p => isProductFavorite(p.id));
  if (countBadge) countBadge.innerText = `${favProducts.length} Saved`;

  if (favProducts.length === 0) {
    grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-heart fs-1 text-danger opacity-50"></i>
        <h5 class="brand-font mt-3" style="color: var(--primary-green);">No Favorite Products Yet</h5>
        <p class="small text-muted mb-3">Tap the heart icon on any jewellery piece to save it here for quick access.</p>
        <button class="btn btn-green btn-sm rounded-pill px-4" onclick="openProductsView('All')">Explore Jewellery</button>
      </div>`;
    return;
  }

  grid.innerHTML = favProducts.map((prod, idx) => buildProductCardHtml(prod, idx, false)).join("");
}

function calcDiscountPercent(actualPrice, offerPrice) {
  const act = Number(actualPrice) || 0;
  const off = Number(offerPrice) || 0;
  if (act <= off || act <= 0) return 0;
  return Math.round(((act - off) / act) * 100);
}


// ==========================================
// SEPARATE CUSTOMER MOBILE-ONLY LOGIN / LOGOUT SESSION
// ==========================================
function getCustomerSessionMobile() {
  try {
    const m = String(localStorage.getItem("riddhi_customer_mobile_session") || "").replace(/[^0-9]/g, "").slice(-10);
    if (m.length === 10) return m;
  } catch (e) {}
  return "";
}

function updateCustomerAccountUI() {
  const mob = getCustomerSessionMobile();
  const navBtn = document.getElementById("navCustAccountBtn");
  const navLbl = document.getElementById("navCustAccountLabel");
  const sideOut = document.getElementById("sidebarCustLoggedOutView");
  const sideIn = document.getElementById("sidebarCustLoggedInView");
  const sideMob = document.getElementById("sidebarCustMobileDisplay");
  const drwTxt = document.getElementById("drawerCustStatusText");
  const drwLoginBtn = document.getElementById("drawerCustLoginBtn");
  const drwLogoutBtn = document.getElementById("drawerCustLogoutBtn");

  if (mob) {
    const fmtMob = `+91 ${mob.slice(0, 5)} ${mob.slice(5)}`;
    if (navBtn) {
      navBtn.className = "btn btn-success btn-sm px-2 py-1 d-flex align-items-center gap-1 rounded-pill";
      navBtn.title = `Logged in: ${fmtMob} (Click to view Orders/Enquiries)`;
    }
    if (navLbl) navLbl.textContent = mob;
    if (sideOut) sideOut.classList.add("d-none");
    if (sideIn) sideIn.classList.remove("d-none");
    if (sideMob) sideMob.textContent = fmtMob;
    if (drwTxt) drwTxt.innerHTML = `<i class="bi bi-check-circle-fill text-success me-1"></i>Synced: <strong>${esc(fmtMob)}</strong>`;
    if (drwLoginBtn) drwLoginBtn.classList.add("d-none");
    if (drwLogoutBtn) drwLogoutBtn.classList.remove("d-none");
  } else {
    if (navBtn) {
      navBtn.className = "btn btn-outline-dark btn-sm px-2 py-1 d-flex align-items-center gap-1 rounded-pill";
      navBtn.title = "Customer Mobile Login";
    }
    if (navLbl) navLbl.textContent = mob;
    if (sideOut) sideOut.classList.remove("d-none");
    if (sideIn) sideIn.classList.add("d-none");
    if (drwTxt) drwTxt.textContent = "Login with mobile no. to load orders from all devices";
    if (drwLoginBtn) drwLoginBtn.classList.remove("d-none");
    if (drwLogoutBtn) drwLogoutBtn.classList.add("d-none");
  }
}

function closeHeaderProfileMenu() {
  const dd = document.getElementById("headerProfileDropdown");
  if (dd) dd.classList.add("d-none");
}

function handleCustomerAccountBtnClick(ev) {
  if (ev) ev.stopPropagation();
  const mob = getCustomerSessionMobile();
  if (mob) {
    const dd = document.getElementById("headerProfileDropdown");
    const mobTxt = document.getElementById("headerProfileMobileText");
    if (mobTxt) mobTxt.textContent = `+91 ${mob.slice(0, 5)} ${mob.slice(5)}`;
    if (dd) dd.classList.toggle("d-none");
  } else {
    openCustomerMobileLoginModal();
  }
}

document.addEventListener("click", (ev) => {
  const dd = document.getElementById("headerProfileDropdown");
  const btn = document.getElementById("navCustAccountBtn");
  if (!dd || dd.classList.contains("d-none")) return;
  if (!dd.contains(ev.target) && (!btn || !btn.contains(ev.target))) {
    dd.classList.add("d-none");
  }
});

function openCustomerMobileLoginModal() {
  const el = document.getElementById("customerMobileLoginModal");
  if (!el) return;
  const inp = document.getElementById("custLoginMobileInput");
  const err = document.getElementById("custMobileLoginErr");
  if (err) err.classList.add("d-none");
  if (inp) inp.value = getCustomerSessionMobile() || "";
  bootstrap.Modal.getOrCreateInstance(el).show();
}

async function submitCustomerMobileLogin(e) {
  e.preventDefault();
  const inp = document.getElementById("custLoginMobileInput");
  const err = document.getElementById("custMobileLoginErr");
  const btn = document.getElementById("custMobileLoginSubmitBtn");
  const digits = String(inp?.value || "").replace(/[^0-9]/g, "").slice(-10);

  if (digits.length !== 10) {
    if (err) {
      err.textContent = "Please enter a valid 10-digit mobile number.";
      err.classList.remove("d-none");
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Loading History...`;
  }

  try {
    localStorage.setItem("riddhi_customer_mobile_session", digits);
    localStorage.removeItem("riddhi_customer_logged_out");
    // Reset any prior clear-history filter so all previous orders & enquiries for this mobile load immediately!
    localStorage.removeItem("riddhi_orders_cleared_at");
    localStorage.removeItem("riddhi_enquiries_cleared_at");

    const savedCust = getSavedCustomer() || { name: "", address: "", city: "", pincode: "" };
    savedCust.mobile = digits;
    localStorage.setItem("riddhi_customer", JSON.stringify(savedCust));

    updateCustomerAccountUI();
    await refreshMyOrderStatuses(true);

    const modalEl = document.getElementById("customerMobileLoginModal");
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

    const oc = document.getElementById("myOrdersOffcanvas");
    if (oc) bootstrap.Offcanvas.getOrCreateInstance(oc).show();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Login &amp; Sync`;
    }
  }
}

function logoutCustomerMobileSession() {
  try {
    localStorage.removeItem("riddhi_customer_mobile_session");
    localStorage.removeItem("riddhi_customer");
    localStorage.removeItem("riddhi_orders");
    localStorage.removeItem("riddhi_enquiries");
    localStorage.setItem("riddhi_customer_logged_out", "1");
    sessionStorage.removeItem("riddhi_customer_mobile_session");
    sessionStorage.removeItem("riddhi_orders");
    sessionStorage.removeItem("riddhi_enquiries");
  } catch (e) {}
  updateCustomerAccountUI();
  renderMyOrders();
  renderCustomerMyEnquiriesTab();
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  loadPersistedStock();
  loadFavorites();
  syncAutoDeliverUI(isAutoDeliverEnabled());

  if (document.getElementById("productModal")) {
    productModalInstance = new bootstrap.Modal(document.getElementById("productModal"));
  }
  if (document.getElementById("customerDetailsModal")) {
    customerModalInstance = new bootstrap.Modal(document.getElementById("customerDetailsModal"));
  }
  if (document.getElementById("orderConfirmModal")) {
    orderConfirmModalInstance = new bootstrap.Modal(document.getElementById("orderConfirmModal"));
  }
  if (document.getElementById("removeCartConfirmModal")) {
    removeCartConfirmModalInstance = new bootstrap.Modal(document.getElementById("removeCartConfirmModal"));
  }
  if (document.getElementById("adminCancelReasonModal")) {
    adminCancelModalInstance = new bootstrap.Modal(document.getElementById("adminCancelReasonModal"));
  }
  if (document.getElementById("policyModal")) {
    policyModalInstance = new bootstrap.Modal(document.getElementById("policyModal"));
  }
  if (document.getElementById("orderSuccessModal")) {
    orderSuccessModalInstance = new bootstrap.Modal(document.getElementById("orderSuccessModal"));
  }
  if (document.getElementById("emptyCartModal")) {
    emptyCartModalInstance = new bootstrap.Modal(document.getElementById("emptyCartModal"));
  }
  if (document.getElementById("stockEnquiryModal")) {
    stockEnquiryModalInstance = new bootstrap.Modal(document.getElementById("stockEnquiryModal"));
  }

  initCityAutocomplete();
  renderHomeOffersAndMarquee();
  renderNewArrivals();
  renderCategories();
  initStockCategoryFilters();
  updateFavoritesBadge();
  updateCartUI();
  autoDeliverLocalOrders();
  renderMyOrders();
  syncPendingOrders();
  updateCustomerAccountUI();
  updateAdminMenuLabel();
  checkAdminHash();
  if (location.hash === "#favorites") {
    history.replaceState(null, "", location.pathname + location.search);
    openFavoritesView();
  }
  refreshAdminHistory();
  refreshMyOrderStatuses();
  syncGlobalStockFromSheet();
});

// ==========================================
// PRODUCT CARD HTML HELPER
// ==========================================
function buildProductCardHtml(prod, idx = 0, showNewBadge = false) {
  const stock = Math.max(0, parseInt(prod.availableStock, 10) || 0);
  const isOut = stock === 0;
  const isFav = isProductFavorite(prod.id);
  const discPct = calcDiscountPercent(prod.actualPrice, prod.price);
  const delay = Math.min(idx * 0.06, 0.45).toFixed(2);

  return `
    <div class="col-6 col-md-4 col-lg-3 stagger-card" style="animation-delay: ${delay}s;">
      <div class="product-card ${isOut ? "out-of-stock" : ""}" onclick="openProductDetail('${prod.id}')">
        <div>
          <div class="position-relative">
            <img referrerpolicy="no-referrer" src="${esc((prod.images && prod.images[0]) || 'assets/Categories/Comming-Soon.png')}" alt="${esc(prod.name)}" onerror="handleSmartImgError(this, 'assets/Categories/Comming-Soon.png');">
            ${showNewBadge ? `<span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2" style="font-size: 10px;">NEW</span>` : ""}
            ${discPct > 0 && !showNewBadge ? `<span class="discount-badge position-absolute top-0 start-0 m-2">${discPct}% OFF</span>` : ""}
            ${isOut
              ? `<span class="badge bg-danger position-absolute top-0 end-0 m-2" style="font-size: 10px;">Stock: 0 • Available Soon</span>`
              : `<span class="badge bg-dark bg-opacity-75 position-absolute top-0 end-0 m-2" style="font-size: 10px;">Stock: ${stock}</span>`
            }
            <button type="button" class="fav-heart-btn ${isFav ? "active" : ""}" onclick="toggleFavorite('${prod.id}', event)" title="${isFav ? "Remove from Favorites" : "Add to Favorites"}" aria-label="Favorite">
              <i class="bi ${isFav ? "bi-heart-fill" : "bi-heart"}"></i>
            </button>
          </div>
          <div class="p-2 p-md-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <small class="text-muted" style="font-size: 11px;">${esc(prod.category)}</small>
              ${discPct > 0 && showNewBadge ? `<span class="discount-badge">${discPct}% OFF</span>` : ""}
            </div>
            <h6 class="fw-semibold mb-1 text-dark small">${esc(prod.name)}</h6>
          </div>
        </div>
        <div class="px-2 px-md-3 pb-3 d-flex justify-content-between align-items-center gap-1">
          <div>
            <span class="price-tag">₹${prod.price}</span>
            ${prod.actualPrice && prod.actualPrice > prod.price ? `<span class="actual-price ms-1">₹${prod.actualPrice}</span>` : ""}
          </div>
          <span class="btn btn-sm ${isOut ? "btn-outline-danger" : "btn-green"} rounded-pill px-2 px-md-3" style="font-size: 11px;">
            ${isOut ? "Enquire" : "View"}
          </span>
        </div>
      </div>
    </div>
  `;
}


// ==========================================
// HOME PAGE OFFERS & MARQUEE RENDERER (Synced with admin-offers.html & Google Sheet)
// ==========================================
const DEFAULT_HOME_OFFERS = [
  { id: "OFR-MARQ-1", type: "marquee", badge1: "Festive Offer", badge2: "", title: "Up to 30% OFF on Handcrafted Chokers, Nath & Bridal Combos!", desc: "", targetCategory: "All", targetCategories: ["All"], featuredGreen: false, active: true },
  { id: "OFR-MARQ-2", type: "marquee", badge1: "Limited Stock", badge2: "", title: "Only 1–2 Ready Pieces per Design — Book Yours Before It Sells Out!", desc: "", targetCategory: "All", targetCategories: ["All"], featuredGreen: false, active: true },
  { id: "OFR-MARQ-3", type: "marquee", badge1: "Custom Bulk", badge2: "", title: "Need 3–4+ Pieces for Weddings or Haldi? Custom Making Available!", desc: "", targetCategory: "All", targetCategories: ["All"], featuredGreen: false, active: true },
  { id: "OFR-CARD-1", type: "card", badge1: "LIMITED TIME DEAL", badge2: "FLAT ₹400 OFF", title: "Bridal & Festive Combos", desc: "Complete Choker + Necklace + Earrings + Mangalsutra sets at special festive offer prices.", targetCategory: "Combo Set", targetCategories: ["Combo Set"], featuredGreen: true, active: true },
  { id: "OFR-CARD-2", type: "card", badge1: "HURRY • 1–2 PCS LEFT", badge2: "READY TO SHIP", title: "Exclusive Handmade Drops", desc: "Each piece is handcrafted in small batches. Grab ready stock before it switches to Available Soon!", targetCategory: "All", targetCategories: ["All"], featuredGreen: false, active: true },
  { id: "OFR-CARD-3", type: "card", badge1: "WEDDING & HALDI SPECIAL", badge2: "25%–32% OFF", title: "Peshwai Nath & Haldi Sets", desc: "Traditional Moti Nath, Bugadi & Sugar-Ball sets. Bulk 3+ custom orders welcome!", targetCategory: "Nath", targetCategories: ["Nath"], featuredGreen: false, active: true }
];

function getHomeOffersConfig() {
  try {
    const raw = localStorage.getItem("riddhi_custom_offers_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_HOME_OFFERS));
}

function renderHomeOffersAndMarquee() {
  const allOffers = getHomeOffersConfig().filter(o => o && o.active !== false);

  const marqueeTrack = document.getElementById("offerMarqueeTrack");
  if (marqueeTrack) {
    const marqItems = allOffers.filter(o => o.type === "marquee");
    const listToUse = marqItems.length > 0 ? marqItems : DEFAULT_HOME_OFFERS.filter(o => o.type === "marquee");
    const singlePass = listToUse.map(m => `
      <div class="offer-marquee-item">
        <span class="gold-pill">${esc(m.badge1 || "Offer")}</span>
        <span>${esc(m.title || "")}</span>
      </div>`).join("");
    marqueeTrack.innerHTML = singlePass + singlePass;
  }

  const cardsRow = document.getElementById("homeOfferCardsRow");
  if (cardsRow) {
    const cardItems = allOffers.filter(o => o.type !== "marquee");
    if (cardItems.length === 0) {
      cardsRow.innerHTML = "";
      return;
    }
    cardsRow.innerHTML = cardItems.map((c, idx) => {
      const catsArr = Array.isArray(c.targetCategories) && c.targetCategories.length > 0
        ? c.targetCategories
        : (c.targetCategory ? [c.targetCategory] : ["All"]);
      const encodedCats = encodeURIComponent(JSON.stringify(catsArr));
      let themeCls = "";
      let isDarkTheme = false;
      if (c.themeGold) {
        themeCls = "theme-festive-gold";
        isDarkTheme = true;
      } else if (c.themeRose) {
        themeCls = "theme-bridal-rose";
        isDarkTheme = true;
      } else if (c.themeMint) {
        themeCls = "theme-soft-cream";
        isDarkTheme = false;
      } else if (c.featuredGreen) {
        themeCls = "featured-green theme-royal-green";
        isDarkTheme = true;
      }
      const delay = Math.min(idx * 0.08, 0.35).toFixed(2);
      return `
        <div class="col-12 col-md-4 d-flex stagger-card" style="animation-delay: ${delay}s;">
          <div class="offer-highlight-card w-100 ${themeCls}" onclick="openOfferTargetCategories('${encodedCats}', '${esc(c.title || "")}')">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="${isDarkTheme ? "offer-urgency-pill" : "badge bg-danger"}">${esc(c.badge1 || "OFFER")}</span>
              ${c.badge2 ? `<span class="badge ${isDarkTheme ? "" : "bg-success-subtle text-success border border-success-subtle"}" style="${isDarkTheme ? "background-color: var(--accent-gold); color: #15321e;" : ""}">${esc(c.badge2)}</span>` : ""}
            </div>
            <h5 class="brand-font fw-bold mb-1 offer-card-title" style="color: ${isDarkTheme ? "var(--accent-gold-light)" : "var(--primary-green)"};">${esc(c.title || "")}</h5>
            <p class="small mb-2 offer-card-desc ${isDarkTheme ? "opacity-90" : "text-muted"}">${esc(c.desc || "")}</p>
            <span class="small fw-semibold offer-card-footer-link ${isDarkTheme ? "text-warning" : ""}" style="${isDarkTheme ? "" : "color: var(--primary-green);"}">Shop Now <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>`;
    }).join("");
  }
}

let activeMultiCategoryFilter = null;

function openOfferTargetCategories(encodedCatsJson, offerTitle = "") {
  let cats = ["All"];
  try {
    const parsed = JSON.parse(decodeURIComponent(encodedCatsJson));
    if (Array.isArray(parsed) && parsed.length > 0) cats = parsed;
  } catch (e) {}

  if (cats.includes("All") || cats.length === 0) {
    activeMultiCategoryFilter = null;
    openProductsView("All");
    return;
  }
  if (cats.length === 1) {
    activeMultiCategoryFilter = null;
    openProductsView(cats[0]);
    return;
  }

  activeMultiCategoryFilter = cats;
  hideAllViews();
  document.getElementById("productListView").classList.remove("d-none");
  document.getElementById("filterCategory").value = "All";
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterPrice").value = "default";
  document.getElementById("collectionHeading").innerText = offerTitle ? `${offerTitle} (${cats.join(", ")})` : cats.join(" & ");
  applyFilters();
  window.scrollTo(0, 0);
}

// ==========================================
// NEW ARRIVALS ON HOME PAGE
// ==========================================
function renderNewArrivals() {
  const sec = document.getElementById("newArrivalsSection");
  const container = document.getElementById("newArrivalsGrid");
  if (!container) return;
  const newItems = PRODUCTS.filter(p => p.isNewArrival).slice(0, 4);
  if (sec) sec.classList.toggle("d-none", newItems.length === 0);
  container.innerHTML = newItems.map((prod, idx) => buildProductCardHtml(prod, idx, true)).join("");
}

// ==========================================
// 15 CATEGORIES RENDERING (HOME, SIDEBAR, FILTER)
// ==========================================
function renderCategories() {
  const homeGrid = document.getElementById("homeCategoryGrid");
  const sidebarList = document.getElementById("sidebarCategoryList");
  const filterDropdown = document.getElementById("filterCategory");
  if (homeGrid) homeGrid.innerHTML = "";
  if (sidebarList) sidebarList.innerHTML = "";
  if (filterDropdown) filterDropdown.innerHTML = `<option value="All">All Categories</option>`;

  CATEGORIES.forEach((cat, idx) => {
    const delay = Math.min(idx * 0.04, 0.5).toFixed(2);
    if (homeGrid) {
      homeGrid.innerHTML += `
        <div class="col-6 col-md-4 col-lg-3 stagger-card" style="animation-delay: ${delay}s;">
          <div class="custom-card" onclick="openProductsView('${cat.name}')">
            <img referrerpolicy="no-referrer" src="${esc(cat.image)}" alt="${esc(cat.name)}" onerror="handleSmartImgError(this, 'assets/Categories/Comming-Soon.png');">
            <div class="card-footer-title">${cat.name}</div>
          </div>
        </div>
      `;
    }
    if (sidebarList) {
      sidebarList.innerHTML += `
        <a href="javascript:void(0)" class="list-group-item list-group-item-action bg-transparent py-1 px-2 small border-0"
           onclick="openProductsView('${cat.name}')" data-bs-dismiss="offcanvas">
          <i class="bi bi-chevron-right small me-1 text-muted"></i> ${cat.name}
        </a>
      `;
    }
    if (filterDropdown) {
      filterDropdown.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    }
  });
}

// ==========================================
// NAVIGATION & FILTERING
// ==========================================
function hideAllViews() {
  ["homeView", "productListView", "favoritesView", "aboutView", "careView"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("d-none");
  });
}

function navigateTo(viewName) {
  hideAllViews();
  if (viewName === "home") {
    const hv = document.getElementById("homeView");
    if (hv) hv.classList.remove("d-none");
    else window.location.href = "index.html";
  }
  if (viewName === "about") document.getElementById("aboutView")?.classList.remove("d-none");
  if (viewName === "care") document.getElementById("careView")?.classList.remove("d-none");
  window.scrollTo(0, 0);
}

function openProductsView(selectedCat = "All") {
  if (selectedCat !== "All") activeMultiCategoryFilter = null;
  hideAllViews();
  document.getElementById("productListView").classList.remove("d-none");
  if (selectedCat === "All" && Array.isArray(activeMultiCategoryFilter) && activeMultiCategoryFilter.length > 1) {
    // keep custom multi-category heading
  } else {
    activeMultiCategoryFilter = null;
  }
  document.getElementById("filterCategory").value = selectedCat;
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterPrice").value = "default";
  applyFilters();
  window.scrollTo(0, 0);
}

function applyFilters() {
  const selectedCat = document.getElementById("filterCategory").value;
  const searchText = document.getElementById("filterSearch").value.toLowerCase().trim();
  const filterMode = document.getElementById("filterPrice").value;

  document.getElementById("collectionHeading").innerText =
    selectedCat === "All" ? "All Products" : selectedCat + " Collection";

  let filtered = PRODUCTS.filter(prod => {
    const matchCat = (selectedCat !== "All")
      ? (prod.category.toLowerCase() === selectedCat.toLowerCase())
      : (Array.isArray(activeMultiCategoryFilter) && activeMultiCategoryFilter.length > 0
          ? activeMultiCategoryFilter.some(mc => String(mc).toLowerCase() === String(prod.category || "").toLowerCase())
          : true);
    const matchSearch = prod.name.toLowerCase().includes(searchText) ||
                        prod.category.toLowerCase().includes(searchText) ||
                        prod.desc.toLowerCase().includes(searchText);
    return matchCat && matchSearch;
  });

  if (filterMode === "under-500") {
    filtered = filtered.filter(p => p.price < 500);
  } else if (filterMode === "500-1000") {
    filtered = filtered.filter(p => p.price >= 500 && p.price <= 1000);
  } else if (filterMode === "1000-1500") {
    filtered = filtered.filter(p => p.price > 1000 && p.price <= 1500);
  } else if (filterMode === "1500-2000") {
    filtered = filtered.filter(p => p.price > 1500 && p.price <= 2000);
  } else if (filterMode === "above-2000") {
    filtered = filtered.filter(p => p.price > 2000);
  } else if (filterMode === "low-high") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (filterMode === "high-low") {
    filtered.sort((a, b) => b.price - a.price);
  } else if (filterMode === "a-z") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (filterMode === "z-a") {
    filtered.sort((a, b) => b.name.localeCompare(a.name));
  }

  document.getElementById("productCountBadge").innerText = filtered.length + " Items";
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = "";

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-12 text-center py-5 text-muted">No products found matching your filter.</div>`;
    return;
  }

  grid.innerHTML = filtered.map((prod, idx) => buildProductCardHtml(prod, idx, false)).join("");
}

// ==========================================
// PRODUCT POPUP (3 IMAGES + 1 VIDEO + FULLSCREEN + AVAILABLE SOON + SHIPPING LINK)
// ==========================================
function openProductDetail(productId) {
  currentProduct = PRODUCTS.find(p => p.id === productId);
  if (!currentProduct) return;

  updateModalFavoriteButton();

  const stock = Math.max(0, parseInt(currentProduct.availableStock, 10) || 0);
  const discPct = calcDiscountPercent(currentProduct.actualPrice, currentProduct.price);

  document.getElementById("modalCategory").innerText = currentProduct.category;
  document.getElementById("modalTitle").innerText = currentProduct.name;
  document.getElementById("modalPrice").innerText = currentProduct.price;

  const actEl = document.getElementById("modalActualPrice");
  const discEl = document.getElementById("modalDiscountBadge");
  if (currentProduct.actualPrice && currentProduct.actualPrice > currentProduct.price) {
    actEl.innerText = `₹${currentProduct.actualPrice}`;
    actEl.classList.remove("d-none");
    discEl.innerText = `${discPct}% OFF`;
    discEl.classList.remove("d-none");
  } else {
    actEl.classList.add("d-none");
    discEl.classList.add("d-none");
  }

  document.getElementById("modalDesc").innerText = currentProduct.desc;

  const stockBadge = document.getElementById("modalStockBadge");
  const inStockBox = document.getElementById("inStockControlsBox");
  const availSoonBox = document.getElementById("availableSoonBox");

  if (stock === 0) {
    stockBadge.className = "badge bg-danger px-2 py-1";
    stockBadge.innerText = "Stock: 0 • Available Soon";
    inStockBox.classList.add("d-none");
    availSoonBox.classList.remove("d-none");

    const enquiryText = `Hello *Jewellery by Riddhi*! ✨\nI saw *${currentProduct.name}* (${currentProduct.id}) is currently marked *Available Soon (Stock: 0)*.\nPrice: ₹${currentProduct.price}\nPlease let me know when it can be made available!`;
    const waSoonBtn = document.getElementById("availSoonWaBtn");
    waSoonBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(enquiryText)}`;
    waSoonBtn.onclick = () => {
      logEnquiryToSheet({
        productId: currentProduct.id,
        category: currentProduct.category,
        productName: currentProduct.name,
        size: "Free Size (Adjustable Dori)",
        availableStock: 0,
        requestedQty: 1,
        note: "Out of Stock / Available Soon Enquiry",
        image: (currentProduct.images && currentProduct.images[0]) || ""
      });
    };
  } else {
    stockBadge.className = "badge bg-success-subtle text-success border border-success-subtle px-2 py-1";
    stockBadge.innerText = `Stock: ${stock} pcs`;
    inStockBox.classList.remove("d-none");
    availSoonBox.classList.add("d-none");
    document.getElementById("maxStockHint").innerText = `(Max ${stock} ready)`;
  }

  const modalSizeEl = document.getElementById("modalSize");
  const productSizes = (Array.isArray(currentProduct.sizes) && currentProduct.sizes.length > 0)
    ? currentProduct.sizes
    : ["Free Size (Adjustable Dori)"];
  modalSizeEl.innerHTML = productSizes.map(sz => {
    const szStock = getStockForProductSize(currentProduct, sz);
    return `<option value="${esc(sz)}">${esc(sz)} (Stock: ${szStock})</option>`;
  }).join("");
  modalSizeEl.onchange = function () {
    const chosenSize = this.value;
    const szStock = getStockForProductSize(currentProduct, chosenSize);
    const badgeEl = document.getElementById("modalStockBadge");
    const hintEl = document.getElementById("maxStockHint");
    const qtyEl = document.getElementById("modalQty");
    if (badgeEl) {
      badgeEl.className = szStock === 0
        ? "badge bg-danger px-2 py-1"
        : "badge bg-success-subtle text-success border border-success-subtle px-2 py-1";
      badgeEl.innerText = szStock === 0 ? "Stock: 0 • Available Soon" : `Stock: ${szStock} pcs`;
    }
    if (hintEl) hintEl.innerText = `(Max ${szStock} ready)`;
    if (qtyEl && parseInt(qtyEl.value, 10) > szStock) {
      qtyEl.value = Math.max(1, szStock);
    }
  };
  modalSizeEl.selectedIndex = 0;
  if (stock > 0) modalSizeEl.onchange();
  document.getElementById("modalQty").value = 1;
  document.getElementById("modalCustom").value = "";

  const thumbContainer = document.getElementById("modalThumbnails");
  thumbContainer.innerHTML = "";

  const prodImgs = (Array.isArray(currentProduct.images) && currentProduct.images.length > 0)
    ? currentProduct.images
    : ["assets/Categories/Comming-Soon.png"];
  prodImgs.slice(0, 3).forEach((imgUrl, idx) => {
    thumbContainer.innerHTML += `
      <div class="thumb-item ${idx === 0 ? "active" : ""}" onclick="setMainMedia('image', '${encodeURIComponent(imgUrl)}', this)">
        <img src="${esc(imgUrl)}" alt="Photo ${idx + 1}">
      </div>
    `;
  });

  if (currentProduct.video) {
    thumbContainer.innerHTML += `
      <div class="thumb-item" onclick="setMainMedia('video', '${encodeURIComponent(currentProduct.video)}', this)">
        <img src="${esc(prodImgs[0])}" alt="Video Preview">
        <div class="video-badge-icon"><i class="bi bi-play-circle-fill"></i></div>
      </div>
    `;
  }

  setMainMedia("image", prodImgs[0], thumbContainer.firstElementChild);
  if (!productModalInstance && document.getElementById("productModal")) {
    productModalInstance = new bootstrap.Modal(document.getElementById("productModal"));
  }
  if (productModalInstance) productModalInstance.show();
}

function buildVideoPlayerHtml(rawSrc, posterImg, isFullscreen = false) {
  const cleanSrc = String(rawSrc || "").trim();
  const driveMatch = cleanSrc.match(/drive\.google\.com\/(?:file\/d\/|uc\?[^#]*id=)([A-Za-z0-9_-]+)/i);
  if (driveMatch && driveMatch[1]) {
    const previewUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    const styleStr = isFullscreen
      ? "width:92vw;height:82vh;border:0;border-radius:10px;background:#000;"
      : "width:100%;height:100%;border:0;background:#000;";
    return `<iframe src="${esc(previewUrl)}" allow="autoplay; fullscreen" allowfullscreen style="${styleStr}"></iframe>`;
  }
  const styleStr = isFullscreen
    ? "max-width:96vw;max-height:90vh;border-radius:10px;background:#000;"
    : "width:100%;height:100%;object-fit:cover;background:#000;";
  return `
    <video id="${isFullscreen ? "fullscreenProductVideo" : "activeProductVideo"}" src="${esc(cleanSrc)}" poster="${esc(posterImg)}" controls autoplay muted loop playsinline preload="auto" style="${styleStr}">
      <source src="${esc(cleanSrc)}" type="video/mp4">
    </video>`;
}
function setMainMedia(type, src, thumbEl) {
  let cleanSrc = String(src || "");
  try { cleanSrc = decodeURIComponent(cleanSrc); } catch (e) {}
  currentActiveMedia = { type, src: cleanSrc };
  const mainBox = document.getElementById("modalMainMedia");
  document.querySelectorAll(".thumb-item").forEach(el => el.classList.remove("active"));
  if (thumbEl) thumbEl.classList.add("active");

  const fsBtnHtml = `<button type="button" class="fullscreen-btn" onclick="openFullscreenMedia()" title="Full Screen"><i class="bi bi-arrows-fullscreen"></i> Full Screen</button>`;

  if (type === "video") {
    const posterImg = (currentProduct && currentProduct.images && currentProduct.images[0]) ? currentProduct.images[0] : "assets/Categories/Comming-Soon.png";
    mainBox.innerHTML = `${fsBtnHtml}${buildVideoPlayerHtml(cleanSrc, posterImg, false)}`;
    const vidEl = document.getElementById("activeProductVideo");
    if (vidEl) {
      vidEl.muted = true;
      const p = vidEl.play();
      if (p !== undefined) p.catch(() => {});
    }
  } else {
    mainBox.innerHTML = `${fsBtnHtml}<img src="${esc(cleanSrc)}" alt="Product View" onclick="openFullscreenMedia()">`;
  }
}

function openFullscreenMedia() {
  const overlay = document.getElementById("fullscreenOverlay");
  const content = document.getElementById("fullscreenContent");
  const vid = document.getElementById("activeProductVideo");
  if (vid) vid.pause();

  if (currentActiveMedia.type === "video") {
    const posterImg = (currentProduct && currentProduct.images && currentProduct.images[0]) ? currentProduct.images[0] : "assets/Categories/Comming-Soon.png";
    content.innerHTML = buildVideoPlayerHtml(currentActiveMedia.src, posterImg, true);
    const fVid = document.getElementById("fullscreenProductVideo");
    if (fVid) {
      fVid.muted = true;
      const p = fVid.play();
      if (p !== undefined) p.catch(() => {});
    }
  } else {
    content.innerHTML = `<img src="${esc(currentActiveMedia.src)}" alt="Full Screen View">`;
  }
  overlay.classList.add("active");
}

function closeFullscreenMedia() {
  const overlay = document.getElementById("fullscreenOverlay");
  const content = document.getElementById("fullscreenContent");
  content.innerHTML = "";
  overlay.classList.remove("active");
}

function closeProductModal() {
  const vid = document.getElementById("activeProductVideo");
  if (vid) vid.pause();
  productModalInstance.hide();
}

function changeModalQty(delta) {
  const qtyInput = document.getElementById("modalQty");
  const chosenSize = document.getElementById("modalSize")?.value || "";
  const sizeAvail = getStockForProductSize(currentProduct, chosenSize);
  let val = parseInt(qtyInput.value, 10) + delta;
  if (val < 1) val = 1;
  if (val > sizeAvail) {
    openOverStockEnquiryModal(currentProduct, chosenSize, sizeAvail, val);
    val = Math.max(1, sizeAvail);
  }
  qtyInput.value = val;
}

function openBulkEnquiryFromProductModal() {
  if (!currentProduct) return;
  const chosenSize = document.getElementById("modalSize")?.value || (currentProduct.sizes && currentProduct.sizes[0]) || "Free Size (Adjustable Dori)";
  const szStock = getStockForProductSize(currentProduct, chosenSize);
  const suggestedQty = Math.max(szStock + 1, 3);
  openOverStockEnquiryModal(currentProduct, chosenSize, szStock, suggestedQty);
}

function openOverStockEnquiryModal(prod, sizeName, availStock, requestedQty) {
  if (!prod) return;
  document.getElementById("enqProdId").value = prod.id;
  document.getElementById("enqProdImg").src = (prod.images && prod.images[0]) || "assets/Categories/Comming-Soon.png";
  document.getElementById("enqProdTitleDisplay").textContent = prod.name;
  document.getElementById("enqProdIdDisplay").textContent = prod.id;
  document.getElementById("enqProdPriceDisplay").textContent = prod.price;

  const sizeSel = document.getElementById("enqSizeSelect");
  const sizesList = (Array.isArray(prod.sizes) && prod.sizes.length > 0)
    ? prod.sizes
    : [sizeName || "Free Size (Adjustable Dori)"];

  sizeSel.innerHTML = sizesList.map(sz => {
    const st = getStockForProductSize(prod, sz);
    return `<option value="${esc(sz)}" ${sz === sizeName ? "selected" : ""}>${esc(sz)} (Stock: ${st})</option>`;
  }).join("");

  const activeSize = sizeSel.value || sizeName || sizesList[0];
  const activeStock = getStockForProductSize(prod, activeSize);
  document.getElementById("enqAvailStock").value = activeStock;
  document.getElementById("enqReqQtyInput").value = Math.max(1, parseInt(requestedQty, 10) || (activeStock + 1));

  refreshEnquiryStockBreakdown();

  const saved = getSavedCustomer();
  if (saved) {
    document.getElementById("enqCustName").value = saved.name || "";
    document.getElementById("enqCustMobile").value = String(saved.mobile || "").replace(/[^0-9]/g, "").slice(-10);
  }
  document.getElementById("enqCustNote").value = "";
  if (stockEnquiryModalInstance) stockEnquiryModalInstance.show();
}

function onEnquirySizeChange() {
  const prodId = document.getElementById("enqProdId").value;
  const prod = PRODUCTS.find(p => p.id === prodId);
  if (!prod) return;
  const chosenSize = document.getElementById("enqSizeSelect").value;
  const st = getStockForProductSize(prod, chosenSize);
  document.getElementById("enqAvailStock").value = st;
  const qtyInp = document.getElementById("enqReqQtyInput");
  if (parseInt(qtyInp.value, 10) <= st) {
    qtyInp.value = st + 1;
  }
  refreshEnquiryStockBreakdown();
}

function adjustEnquiryQty(delta) {
  const qtyInp = document.getElementById("enqReqQtyInput");
  if (!qtyInp) return;
  let val = (parseInt(qtyInp.value, 10) || 1) + delta;
  if (val < 1) val = 1;
  if (val > 500) val = 500;
  qtyInp.value = val;
  refreshEnquiryStockBreakdown();
}

function refreshEnquiryStockBreakdown() {
  const prodId = document.getElementById("enqProdId").value;
  const size = document.getElementById("enqSizeSelect")?.value || "";
  const availStock = parseInt(document.getElementById("enqAvailStock").value, 10) || 0;
  const reqQty = Math.max(1, parseInt(document.getElementById("enqReqQtyInput").value, 10) || 1);
  const extraQty = Math.max(0, reqQty - availStock);
  const readyAlloc = Math.min(availStock, reqQty);

  const box = document.getElementById("overStockAlertSummary");
  if (!box) return;

  if (extraQty > 0) {
    box.innerHTML =
      `<div class="fw-bold text-dark mb-1">Stock vs. Custom Quantity Summary (${esc(size)}):</div>` +
      `• Ready Stock Available: <strong>${availStock} pcs</strong><br>` +
      `• Total Quantity Selected: <strong>${reqQty} pcs</strong><br>` +
      `• Split: <strong>${readyAlloc} ready stock</strong> + <strong class="text-danger">${extraQty} extra piece(s)</strong> custom making required.`;
  } else {
    box.innerHTML =
      `<div class="fw-bold text-success mb-1">All ${reqQty} piece(s) available in ready stock (${esc(size)})!</div>` +
      `Ready Stock: <strong>${availStock} pcs</strong>. You can order directly or still send an enquiry below.`;
  }
}

async function submitOverStockEnquiry(e) {
  e.preventDefault();
  const prodId = document.getElementById("enqProdId").value;
  const size = document.getElementById("enqSizeSelect").value;
  const availStock = parseInt(document.getElementById("enqAvailStock").value, 10) || 0;
  const reqQty = Math.max(1, parseInt(document.getElementById("enqReqQtyInput").value, 10) || 1);
  const extraQty = Math.max(0, reqQty - availStock);
  const custName = document.getElementById("enqCustName").value.trim();
  const mobile = document.getElementById("enqCustMobile").value.replace(/[^0-9]/g, "").slice(0, 10);
  const note = document.getElementById("enqCustNote").value.trim();

  const prod = PRODUCTS.find(p => p.id === prodId);
  if (!prod || mobile.length !== 10) return;

  const btn = document.getElementById("submitOverStockEnqBtn");
  if (btn) btn.disabled = true;

  const enquiryPayload = {
    enquiryId: "ENQ-" + Date.now().toString().slice(-6),
    customerName: custName,
    mobile,
    productId: prod.id,
    category: prod.category,
    productName: prod.name,
    size,
    availableStock: availStock,
    requestedQty: reqQty,
    extraQty,
    note: note || `Stock: ${availStock}, Requested: ${reqQty} (Extra ${extraQty} pcs)`,
    image: getFullImageUrl((prod.images && prod.images[0]) || "")
  };

  try {
    localStorage.setItem("riddhi_customer_mobile_session", mobile);
    localStorage.removeItem("riddhi_customer_logged_out");
    localStorage.removeItem("riddhi_enquiries_cleared_at");
    updateCustomerAccountUI();
    const localEnqs = JSON.parse(localStorage.getItem("riddhi_enquiries") || "[]");
    localEnqs.unshift({ ...enquiryPayload, status: "New Enquiry", date: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }), timestamp: Date.now() });
    localStorage.setItem("riddhi_enquiries", JSON.stringify(localEnqs));
  } catch (err) {}

  if (APPS_SCRIPT_URL) {
    try {
      await callScript({ action: "newEnquiry", enquiry: enquiryPayload });
    } catch (err) {}
  }

  let msg = `Hello *Jewellery by Riddhi*! ✨\n*EXTRA QUANTITY / BULK ENQUIRY*\n\n`;
  msg += `🆔 *Enquiry ID:* ${enquiryPayload.enquiryId}\n`;
  msg += `🛍️ *Product:* ${prod.name} (${prod.id})\n`;
  msg += `📏 *Size:* ${size}\n`;
  msg += `📦 *Ready Stock Available:* ${availStock} pcs\n`;
  msg += `🛒 *Total Quantity Needed:* ${reqQty} pcs` + (extraQty > 0 ? ` (*${extraQty} extra* custom making)\n` : `\n`);
  msg += `👤 *Customer:* ${custName} (${mobile})\n`;
  if (note) msg += `📝 *Note:* _${note}_\n`;

  if (btn) btn.disabled = false;
  if (stockEnquiryModalInstance) stockEnquiryModalInstance.hide();
  sendWhatsAppUrl(WHATSAPP_NUMBER, msg);
}

// ==========================================
// DIRECT ADD TO CART
// ==========================================
function handleAddToCartClick() {
  if (!currentProduct) return;
  const size = document.getElementById("modalSize").value;
  const stock = getStockForProductSize(currentProduct, size);
  if (stock <= 0) {
    openOverStockEnquiryModal(currentProduct, size, 0, parseInt(document.getElementById("modalQty").value, 10) || 1);
    return;
  }

  const qty = parseInt(document.getElementById("modalQty").value, 10) || 1;
  const customNote = document.getElementById("modalCustom").value.trim();

  const alreadyInCartQty = cart
    .filter(item => item.id === currentProduct.id && item.size === size)
    .reduce((sum, item) => sum + item.qty, 0);

  if (alreadyInCartQty + qty > stock) {
    openOverStockEnquiryModal(currentProduct, size, stock, alreadyInCartQty + qty);
    return;
  }

  const existingIndex = cart.findIndex(item =>
    item.id === currentProduct.id && item.size === size && item.customNote === customNote
  );

  if (existingIndex > -1) {
    cart[existingIndex].qty = Math.min(stock, cart[existingIndex].qty + qty);
  } else {
    cart.push({
      ...currentProduct,
      size,
      qty: Math.min(stock, qty),
      customNote
    });
  }

  updateCartUI();
  closeProductModal();

  const cartCanvas = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("cartOffcanvas"));
  cartCanvas.show();
}

// ==========================================
// CART MANAGEMENT & REMOVAL CONFIRMATION POPUP
// ==========================================
function updateCartItemQty(index, delta) {
  const item = cart[index];
  if (!item) return;

  const newQty = item.qty + delta;
  if (newQty <= 0) {
    requestRemoveCartItem(index);
    return;
  }

  const prod = PRODUCTS.find(p => p.id === item.id);
  const maxStock = prod ? getStockForProductSize(prod, item.size) : item.availableStock;
  if (newQty > maxStock) {
    openOverStockEnquiryModal(prod || item, item.size, maxStock, newQty);
    return;
  }

  item.qty = newQty;
  updateCartUI();
}

function requestRemoveCartItem(index) {
  const item = cart[index];
  if (!item) return;
  pendingRemoveCartIndex = index;

  const imgEl = document.getElementById("removeCartItemImg");
  const titleEl = document.getElementById("removeCartItemTitle");
  const idEl = document.getElementById("removeCartItemId");
  const sizeEl = document.getElementById("removeCartItemSize");
  const priceEl = document.getElementById("removeCartItemPrice");

  if (imgEl) imgEl.src = (item.images && item.images[0]) || "assets/Categories/Comming-Soon.png";
  if (titleEl) titleEl.innerText = item.name;
  if (idEl) idEl.innerText = item.id;
  if (sizeEl) sizeEl.innerText = item.size || "Free Size";
  if (priceEl) priceEl.innerText = (item.price * item.qty);

  if (removeCartConfirmModalInstance) {
    removeCartConfirmModalInstance.show();
  } else if (confirm(`Remove ${item.name} (${item.id}) - Size: ${item.size} - ₹${item.price * item.qty} from cart?`)) {
    confirmRemoveCartItem();
  }
}

function confirmRemoveCartItem() {
  if (pendingRemoveCartIndex !== null && cart[pendingRemoveCartIndex]) {
    cart.splice(pendingRemoveCartIndex, 1);
  }
  pendingRemoveCartIndex = null;
  if (removeCartConfirmModalInstance) removeCartConfirmModalInstance.hide();
  updateCartUI();
}


function toggleCustomerQuickHub(ev) {
  if (ev) ev.stopPropagation();
  const menu = document.getElementById("customerQuickHubMenu");
  if (!menu) return;
  menu.classList.toggle("d-none");
}

function closeCustomerQuickHub() {
  const menu = document.getElementById("customerQuickHubMenu");
  if (menu) menu.classList.add("d-none");
}

document.addEventListener("click", (ev) => {
  const menu = document.getElementById("customerQuickHubMenu");
  const btn = document.getElementById("navQuickHubBtn");
  if (!menu || menu.classList.contains("d-none")) return;
  if (!menu.contains(ev.target) && (!btn || !btn.contains(ev.target))) {
    menu.classList.add("d-none");
  }
});

function refreshQuickHubBadge() {
  const hubBadge = document.getElementById("navQuickHubTotalBadge");
  if (!hubBadge) return;
  const cartQty = (cart || []).reduce((s, i) => s + (parseInt(i.qty, 10) || 1), 0);
  const ordCnt = parseInt(document.getElementById("navOrdersCount")?.textContent || "0", 10) || 0;
  const enqCnt = parseInt(document.getElementById("navEnquiriesCount")?.textContent || "0", 10) || 0;
  hubBadge.textContent = String(cartQty + ordCnt + enqCnt);
}

function updateCartUI() {
  const container = document.getElementById("cartItemsContainer");
  if (!container) return;
  const navCount = document.getElementById("navCartCount");
  const floatBtn = document.getElementById("floatingCartBtn");
  const savingsEl = document.getElementById("cartSavingsTotal");

  let totalQty = 0;
  let totalPrice = 0;
  let totalSavings = 0;

  if (cart.length === 0) {
    container.innerHTML = `<div class="text-center text-muted my-5"><i class="bi bi-bag-x fs-1"></i><p class="mt-2">Your cart is empty.</p></div>`;
    if (navCount) { navCount.innerText = "0"; navCount.classList.remove("d-none"); }
    document.getElementById("cartTotal").innerText = "0";
    if (savingsEl) savingsEl.innerText = "0";
    floatBtn.classList.add("d-none");
    refreshQuickHubBadge();
    return;
  }

  container.innerHTML = "";
  cart.forEach((item, index) => {
    totalQty += item.qty;
    totalPrice += item.price * item.qty;
    const itemActual = item.actualPrice && item.actualPrice > item.price ? item.actualPrice : item.price;
    totalSavings += (itemActual - item.price) * item.qty;
    const discPct = calcDiscountPercent(item.actualPrice, item.price);

    container.innerHTML += `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-2 d-flex gap-2 align-items-center">
          <img src="${item.images[0]}" style="width: 62px; height: 62px; object-fit: cover; border-radius: 8px;">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 flex-nowrap">
              <h6 class="mb-0 small fw-bold text-truncate">${esc(item.name)}</h6>
              ${discPct > 0 ? `<span class="discount-badge text-nowrap" style="font-size:9px;">${discPct}% OFF</span>` : ""}
            </div>
            <small class="text-muted d-block" style="font-size: 11px;">Size: ${esc(item.size)}</small>
            ${item.customNote ? `<small class="text-success d-block" style="font-size: 11px;"><strong>Note:</strong> ${esc(item.customNote)}</small>` : ""}
            <div class="d-flex justify-content-between align-items-center mt-1">
              <div>
                <span class="fw-bold small" style="color: var(--primary-green);">₹${item.price * item.qty}</span>
                ${itemActual > item.price ? `<span class="actual-price ms-1" style="font-size:11px;">₹${itemActual * item.qty}</span>` : ""}
              </div>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary py-0 px-2" onclick="updateCartItemQty(${index}, -1)">-</button>
                <span class="btn btn-light py-0 px-2 disabled text-dark fw-bold">${item.qty}</span>
                <button class="btn btn-outline-secondary py-0 px-2" onclick="updateCartItemQty(${index}, 1)">+</button>
              </div>
            </div>
          </div>
          <button class="btn btn-sm text-danger" onclick="requestRemoveCartItem(${index})" title="Remove item"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  });

  navCount.innerText = totalQty;
  document.getElementById("cartTotal").innerText = totalPrice;
  if (savingsEl) savingsEl.innerText = totalSavings;
  refreshQuickHubBadge();
  floatBtn.classList.remove("d-none");
  document.getElementById("floatCount").innerText = totalQty;
  document.getElementById("floatTotal").innerText = totalPrice;
}

// ==========================================
// DELIVERY & CONTACT VALIDATION + CITY SEARCH DROPDOWN
// ==========================================
function sanitizeAlphaInput(inputEl) {
  const raw = inputEl.value;
  const cleaned = raw.replace(/[^A-Za-z\s]/g, "");
  const hint = document.getElementById("custNameHint");
  if (raw !== cleaned) {
    inputEl.value = cleaned;
    if (hint) hint.classList.remove("d-none");
  } else if (hint) {
    hint.classList.add("d-none");
  }
}

function sanitizeTenDigitMobile(inputEl) {
  const digits = inputEl.value.replace(/[^0-9]/g, "").slice(0, 10);
  inputEl.value = digits;
  const hint = document.getElementById("custMobileHint");
  if (hint) {
    hint.classList.toggle("d-none", digits.length === 0 || digits.length === 10);
  }
}

function initCityAutocomplete() {
  const cityInput = document.getElementById("custCity");
  const dropdown = document.getElementById("citySuggestionsDropdown");
  if (!cityInput || !dropdown || typeof INDIAN_CITIES === "undefined") return;

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".city-autocomplete-wrap")) {
      dropdown.classList.add("d-none");
    }
  });
}

function toggleCityDropdownBtn() {
  const dropdown = document.getElementById("citySuggestionsDropdown");
  const cityInput = document.getElementById("custCity");
  if (!dropdown || !cityInput) return;
  if (!dropdown.classList.contains("d-none")) {
    dropdown.classList.add("d-none");
  } else {
    handleCityInput(cityInput.value);
    cityInput.focus();
  }
}

function handleCityInput(val) {
  const dropdown = document.getElementById("citySuggestionsDropdown");
  if (!dropdown || typeof INDIAN_CITIES === "undefined") return;

  const q = String(val || "").trim().toLowerCase();
  const matches = q
    ? INDIAN_CITIES.filter(c => c.toLowerCase().includes(q))
    : INDIAN_CITIES;

  if (matches.length === 0) {
    dropdown.innerHTML = `
      <div class="city-suggestion-item text-muted" onclick="document.getElementById('citySuggestionsDropdown').classList.add('d-none')">
        <i class="bi bi-pencil text-warning"></i>
        <span>Use custom city: "<strong>${esc(val.trim())}</strong>"</span>
      </div>`;
    dropdown.classList.remove("d-none");
    return;
  }

  dropdown.innerHTML = matches.map(city => `
    <div class="city-suggestion-item" onclick="selectCitySuggestion('${esc(city)}')">
      <i class="bi bi-geo-alt text-success"></i>
      <span>${esc(city)}</span>
    </div>
  `).join("");
  dropdown.classList.remove("d-none");
}

function selectCitySuggestion(cityName) {
  const input = document.getElementById("custCity");
  const dropdown = document.getElementById("citySuggestionsDropdown");
  if (input) input.value = cityName;
  if (dropdown) dropdown.classList.add("d-none");
}

function getSavedCustomer() {
  try {
    return JSON.parse(localStorage.getItem("riddhi_customer") || "null");
  } catch (e) {
    return null;
  }
}

function handleOrderSingleClick() {
  if (!currentProduct) return;
  const stock = Math.max(0, parseInt(currentProduct.availableStock, 10) || 0);
  if (stock <= 0) {
    alert("This item is currently out of stock (Available Soon). Please enquire via WhatsApp or Call.");
    return;
  }
  openCustomerModal("order_single");
}

function handleCheckoutCartClick() {
  if (!cart || cart.length === 0) {
    if (emptyCartModalInstance) {
      emptyCartModalInstance.show();
    } else {
      alert("Your cart is empty!");
    }
    return;
  }
  openCustomerModal("order_cart");
}

function exploreJewelleryFromEmptyCart() {
  if (emptyCartModalInstance) emptyCartModalInstance.hide();
  const cartEl = document.getElementById("cartOffcanvas");
  const cartInst = cartEl ? bootstrap.Offcanvas.getInstance(cartEl) : null;
  if (cartInst) cartInst.hide();
  openProductsView("All");
}

function openCustomerModal(actionType) {
  pendingAction = actionType;
  const saved = getSavedCustomer();
  if (saved) {
    document.getElementById("custName").value = (saved.name || "").replace(/[^A-Za-z\s]/g, "");
    document.getElementById("custMobile").value = String(saved.mobile || "").replace(/[^0-9]/g, "").slice(-10);
    document.getElementById("custAddress").value = saved.address || "";
    document.getElementById("custCity").value = saved.city || "";
    document.getElementById("custPincode").value = saved.pincode || "";
  }
  const hint = document.getElementById("custNameHint");
  if (hint) hint.classList.add("d-none");
  const mHint = document.getElementById("custMobileHint");
  if (mHint) mHint.classList.add("d-none");
  customerModalInstance.show();
}

function submitCustomerDetails(e) {
  e.preventDefault();
  const nameInput = document.getElementById("custName");
  const name = nameInput.value.replace(/[^A-Za-z\s]/g, "").trim();
  nameInput.value = name;

  const mobileInput = document.getElementById("custMobile");
  const mobile = mobileInput.value.replace(/[^0-9]/g, "");
  mobileInput.value = mobile;

  const address = document.getElementById("custAddress").value.trim();
  const city = document.getElementById("custCity").value.trim();
  const pincode = document.getElementById("custPincode").value.replace(/[^0-9]/g, "").trim();

  if (!name || !/^[A-Za-z\s]{2,60}$/.test(name)) {
    alert("Please enter a valid Full Name using alphabets only (A–Z).");
    nameInput.focus();
    return;
  }
  if (!/^[0-9]{10}$/.test(mobile)) {
    alert("Please enter an exact 10-digit Mobile / WhatsApp number.");
    mobileInput.focus();
    return;
  }
  if (!address || !city || !/^[0-9]{6}$/.test(pincode)) {
    alert("Please fill Complete Address, City, and a valid 6-digit Pincode.");
    return;
  }

  const customerObj = { name, mobile, address, city, pincode };
  localStorage.setItem("riddhi_customer", JSON.stringify(customerObj));
  if (customerObj.mobile) { localStorage.setItem("riddhi_customer_mobile_session", customerObj.mobile); updateCustomerAccountUI(); }
  pendingCustomerObj = customerObj;

  customerModalInstance.hide();
  openOrderConfirmationModal(customerObj);
}

// ==========================================
// ORDER REVIEW & CONFIRMATION MODAL FLOW
// ==========================================
function getPendingOrderPayload() {
  if (pendingAction === "order_single" && currentProduct) {
    const size = document.getElementById("modalSize").value;
    const qty = parseInt(document.getElementById("modalQty").value, 10) || 1;
    const customNote = document.getElementById("modalCustom").value.trim();
    const items = [{
      id: currentProduct.id,
      name: currentProduct.name,
      size,
      qty,
      price: currentProduct.price,
      note: customNote,
      image: currentProduct.images[0]
    }];
    const total = currentProduct.price * qty;
    return { items, total, isCart: false };
  }

  if (pendingAction === "order_cart" && cart.length > 0) {
    const items = cart.map(item => ({
      id: item.id,
      name: item.name,
      size: item.size,
      qty: item.qty,
      price: item.price,
      note: item.customNote || "",
      image: item.images[0]
    }));
    const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);
    return { items, total, isCart: true };
  }

  return null;
}

function openOrderConfirmationModal(cust) {
  const payload = getPendingOrderPayload();
  if (!payload) return;

  const previewBox = document.getElementById("confirmOrderPreviewBox");
  if (previewBox) {
    previewBox.innerHTML = buildSummaryHtml(payload.items, payload.total, cust);
  }
  if (orderConfirmModalInstance) {
    orderConfirmModalInstance.show();
  }
}

function editOrderDetailsFromConfirm() {
  if (orderConfirmModalInstance) orderConfirmModalInstance.hide();
  if (customerModalInstance) customerModalInstance.show();
}

function confirmAndSendOrderWhatsApp() {
  const cust = pendingCustomerObj || getSavedCustomer();
  const payload = getPendingOrderPayload();
  if (!cust || !payload) return;

  if (orderConfirmModalInstance) orderConfirmModalInstance.hide();

  if (payload.isCart) {
    executeOrderCart(cust);
  } else {
    executeOrderSingle(cust);
  }
}

// ==========================================
// ORDER EXECUTION + WHATSAPP MESSAGE (No Total Discount Saved, No Image Link, Real Emoji Icons)
// ==========================================
function formatCustomerBlock(cust) {
  return `👤 *Customer Details:*\n` +
         `• Name: ${cust.name}\n` +
         `• Mobile: ${cust.mobile}\n` +
         `• Address: ${cust.address}, ${cust.city} - ${cust.pincode}`;
}

function executeOrderSingle(cust) {
  const size = document.getElementById("modalSize").value;
  const qty = parseInt(document.getElementById("modalQty").value, 10) || 1;
  const customNote = document.getElementById("modalCustom").value.trim();
  const total = currentProduct.price * qty;

  let msg = `Hello *Jewellery by Riddhi*! ✨\n*NEW ORDER RECEIVED*\n\n`;
  msg += `🛍️ *Product:* ${currentProduct.name} (${currentProduct.id})\n`;
  msg += `• Size: ${size}\n`;
  msg += `• Qty: ${qty} x ₹${currentProduct.price} = *₹${total}*\n`;
  if (customNote) msg += `• Customization: _${customNote}_\n`;
  msg += `\n💰 *Grand Total Payable: ₹${total}*\n\n`;
  msg += formatCustomerBlock(cust);

  const items = [{
    id: currentProduct.id,
    category: currentProduct.category || "",
    name: currentProduct.name,
    size,
    qty,
    price: currentProduct.price,
    actualPrice: currentProduct.actualPrice || currentProduct.price,
    note: customNote,
    image: currentProduct.images[0],
    preOrderStock: Math.max(0, parseInt(currentProduct.availableStock, 10) || 0)
  }];

  deductStockForItems(items);

  const order = saveOrderToHistory({
    total, items, customer: cust,
    fullMessage: `📋 *Order Receipt - Jewellery by Riddhi*\n\n` + msg
  });

  dispatchOrderToSellerAndCustomer(msg, cust.mobile, buildSummaryHtml(items, total, cust));
  syncOrderToSheet(order);
}

function executeOrderCart(cust) {
  let grandTotal = 0;
  let msg = `Hello *Jewellery by Riddhi*! ✨\n*NEW MULTI-ITEM ORDER*\n\n`;

  const items = cart.map(item => {
    const pObj = PRODUCTS.find(p => p.id === item.id);
    return {
      id: item.id,
      category: item.category || (pObj ? pObj.category : "") || "",
      name: item.name,
      size: item.size,
      qty: item.qty,
      price: item.price,
      actualPrice: item.actualPrice || (pObj ? pObj.actualPrice : 0) || item.price,
      note: item.customNote || "",
      image: item.images[0],
      preOrderStock: pObj ? Math.max(0, parseInt(pObj.availableStock, 10) || 0) : 0
    };
  });

  items.forEach((item, idx) => {
    const sub = item.price * item.qty;
    grandTotal += sub;
    msg += `🛍️ *Product ${idx + 1}:* ${item.name} (${item.id})\n`;
    msg += `   • Size: ${item.size} | Qty: ${item.qty} | Price: ₹${sub}\n`;
    if (item.note) msg += `   • Customization: _${item.note}_\n`;
    msg += `\n`;
  });

  msg += `💰 *Grand Total Payable: ₹${grandTotal}*\n\n`;
  msg += formatCustomerBlock(cust);

  deductStockForItems(items);

  const order = saveOrderToHistory({
    total: grandTotal, items, customer: cust,
    fullMessage: `📋 *Order Receipt - Jewellery by Riddhi*\n\n` + msg
  });

  dispatchOrderToSellerAndCustomer(msg, cust.mobile, buildSummaryHtml(items, grandTotal, cust));
  syncOrderToSheet(order);

  cart = [];
  updateCartUI();
}

// ==========================================
// ORDER STATUS + CANCEL REASON + TOGGLEABLE AUTO-DELIVERED + ENGLISH STATUS MESSAGES
// ==========================================
const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Custom Making / Partial Stock Ready",
  "Packed",
  "Shipped",
  "Delivered",
  "Cancelled"
];

const EXACT_PLACED_NOTE = "We have received your order and will confirm it shortly. We will reach out to you via call or WhatsApp to complete the payment process; your order will be confirmed only after this step. Please complete the payment to confirm your order.";

const AUTO_DELIVER_MS = 5 * 24 * 60 * 60 * 1000; // 5 days after Shipped

const STATUS_META = {
  Pending: {
    label: "Order Placed",
    cls: "bg-secondary",
    msg: EXACT_PLACED_NOTE
  },
  Confirmed: {
    label: "Confirmation",
    cls: "bg-primary",
    msg: "Your order has been confirmed."
  },
  "Custom Making / Partial Stock Ready": {
    label: "Custom Making / Partial Stock Ready",
    cls: "bg-warning text-dark",
    msg: "Ready stock is reserved and custom making for remaining pieces is in progress."
  },
  Packed: {
    label: "Packed",
    cls: "bg-info text-dark",
    msg: "Your order has been packed."
  },
  Shipped: {
    label: "Shipped",
    cls: "bg-warning text-dark",
    msg: "Your order has been shipped."
  },
  Delivered: {
    label: "Delivered",
    cls: "bg-success",
    msg: "Your order has been delivered. Thank you!"
  },
  Cancelled: {
    label: "Cancelled",
    cls: "bg-danger",
    msg: "Your order has been cancelled."
  }
};

const STATUS_FLOW = ["Pending", "Confirmed", "Packed", "Shipped", "Delivered"];

function normStatus(st) {
  return ORDER_STATUSES.includes(st) ? st : "Pending";
}

function fmtStatusTime(ts) {
  return ts ? new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function autoDeliverLocalOrders() {
  if (!isAutoDeliverEnabled()) return;
  const orders = getLocalOrders();
  if (!orders.length) return;
  const now = Date.now();
  let changed = false;
  orders.forEach(o => {
    if (o.status === "Shipped" && o.statusUpdated && (now - Number(o.statusUpdated) >= AUTO_DELIVER_MS)) {
      o.status = "Delivered";
      o.statusUpdated = now;
      changed = true;
    }
  });
  if (changed) {
    localStorage.setItem("riddhi_orders", JSON.stringify(orders));
  }
}

function customerStatusHtml(ord) {
  const st = normStatus(ord.status);
  const meta = STATUS_META[st];
  let tracker = "";
  if (st !== "Cancelled") {
    const flowIdx = st === "Custom Making / Partial Stock Ready" ? 1 : STATUS_FLOW.indexOf(st);
    tracker = `<div class="d-flex align-items-center my-2" aria-hidden="true">` + STATUS_FLOW.map((step, i) => `
      <div class="text-center" style="flex:1;">
        <div class="mx-auto rounded-circle" style="width:12px;height:12px;background:${i <= flowIdx ? "var(--primary-green)" : "#d9d2c5"};"></div>
        <div style="font-size:9px;" class="${i <= flowIdx ? "fw-semibold" : "text-muted"}">${step === "Pending" ? "Placed" : (step === "Confirmed" ? "Confirmed" : step)}</div>
      </div>`).join("") + `</div>`;
  }
  const cancelNoteHtml = (st === "Cancelled" && ord.cancelReason)
    ? `<div class="mt-1 p-1 px-2 rounded bg-danger-subtle text-danger border border-danger-subtle" style="font-size:11px;"><strong>Cancellation Reason:</strong> ${esc(ord.cancelReason)}</div>`
    : "";

  return `
    <div class="p-2 rounded mb-2" style="background:#fdfaf5;border:1px solid #efe3d2;">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
        <span class="badge ${meta.cls}">${esc(meta.label)}</span>
        ${ord.statusUpdated ? `<span class="text-muted" style="font-size:10px;">Updated: ${esc(fmtStatusTime(ord.statusUpdated))}</span>` : ""}
      </div>
      ${tracker}
      <div class="text-dark mt-1" style="font-size:11px; line-height: 1.4;">${esc(meta.msg)}</div>
      ${cancelNoteHtml}
    </div>`;
}

// WhatsApp status message: NO image link, NO duplicate "Jewellery by Riddhi" signature at bottom
function buildOrderNotifyWhatsAppHref(orderId, status, custName, custMobile, cancelReason = "") {
  const st = normStatus(status);
  let wa = String(custMobile || "").replace(/[^0-9]/g, "");
  if (wa.length === 10) wa = "91" + wa;
  const reasonLine = (st === "Cancelled" && cancelReason) ? `\n📝 *Reason:* ${cancelReason}` : "";
  const text = `Hello *Jewellery by Riddhi* Customer ${custName || ""}! ✨\n📦 *Order ID:* ${orderId}\n📌 *Order Status:* *${STATUS_META[st].label}*${reasonLine}\n${STATUS_META[st].msg}`;
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

function updateOrderWhatsAppNotifyLink(orderId, overrideStatus = null, overrideReason = null) {
  const safeId = String(orderId || "");
  const btn = document.getElementById("waNotifyBtn_" + safeId);
  const sel = document.querySelector(`select[data-oid="${safeId}"]`);
  const st = normStatus(overrideStatus || (sel ? sel.value : "Pending"));
  const ordObj = (adminOrders || []).find(o => o.orderId === safeId) || getLocalOrders().find(o => o.orderId === safeId) || {};
  const cust = ordObj.customer || {};
  const reason = overrideReason !== null ? overrideReason : (ordObj.cancelReason || "");
  if (btn) {
    btn.href = buildOrderNotifyWhatsAppHref(safeId, st, cust.name || "", cust.mobile || "", reason);
  }
}

function adminStatusControl(orderId, status, custName, custMobile, cancelReason = "") {
  const st = normStatus(status);
  const href = buildOrderNotifyWhatsAppHref(orderId, st, custName, custMobile, cancelReason);
  return `
    <div class="my-2">
      <div class="d-flex flex-wrap align-items-center gap-2">
        <select class="form-select form-select-sm w-auto" data-oid="${esc(orderId)}" data-prev="${esc(st)}" onchange="adminChangeStatus(this)" aria-label="Order status">
          ${ORDER_STATUSES.map(x => `<option value="${x}" ${x === st ? "selected" : ""}>${STATUS_META[x].label}</option>`).join("")}
        </select>
        <a id="waNotifyBtn_${esc(orderId)}" href="${href}" target="_blank" rel="noopener" class="btn btn-outline-success btn-sm py-0 px-2" style="font-size:11px;"><i class="bi bi-whatsapp"></i> Notify Customer</a>
      </div>
      ${st === "Cancelled" && cancelReason ? `<div class="small text-danger mt-1" style="font-size:11px;"><i class="bi bi-info-circle me-1"></i><strong>Cancel Reason:</strong> ${esc(cancelReason)}</div>` : ""}
    </div>`;
}

function adminChangeStatus(sel) {
  const orderId = sel.dataset.oid;
  const status = sel.value;
  updateOrderWhatsAppNotifyLink(orderId, status);
  if (status !== "Cancelled") {
    if (!confirm(`Confirm updating Order ${orderId} status to "${STATUS_META[status]?.label || status}"?`)) {
      sel.value = sel.dataset.prev || "Pending";
      return;
    }
  }

  if (status === "Cancelled") {
    pendingCancelOrderId = orderId;
    const idLabel = document.getElementById("cancelModalOrderId");
    if (idLabel) idLabel.innerText = orderId;
    const reasonSel = document.getElementById("adminCancelReasonSelect");
    const reasonNote = document.getElementById("adminCancelReasonNote");
    if (reasonSel) reasonSel.selectedIndex = 0;
    if (reasonNote) reasonNote.value = "";
    if (adminCancelModalInstance) {
      adminCancelModalInstance.show();
    } else {
      const typed = prompt("Why is this order being cancelled? Enter reason for customer:");
      if (typed && typed.trim()) {
        applyAdminStatusUpdate(orderId, "Cancelled", typed.trim(), sel);
      } else {
        sel.value = sel.dataset.prev || "Pending";
      }
    }
    return;
  }

  applyAdminStatusUpdate(orderId, status, "", sel);
}

function closeAdminCancelModal() {
  pendingCancelOrderId = null;
  if (adminCancelModalInstance) adminCancelModalInstance.hide();
  renderAllCustomersSummary();
  renderAdminEnquiriesList();
  renderMyOrders();
}

function toggleCustomCancelNote() {
  const sel = document.getElementById("adminCancelReasonSelect");
  const noteEl = document.getElementById("adminCancelReasonNote");
  if (!sel || !noteEl) return;
  if (sel.value === "Other") {
    noteEl.placeholder = "Please write the exact cancellation reason...";
    noteEl.focus();
  } else {
    noteEl.placeholder = "Write note or custom reason so customer knows why it was cancelled...";
  }
}

async function submitAdminCancelOrder() {
  if (!pendingCancelOrderId) return;
  const reasonDrop = document.getElementById("adminCancelReasonSelect").value;
  const extraNote = document.getElementById("adminCancelReasonNote").value.trim();

  if (reasonDrop === "Other" && !extraNote) {
    alert("Please enter the cancellation reason in the note box.");
    document.getElementById("adminCancelReasonNote").focus();
    return;
  }

  const combinedReason = extraNote
    ? (reasonDrop === "Other" ? extraNote : `${reasonDrop} — ${extraNote}`)
    : reasonDrop;

  const btn = document.getElementById("confirmCancelOrderBtn");
  if (btn) btn.disabled = true;

  const oid = pendingCancelOrderId;
  pendingCancelOrderId = null;
  if (adminCancelModalInstance) adminCancelModalInstance.hide();

  updateOrderWhatsAppNotifyLink(oid, "Cancelled", combinedReason);
  await applyAdminStatusUpdate(oid, "Cancelled", combinedReason, null);
  if (btn) btn.disabled = false;
}

async function applyAdminStatusUpdate(orderId, status, cancelReason = "", selEl = null) {
  const s = getAdminSession();
  if (!s) return;
  if (selEl) selEl.disabled = true;
  try {
    let updated = Date.now();
    if (s.mode === "sheet") {
      const r = await callScript({ action: "updateStatus", token: s.token, orderId, status, cancelReason });
      if (!r.ok) {
        if (r.error === "auth") {
          localStorage.removeItem("riddhi_admin_session"); sessionStorage.removeItem("riddhi_admin_session");
          updateCustomerAccountUI();
  updateAdminMenuLabel();
          alert("Session expired. Please login as admin again.");
          return;
        }
        throw new Error(r.error || "failed");
      }
      updated = r.statusUpdated || updated;
    } else {
      const orders = getLocalOrders();
      const o = orders.find(x => x.orderId === orderId);
      if (o) {
        if (status === "Cancelled" && o.status !== "Cancelled" && Array.isArray(o.items)) {
          o.items.forEach(it => {
            const prod = PRODUCTS.find(p => p.id === it.id);
            const q = Math.max(1, parseInt(it.qty, 10) || 1);
            const sz = it.size || (prod && prod.sizes && prod.sizes[0]) || "Free Size (Adjustable Dori)";
            if (prod && prod.sizeStock && Object.prototype.hasOwnProperty.call(prod.sizeStock, sz)) {
              prod.sizeStock[sz] = (parseInt(prod.sizeStock[sz], 10) || 0) + q;
              prod.availableStock = Object.values(prod.sizeStock).reduce((s, v) => s + (Math.max(0, parseInt(v, 10) || 0)), 0);
            }
          });
          savePersistedStock();
          refreshAllProductViews();
        }
        o.status = status;
        o.cancelReason = status === "Cancelled" ? cancelReason : "";
        o.statusUpdated = updated;
        localStorage.setItem("riddhi_orders", JSON.stringify(orders));
      }
    }
    const mine = adminOrders.find(x => x.orderId === orderId);
    if (mine) {
      mine.status = status;
      mine.cancelReason = status === "Cancelled" ? cancelReason : "";
      mine.statusUpdated = updated;
    }
  } catch (e) {
    alert("Status update failed. Please check internet and try again.");
  } finally {
    if (selEl) selEl.disabled = false;
    renderAllCustomersSummary();
    renderMyOrders();
  }
}

function getCustomerLookupMobile() {
  // Strictly require active customer mobile login session so no history is shown without login
  return getCustomerSessionMobile();
}

async function promptCustomerMobileSync() {
  const inp = prompt("Enter your 10-digit Mobile Number to load all your Orders & Enquiries from any device:");
  if (!inp) return;
  const digits = inp.replace(/[^0-9]/g, "").slice(-10);
  if (digits.length !== 10) {
    alert("Please enter a valid 10-digit mobile number.");
    return;
  }
  const existing = getSavedCustomer() || { name: "", address: "", city: "", pincode: "" };
  existing.mobile = digits;
  localStorage.setItem("riddhi_customer", JSON.stringify(existing));
  await refreshMyOrderStatuses();
}

async function refreshMyOrderStatuses(forceReplace = false) {
  autoDeliverLocalOrders();
  if (!APPS_SCRIPT_URL || !isCustomerStorefrontPage()) return;

  // 1. Cross-device full sync by customer's 10-digit mobile number!
  const lookupMob = getCustomerLookupMobile();
  if (lookupMob) {
    try {
      const mobRes = await callScript({ action: "getOrdersByMobile", mobile: lookupMob });
      if (mobRes && mobRes.ok) {
        const ordClearedAt = forceReplace ? 0 : Number(localStorage.getItem("riddhi_orders_cleared_at") || 0);
        if (Array.isArray(mobRes.orders)) {
          const localOrds = forceReplace ? [] : getLocalOrders();
          const mergedMap = {};
          localOrds.forEach(o => { if (o && o.orderId) mergedMap[o.orderId] = o; });
          mobRes.orders.forEach(so => {
            if (so && so.orderId && (Number(so.timestamp) || 0) > ordClearedAt) {
              mergedMap[so.orderId] = { ...(mergedMap[so.orderId] || {}), ...so };
            }
          });
          const mergedArr = Object.values(mergedMap).sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
          localStorage.setItem("riddhi_orders", JSON.stringify(mergedArr));
          // Auto-fill saved customer profile from latest order if name/address was empty
          if (mergedArr.length > 0 && mergedArr[0].customer) {
            const latestC = mergedArr[0].customer;
            const curC = getSavedCustomer() || {};
            if (!curC.name && latestC.name) {
              localStorage.setItem("riddhi_customer", JSON.stringify({ ...latestC, mobile: lookupMob }));
            }
          }
        }
        const enqClearedAt = forceReplace ? 0 : Number(localStorage.getItem("riddhi_enquiries_cleared_at") || 0);
        if (Array.isArray(mobRes.enquiries)) {
          let localEnqs = [];
          if (!forceReplace) {
            try { localEnqs = JSON.parse(localStorage.getItem("riddhi_enquiries") || "[]"); } catch (e) {}
          }
          const eqMap = {};
          localEnqs.forEach(q => { if (q && q.enquiryId) eqMap[q.enquiryId] = q; });
          mobRes.enquiries.forEach(sq => {
            if (sq && sq.enquiryId && (Number(sq.timestamp) || 0) > enqClearedAt) {
              eqMap[sq.enquiryId] = { ...(eqMap[sq.enquiryId] || {}), ...sq };
            }
          });
          const mergedEqs = Object.values(eqMap).sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
          localStorage.setItem("riddhi_enquiries", JSON.stringify(mergedEqs));
        }
        renderMyOrders();
        if (activeCustomerTab === "enquiries") renderCustomerMyEnquiriesTab();
      }
    } catch (e) {}
  }

  const orders = getLocalOrders();
  if (!orders.length) return;
  try {
    const list = orders.slice(0, 30).map(o => ({ orderId: o.orderId, mobile: (o.customer || {}).mobile }));
    const r = await callScript({ action: "orderStatus", orders: list });
    if (!r.ok || !r.statuses) return;
    let changed = false;
    const fresh = getLocalOrders();
    fresh.forEach(o => {
      const st = r.statuses[o.orderId];
      if (st && (o.status !== st.status || o.statusUpdated !== st.updated || (o.cancelReason || "") !== (st.cancelReason || ""))) {
        o.status = st.status;
        o.statusUpdated = st.updated;
        o.cancelReason = st.cancelReason || "";
        changed = true;
      }
    });
    if (changed) localStorage.setItem("riddhi_orders", JSON.stringify(fresh));

    try {
      const localEnqs = JSON.parse(localStorage.getItem("riddhi_enquiries") || "[]");
      if (localEnqs.length > 0) {
        const er = await callScript({
          action: "enquiryStatus",
          enquiries: localEnqs.slice(0, 30).map(x => ({ enquiryId: x.enquiryId, mobile: x.mobile }))
        });
        if (er && er.ok && er.statuses) {
          let eChanged = false;
          localEnqs.forEach(x => {
            if (er.statuses[x.enquiryId] && x.status !== er.statuses[x.enquiryId].status) {
              x.status = er.statuses[x.enquiryId].status;
              eChanged = true;
            }
          });
          if (eChanged) localStorage.setItem("riddhi_enquiries", JSON.stringify(localEnqs));
        }
      }
    } catch (ee) {}

    renderMyOrders();
  } catch (e) { /* offline fallback */ }
}

function safeImgUrl(u) {
  const raw = String(u || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  const full = getFullImageUrl(raw);
  return /^(https?:\/\/|assets\/)/i.test(full) ? full : raw;
}


async function adminAllocateOrderItemQty(orderId, itemIndex, maxOrderedQty) {
  const s = getAdminSession();
  if (!s) return;
  const inputVal = prompt(`Customer ordered ${maxOrderedQty} pc(s). Enter exact quantity to give to customer (remaining ${maxOrderedQty} - qty will return to stock):`, String(Math.max(1, Math.floor(maxOrderedQty / 2))));
  if (inputVal === null) return;
  const targetQty = Math.max(0, Math.min(maxOrderedQty, parseInt(inputVal, 10) || 0));

  try {
    if (s.mode === "sheet" && APPS_SCRIPT_URL) {
      const r = await callScript({
        action: "allocateOrderQty",
        token: s.token,
        orderId,
        itemIndex,
        newQty: targetQty
      });
      if (!r || !r.ok) {
        alert("Could not update allocated quantity in Google Sheet.");
        return;
      }
      const ord = adminOrders.find(o => o.orderId === orderId);
      if (ord && Array.isArray(ord.items) && ord.items[itemIndex]) {
        ord.items[itemIndex].qty = targetQty;
        if (typeof r.total === "number") ord.total = r.total;
      }
      if (r.sizeStock) {
        PRODUCTS.forEach(p => {
          if (r.sizeStock[p.id]) {
            p.sizeStock = { ...r.sizeStock[p.id] };
            p.sizes = Object.keys(p.sizeStock);
            p.availableStock = Object.values(p.sizeStock).reduce((sum, v) => sum + (Math.max(0, parseInt(v, 10) || 0)), 0);
          }
        });
        savePersistedStock();
      }
    }
    alert(`Allocated ${targetQty} pc(s) to customer and restored ${maxOrderedQty - targetQty} pc(s) to stock.`);
    if (typeof renderOrdersWorkspace === "function") renderOrdersWorkspace();
    renderAllCustomersSummary();
  } catch (e) {
    alert("Error allocating quantity.");
  }
}

function buildItemsHtml(items, orderId = "") {
  const showAlloc = !isCustomerStorefrontPage() && isAdminLoggedIn() && orderId;
  return (items || []).map((it, idx) => `
    <div class="mb-1 d-flex gap-2 align-items-start justify-content-between">
      <div class="d-flex gap-2 align-items-start">
        ${safeImgUrl(it.image) ? `<img src="${esc(safeImgUrl(it.image))}" alt="" referrerpolicy="no-referrer" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;">` : ""}
        <div><strong>${esc(it.name)}</strong> (${esc(it.id)})<br>
        <span class="text-muted" style="font-size:11px;">Size: ${esc(it.size)} | Qty: <strong>${esc(it.qty)}</strong> | ₹${esc(it.price * it.qty)}${it.note ? ` | Note: ${esc(it.note)}` : ""}</span></div>
      </div>
      ${showAlloc ? `<button type="button" class="btn btn-outline-warning text-dark btn-sm py-0 px-2" style="font-size:10px;" onclick="adminAllocateOrderItemQty('${esc(orderId)}', ${idx}, ${Math.max(1, parseInt(it.qty, 10) || 1)})" title="Give partial quantity to customer & restore rest to stock"><i class="bi bi-sliders"></i> Split Qty</button>` : ""}
    </div>`).join("");
}

function buildSummaryHtml(items, total, cust) {
  return `
    <div class="small">
      ${buildItemsHtml(items)}
      <div class="fw-bold mt-1" style="color: var(--primary-green);">Grand Total Payable: ₹${esc(total)}</div>
      <hr class="my-2">
      <div class="fw-semibold text-dark">👤 ${esc(cust.name)} (${esc(cust.mobile)})</div>
      <div class="text-muted">${esc(cust.address)}, ${esc(cust.city)} - ${esc(cust.pincode)}</div>
    </div>`;
}

function dispatchOrderToSellerAndCustomer(orderMessage, customerMobile, summaryHtml = "") {
  sendWhatsAppUrl(WHATSAPP_NUMBER, orderMessage);

  let cleanCustPhone = customerMobile.replace(/[^0-9]/g, "").slice(-10);
  if (cleanCustPhone.length === 10) cleanCustPhone = "91" + cleanCustPhone;

  const customerCopyMsg =
    `📋 *Order Receipt - Jewellery by Riddhi*\n` +
    `${EXACT_PLACED_NOTE}\n\n` +
    orderMessage;

  const custWaUrl = `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(customerCopyMsg)}`;

  closeProductModal();
  const cartEl = document.getElementById("cartOffcanvas");
  const cartOffcanvasInst = bootstrap.Offcanvas.getInstance(cartEl);
  if (cartOffcanvasInst) cartOffcanvasInst.hide();

  const summaryBox = document.getElementById("successOrderSummaryBox");
  const custBtn = document.getElementById("customerWhatsAppCopyBtn");
  if (summaryBox) summaryBox.innerHTML = summaryHtml;
  if (custBtn) custBtn.href = custWaUrl;
  if (orderSuccessModalInstance) orderSuccessModalInstance.show();
}

function sendWhatsAppUrl(phone, text) {
  const encoded = encodeURIComponent(text);
  window.open(`https://wa.me/${phone}?text=${encoded}`, "_blank");
}

// ==========================================
// SHIPPING & RETURN POLICY POPUP MODAL
// ==========================================
function openPolicyModal(type) {
  const titleEl = document.getElementById("policyModalTitle");
  const bodyEl = document.getElementById("policyModalBody");

  if (type === "shipping") {
    titleEl.innerHTML = `<i class="bi bi-truck me-2"></i>Shipping Policy`;
    bodyEl.innerHTML = `
      <h6 class="fw-bold" style="color: var(--primary-green);">Made with Love, Delivered with Care ❤️</h6>
      <p class="small text-muted">Every piece at <strong>Jewellery by Riddhi</strong> is thoughtfully handmade to order or carefully quality-checked before it makes its way to you. We ensure every order is prepared with love and attention to detail.</p>
      <h6 class="fw-bold" style="color: var(--primary-green);">🚚 Delivery at Your Doorstep</h6>
      <p class="small text-muted mb-1">We deliver across India with trusted courier partners.</p>
      <ul class="small text-muted mb-3">
        <li><strong>Within Pune:</strong> Delivered within <strong>7–8 business days</strong>.</li>
        <li><strong>Outside Pune:</strong> Delivered within <strong>12–15 business days</strong>.</li>
      </ul>
      <h6 class="fw-bold" style="color: var(--primary-green);">📦 Shipping Charges</h6>
      <p class="small text-muted mb-2">Shipping charges are applicable on all orders and will be communicated before order confirmation.</p>
      <p class="small fw-semibold mb-0" style="color: var(--primary-green);">Thank you for choosing Jewellery by Riddhi. Every piece is made special, just for you! ✨</p>
    `;
  } else {
    titleEl.innerHTML = `<i class="bi bi-arrow-counterclockwise me-2"></i>Return &amp; Replacement Policy`;
    bodyEl.innerHTML = `
      
<h6 class="fw-bold" style="color: var(--primary-green);">
  ↩️ Return &amp; Replacement Policy
</h6>

<p class="small text-muted">
  At <strong>Jewellery by Riddhi</strong>, every piece is crafted with care and attention to detail. As our jewellery is carefully made and inspected before dispatch, we follow a strict <strong>No Return &amp; No Replacement Policy</strong>.
</p>

<p class="small fw-semibold text-dark mb-1">
  📌 Please note the following before placing your order:
</p>

<ul class="small text-muted mb-3">
  <li><strong>🚫 No Returns:</strong> Once an order is placed and confirmed, it cannot be returned or refunded.</li>

  <li><strong>🔄 No Replacements:</strong> We do not offer replacements for products due to personal preferences, colour differences, design choices, or incorrect size selection.</li>

  <li><strong>🛍️ Order Confirmation:</strong> Please review your product details, size, design, and other specifications carefully before confirming your purchase.</li>

  <li><strong>📦 Damaged Products:</strong> If you receive a product that is damaged during transit, please contact us within <strong>24 hours of delivery</strong> with clear photos and an unboxing video for review.</li>
</ul>

<p class="small text-muted mb-2">
  We request you to shop thoughtfully and feel free to contact us if you have any questions before placing your order.
</p>

<p class="small text-muted mb-2">
  <strong>📞 Contact Us:</strong>
  <a href="tel:+91918412981213" class="text-decoration-none fw-semibold" style="color: var(--primary-green);">
    +91 84129 81213
  </a>
  <span class="mx-1">|</span>
  <a href="https://wa.me/918412981213" target="_blank" class="text-decoration-none fw-semibold" style="color: var(--primary-green);">
    <i class="fab fa-whatsapp"></i> WhatsApp Us
  </a>
</p>

<p class="small fw-semibold mb-0" style="color: var(--primary-green);">
  ❤️ Thank you for choosing Jewellery by Riddhi. We truly appreciate your trust and support!
</p>

    `;
  }

  policyModalInstance.show();
}

// ==========================================
// MY ORDERS HISTORY + BY STATUS & DATE-WISE FILTERS
// ==========================================
function getLocalOrders() {
  try {
    return JSON.parse(localStorage.getItem("riddhi_orders") || "[]");
  } catch (e) {
    return [];
  }
}

function saveOrderToHistory(orderRecord) {
  const order = {
    orderId: "ORD-" + Date.now().toString().slice(-6) + Math.floor(10 + Math.random() * 90),
    timestamp: Date.now(),
    date: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    status: "Pending",
    cancelReason: "",
    ...orderRecord
  };
  try {
    const orders = getLocalOrders();
    orders.unshift(order);
    localStorage.setItem("riddhi_orders", JSON.stringify(orders));
    renderMyOrders();
  } catch (e) {
    console.error("Failed to save order history", e);
  }
  return order;
}

let activeCustomerTab = "orders";

function switchCustomerActivityTab(tabName) {
  activeCustomerTab = tabName === "enquiries" ? "enquiries" : "orders";
  const btnOrders = document.getElementById("tabBtnMyOrders");
  const btnEnq = document.getElementById("tabBtnMyEnquiries");
  const paneOrders = document.getElementById("customerMyOrdersTabPane");
  const paneEnq = document.getElementById("customerMyEnquiriesTabPane");

  if (btnOrders) btnOrders.classList.toggle("active", activeCustomerTab === "orders");
  if (btnEnq) btnEnq.classList.toggle("active", activeCustomerTab === "enquiries");
  if (paneOrders) paneOrders.classList.toggle("d-none", activeCustomerTab !== "orders");
  if (paneEnq) paneEnq.classList.toggle("d-none", activeCustomerTab !== "enquiries");

  if (activeCustomerTab === "enquiries") {
    renderCustomerMyEnquiriesTab();
  } else {
    renderMyOrders();
  }
}

function toggleCustOrderCustomDate() {
  const v = document.getElementById("myOrdersDateFilter")?.value;
  document.getElementById("custOrderCustomDateWrap")?.classList.toggle("d-none", v !== "custom");
}

function toggleCustEnquiryCustomDate() {
  const v = document.getElementById("myEnquiriesDateFilter")?.value;
  document.getElementById("custEnquiryCustomDateWrap")?.classList.toggle("d-none", v !== "custom");
}

function matchesCustomerDateFilter(ts, dateStr, bucket, customIso) {
  if (!bucket || bucket === "all") return true;
  const numTs = Number(ts) || 0;
  const d = numTs ? new Date(numTs) : null;
  const now = new Date();
  if (bucket === "today") {
    if (!d || isNaN(d.getTime())) return false;
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  if (bucket === "7d") return numTs && (Date.now() - numTs <= 7 * 24 * 60 * 60 * 1000);
  if (bucket === "30d") return numTs && (Date.now() - numTs <= 30 * 24 * 60 * 60 * 1000);
  if (bucket === "3m") return numTs && (Date.now() - numTs <= 90 * 24 * 60 * 60 * 1000);
  if (bucket === "custom") {
    if (!customIso || !d || isNaN(d.getTime())) return true;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}` === customIso;
  }
  return true;
}

function renderCustomerMyEnquiriesTab() {
  const container = document.getElementById("myEnquiriesTabListContainer");
  if (!container) return;

  const loggedCustMob = getCustomerSessionMobile();
  let enqs = [];
  if (loggedCustMob) {
    try {
      const parsedE = JSON.parse(localStorage.getItem("riddhi_enquiries") || "[]");
      if (Array.isArray(parsedE)) {
        enqs = parsedE.filter(eq => {
          const eqMob = String(eq.mobile || eq.customerMobile || "").replace(/[^0-9]/g, "").slice(-10);
          return !eqMob || eqMob === loggedCustMob;
        });
      }
    } catch (e) {}
  }
  const enqNavB = document.getElementById("navEnquiriesCount");
  if (enqNavB) {
    if (enqs.length > 0) {
      enqNavB.innerText = enqs.length;
      enqNavB.classList.remove("d-none");
    } else {
      enqNavB.classList.add("d-none");
    }
  }
  if (!loggedCustMob) {
    container.innerHTML = `
      <div class="text-center text-muted my-4 p-3 bg-white rounded-3 border shadow-sm">
        <i class="bi bi-chat-dots fs-1 text-warning"></i>
        <p class="small text-muted my-2">Login with your mobile number to view your enquiries.</p>
        <button type="button" class="btn btn-green btn-sm rounded-pill px-4" onclick="openCustomerMobileLoginModal()">
          <i class="bi bi-phone me-1"></i> Login with Mobile No.
        </button>
      </div>`;
    return;
  }

  const stFilter = document.getElementById("myEnquiriesStatusFilter")?.value || "all";
  const dateFilter = document.getElementById("myEnquiriesDateFilter")?.value || "all";
  const customIso = document.getElementById("custEnquiryCustomDateInput")?.value || "";

  const filtered = (Array.isArray(enqs) ? enqs : []).filter(eq => {
    const st = eq.status || "New Enquiry";
    if (stFilter !== "all" && st !== stFilter) return false;
    return matchesCustomerDateFilter(eq.timestamp, eq.date, dateFilter, customIso);
  });

  const refreshBtn = (APPS_SCRIPT_URL && filtered.length > 0)
    ? `<button type="button" class="btn btn-outline-dark btn-sm w-100 mb-3 rounded-pill" onclick="refreshMyOrderStatuses()"><i class="bi bi-arrow-clockwise me-1"></i>Refresh Enquiry Status</button>`
    : "";

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted my-4">
        <i class="bi bi-chat-dots fs-1"></i>
        <p class="mt-2 small">No enquiries found.</p>
      </div>`;
    return;
  }

  container.innerHTML = refreshBtn + filtered.map(eq => {
    const st = eq.status || "New Enquiry";
    const badgeCls = (st === "Confirmed" || st === "Completed")
      ? "bg-success"
      : (st === "Contacted" ? "bg-info text-dark" : (st === "Closed" ? "bg-danger" : "bg-warning text-dark"));

    return `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-3 small">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge bg-dark">${esc(eq.enquiryId)}</span>
            <span class="badge ${badgeCls}">${esc(st)}</span>
          </div>
          ${eq.date ? `<div class="text-muted mb-1" style="font-size: 11px;"><i class="bi bi-clock me-1"></i>${esc(eq.date)}</div>` : ""}
          <div class="d-flex gap-2 align-items-center my-1">
            <img src="${esc(safeImgUrl(eq.image) || 'assets/Categories/Comming-Soon.png')}" alt="" referrerpolicy="no-referrer" style="width:46px;height:46px;object-fit:cover;border-radius:8px;border:1px solid #eadbc8;flex-shrink:0;" onerror="handleSmartImgError(this, 'assets/Categories/Comming-Soon.png');">
            <div class="fw-bold text-dark">${esc(eq.productName)} (${esc(eq.productId)})</div>
          </div>
          <div class="text-muted mt-1" style="font-size: 11px;">
            Size: <strong>${esc(eq.size)}</strong> | Ready Stock: <strong>${esc(eq.availableStock)}</strong> | Needed: <strong>${esc(eq.requestedQty)}</strong>
            ${Number(eq.extraQty) > 0 ? ` | <span class="text-danger fw-bold">Extra: ${esc(eq.extraQty)}</span>` : ""}
          </div>
          ${eq.note ? `<div class="text-success mt-1" style="font-size: 11px;"><strong>Note:</strong> ${esc(eq.note)}</div>` : ""}
          <div class="mt-2 p-2 rounded bg-light text-dark" style="font-size: 11px;">
            ${esc(ENQUIRY_STATUS_DESC[st] || "")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderMyOrders() {
  autoDeliverLocalOrders();
  const container = document.getElementById("myOrdersListContainer");
  const badge = document.getElementById("navOrdersCount");
  const adminView = isAdminLoggedIn() && !isCustomerStorefrontPage();

  const loggedCustMob = getCustomerSessionMobile();
  let allOrders = [];
  if (adminView) {
    allOrders = adminOrders.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } else if (loggedCustMob) {
    allOrders = getLocalOrders().filter(o => String((o.customer || {}).mobile || "").replace(/[^0-9]/g, "").slice(-10) === loggedCustMob);
  }

  let enqsList = [];
  if (!adminView && loggedCustMob) {
    try {
      const rawE = JSON.parse(localStorage.getItem("riddhi_enquiries") || "[]");
      if (Array.isArray(rawE)) {
        enqsList = rawE.filter(eq => String(eq.mobile || "").replace(/[^0-9]/g, "").slice(-10) === loggedCustMob);
      }
    } catch (e) {}
  }

  if (badge) {
    if (allOrders.length > 0) {
      badge.innerText = allOrders.length;
      badge.classList.remove("d-none");
    } else {
      badge.classList.add("d-none");
    }
  }
  const enqBadge = document.getElementById("navEnquiriesCount");
  if (enqBadge) {
    if (enqsList.length > 0) {
      enqBadge.innerText = enqsList.length;
      enqBadge.classList.remove("d-none");
    } else {
      enqBadge.classList.add("d-none");
    }
  }

  if (!adminView && !loggedCustMob && container) {
    container.innerHTML = `
      <div class="text-center text-muted my-5 p-3 bg-white rounded-3 border shadow-sm">
        <i class="bi bi-shield-lock fs-1 text-success"></i>
        <h6 class="brand-font fw-bold mt-2 text-dark">Customer Login Required</h6>
        <p class="small text-muted mb-3">Please login with your 10-digit mobile number to view your orders &amp; enquiries.</p>
        <button type="button" class="btn btn-green btn-sm rounded-pill px-4 fw-semibold" onclick="openCustomerMobileLoginModal()">
          <i class="bi bi-phone me-1"></i> Login with Mobile No.
        </button>
      </div>`;
    return;
  }

  const warn = adminView && (getAdminSession() || {}).mode === "local"
    ? `<div class="alert alert-warning small py-2"><strong>Google Sheet not connected.</strong> Showing local device orders only.</div>`
    : "";

  const titleEl = document.querySelector("#myOrdersOffcanvas .offcanvas-title");
  if (titleEl) titleEl.innerHTML = adminView
    ? `<i class="bi bi-receipt-cutoff me-2"></i>All Orders (Admin)`
    : `<i class="bi bi-receipt-cutoff me-2"></i>My Placed Orders`;
  const footEl = document.querySelector("#myOrdersOffcanvas .border-top");
  if (footEl) footEl.classList.toggle("d-none", adminView);

  if (!container) return;

  const statusFilter = document.getElementById("myOrdersStatusFilter")?.value || "all";
  const dateFilter = document.getElementById("myOrdersDateFilter")?.value || "all";
  const customIso = document.getElementById("custOrderCustomDateInput")?.value || "";

  const orders = allOrders.filter(ord => {
    const st = normStatus(ord.status);
    if (statusFilter !== "all") {
      if (statusFilter === "Confirmed") {
        if (!["Confirmed", "Custom Making / Partial Stock Ready", "Packed"].includes(st)) return false;
      } else if (st !== statusFilter) {
        return false;
      }
    }

    return matchesCustomerDateFilter(ord.timestamp, ord.date, dateFilter, customIso);
  });

  if (orders.length === 0) {
    container.innerHTML = warn + `
      <div class="text-center text-muted my-5">
        <i class="bi bi-receipt fs-1"></i>
        <p class="mt-2 small">${allOrders.length === 0
          ? (adminView ? "No orders yet." : "You haven't placed any orders on this device yet.")
          : "No orders match the selected status or date filter."}</p>
      </div>`;
    return;
  }

  const refreshBtn = (!adminView && APPS_SCRIPT_URL)
    ? `<div class="mb-3">
         <button type="button" class="btn btn-outline-dark btn-sm w-100 rounded-pill" style="font-size:11px;" onclick="refreshMyOrderStatuses()"><i class="bi bi-arrow-clockwise me-1"></i>Refresh Order Status</button>
       </div>`
    : "";

  container.innerHTML = warn + refreshBtn + orders.map(ord => {
    const cust = ord.customer || {};
    let cleanCustPhone = (cust.mobile || "").replace(/[^0-9]/g, "").slice(-10);
    if (cleanCustPhone.length === 10) cleanCustPhone = "91" + cleanCustPhone;
    const waSelfUrl = adminView
      ? `https://wa.me/${cleanCustPhone}`
      : `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(ord.fullMessage || "")}`;
    const waLabel = adminView ? "Chat with Customer" : "Send Copy to My WhatsApp";
    const itemsHtml = ord.items ? buildItemsHtml(ord.items, ord.orderId) : (ord.itemsHtml || "");
    const statusHtml = adminView
      ? adminStatusControl(ord.orderId, ord.status, cust.name, cust.mobile, ord.cancelReason || "")
      : customerStatusHtml(ord);

    return `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-3 small">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge" style="background-color: var(--primary-green);">${esc(ord.orderId)}</span>
            <span class="fw-bold" style="color: var(--primary-green);">₹${esc(ord.total)}</span>
          </div>
          <div class="text-muted mb-2" style="font-size: 11px;"><i class="bi bi-clock me-1"></i>${esc(ord.date)}</div>
          ${statusHtml}
          <div class="mb-2">${itemsHtml}</div>
          <div class="p-2 rounded bg-light text-muted mb-2" style="font-size: 11px;">
            <strong class="text-dark">👤 ${esc(cust.name)}</strong> (${esc(cust.mobile)})<br>
            ${esc(cust.address)}, ${esc(cust.city)} - ${esc(cust.pincode)}
          </div>
          <a href="${waSelfUrl}" target="_blank" rel="noopener" class="btn btn-outline-success btn-sm w-100 rounded-pill" style="font-size: 11px;">
            <i class="bi bi-whatsapp me-1"></i> ${waLabel}
          </a>
        </div>
      </div>`;
  }).join("");

  if (!adminView && activeCustomerTab === "enquiries") {
    renderCustomerMyEnquiriesTab();
  }
}

function clearOrderHistory() {
  if (confirm("Clear saved order history from this browser?")) {
    localStorage.removeItem("riddhi_orders");
    localStorage.setItem("riddhi_orders_cleared_at", String(Date.now()));
    renderMyOrders();
  }
}

function clearEnquiryHistory() {
  if (confirm("Clear saved enquiry history from this browser?")) {
    localStorage.removeItem("riddhi_enquiries");
    localStorage.setItem("riddhi_enquiries_cleared_at", String(Date.now()));
    renderCustomerMyEnquiriesTab();
  }
}

// ==========================================
// GOOGLE SHEET SYNC
// ==========================================
async function callScript(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function getPendingSync() {
  try { return JSON.parse(localStorage.getItem("riddhi_pending_sync") || "[]"); } catch (e) { return []; }
}
function setPendingSync(list) {
  localStorage.setItem("riddhi_pending_sync", JSON.stringify(list));
}



async function syncOrderToSheet(order) {
  if (!APPS_SCRIPT_URL || !order) return;
  try {
    const r = await callScript({ action: "newOrder", order: toSheetOrder(order) });
    if (!r.ok) throw new Error(r.error || "sync failed");
    if (r.stock) applyServerStockMap(r.stock);
  } catch (e) {
    const q = getPendingSync();
    if (!q.some(x => x.orderId === order.orderId)) q.push(toSheetOrder(order));
    setPendingSync(q);
  }
}

async function syncPendingOrders() {
  if (!APPS_SCRIPT_URL) return;
  const q = getPendingSync();
  if (!q.length) return;
  const left = [];
  for (const o of q) {
    try {
      const r = await callScript({ action: "newOrder", order: o });
      if (!r.ok) left.push(o);
    } catch (e) {
      left.push(o);
    }
  }
  setPendingSync(left);
}

// ==========================================
// ADMIN LOGIN & PERSISTENT SIDEBAR STATE (Closing modal NEVER logs out admin!)
// ==========================================
let adminOrders = [];
let adminEnquiries = [];
const ENQUIRY_STATUS_OPTIONS = ["New Enquiry", "Contacted", "Confirmed", "Completed", "Closed"];
const ENQUIRY_STATUS_DESC = {
  "New Enquiry": "Enquiry received; admin will review stock & custom making timeline.",
  "Contacted": "Admin has contacted you regarding availability and custom making.",
  "Confirmed": "Custom / extra quantity enquiry confirmed for making.",
  "Completed": "Your requested pieces are ready / completed.",
  "Closed": "This enquiry is closed."
};

function buildCustomerEnquiriesTrackerHtml() {
  const loggedCustMob = getCustomerSessionMobile();
  let enqs = [];
  if (loggedCustMob) {
    try {
      const parsedE = JSON.parse(localStorage.getItem("riddhi_enquiries") || "[]");
      if (Array.isArray(parsedE)) {
        enqs = parsedE.filter(eq => {
          const eqMob = String(eq.mobile || eq.customerMobile || "").replace(/[^0-9]/g, "").slice(-10);
          return !eqMob || eqMob === loggedCustMob;
        });
      }
    } catch (e) {}
  }
  const enqNavB = document.getElementById("navEnquiriesCount");
  if (enqNavB) {
    if (enqs.length > 0) {
      enqNavB.innerText = enqs.length;
      enqNavB.classList.remove("d-none");
    } else {
      enqNavB.classList.add("d-none");
    }
  }
  if (!loggedCustMob) {
    container.innerHTML = `
      <div class="text-center text-muted my-4 p-3 bg-white rounded-3 border shadow-sm">
        <i class="bi bi-chat-dots fs-1 text-warning"></i>
        <p class="small text-muted my-2">Login with your mobile number to view your enquiries.</p>
        <button type="button" class="btn btn-green btn-sm rounded-pill px-4" onclick="openCustomerMobileLoginModal()">
          <i class="bi bi-phone me-1"></i> Login with Mobile No.
        </button>
      </div>`;
    return;
  }
  if (!Array.isArray(enqs) || enqs.length === 0) return "";

  return `
    <div class="mt-4 pt-3 border-top">
      <h6 class="brand-font fw-bold mb-2" style="color: var(--primary-green);">
        <i class="bi bi-chat-dots me-1 text-warning"></i>My Enquiries (${enqs.length})
      </h6>
      ${enqs.map(eq => {
        const st = eq.status || "New Enquiry";
        const badgeCls = st === "Confirmed" || st === "Completed" ? "bg-success" : (st === "Contacted" ? "bg-info text-dark" : (st === "Closed" ? "bg-danger" : "bg-warning text-dark"));
        return `
          <div class="card mb-2 border-0 shadow-sm">
            <div class="card-body p-2 small">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold text-dark">${esc(eq.enquiryId)}</span>
                <span class="badge ${badgeCls}">${esc(st)}</span>
              </div>
              <div class="fw-semibold">${esc(eq.productName)} (${esc(eq.productId)})</div>
              <div class="text-muted" style="font-size: 11px;">
                Size: ${esc(eq.size)} | Stock: ${esc(eq.availableStock)} | Needed: ${esc(eq.requestedQty)}${eq.extraQty > 0 ? ` (Extra: ${esc(eq.extraQty)})` : ""}
              </div>
              <div class="text-dark mt-1" style="font-size: 11px;">${esc(ENQUIRY_STATUS_DESC[st] || "")}</div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderAdminEnquiriesList() {
  const container = document.getElementById("adminEnquiriesListContainer");
  const badge = document.getElementById("adminEnquiriesCountBadge");
  if (!container || !isAdminLoggedIn()) return;

  if (badge) badge.textContent = adminEnquiries.length;

  if (!adminEnquiries || adminEnquiries.length === 0) {
    container.innerHTML = `<div class="text-center text-muted py-3 small bg-white rounded-3 border">No customer enquiries received yet.</div>`;
    return;
  }

  container.innerHTML = adminEnquiries.map(eq => {
    const st = eq.status || "New Enquiry";
    let wa = String(eq.mobile || "").replace(/[^0-9]/g, "").slice(-10);
    if (wa.length === 10) wa = "91" + wa;
    const waText = `Hello *Jewellery by Riddhi* Customer ${eq.customerName || ""}! ✨
🆔 *Enquiry ID:* ${eq.enquiryId}
🛍️ *Product:* ${eq.productName} (${eq.productId})
📏 *Size:* ${eq.size} | *Needed Qty:* ${eq.requestedQty}
📌 *Enquiry Status:* *${st}*
${ENQUIRY_STATUS_DESC[st] || ""}`;

    return `
      <div class="card mb-2 border-0 shadow-sm">
        <div class="card-body p-3 small">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
            <div>
              <span class="badge bg-warning text-dark me-1">${esc(eq.enquiryId)}</span>
              <strong class="text-dark">${esc(eq.customerName)}</strong>
              <span class="text-muted">(${esc(eq.mobile)})</span>
            </div>
            <span class="text-muted" style="font-size: 11px;">${esc(eq.date || "")}</span>
          </div>
          <div class="d-flex gap-2 align-items-center my-1">
            <img src="${esc(safeImgUrl(eq.image) || 'assets/Categories/Comming-Soon.png')}" alt="" referrerpolicy="no-referrer" style="width:46px;height:46px;object-fit:cover;border-radius:8px;border:1px solid #eadbc8;flex-shrink:0;" onerror="handleSmartImgError(this, 'assets/Categories/Comming-Soon.png');">
            <div class="fw-semibold text-dark">${esc(eq.productName)} (${esc(eq.productId)}) — <span class="text-muted">${esc(eq.category || "")}</span></div>
          </div>
          <div class="text-muted mb-1" style="font-size: 11px;">
            Size: <strong>${esc(eq.size)}</strong> | Ready Stock: <strong>${esc(eq.availableStock)}</strong> | Requested: <strong>${esc(eq.requestedQty)}</strong>
            ${Number(eq.extraQty) > 0 ? ` | <span class="text-danger fw-bold">Extra Needed: ${esc(eq.extraQty)}</span>` : ""}
          </div>
          ${eq.note ? `<div class="text-success mb-2" style="font-size: 11px;"><strong>Note:</strong> ${esc(eq.note)}</div>` : ""}
          <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
            <select class="form-select form-select-sm w-auto" onchange="adminUpdateEnquiryStatus('${esc(eq.enquiryId)}', this.value, this)">
              ${ENQUIRY_STATUS_OPTIONS.map(opt => `<option value="${opt}" ${opt === st ? "selected" : ""}>${opt}</option>`).join("")}
            </select>
            <a href="https://wa.me/${wa}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener" class="btn btn-outline-success btn-sm py-0 px-2" style="font-size: 11px;">
              <i class="bi bi-whatsapp"></i> Update Customer
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function adminUpdateEnquiryStatus(enquiryId, newStatus, selEl = null) {
  const s = getAdminSession();
  if (!s) return;
  if (!confirm(`Confirm updating Enquiry ${enquiryId} status to "${newStatus}"?`)) {
    if (typeof renderEnquiriesWorkspace === "function") renderEnquiriesWorkspace();
    else renderAdminEnquiriesList();
    return;
  }
  if (selEl) selEl.disabled = true;
  try {
    if (s.mode === "sheet" && APPS_SCRIPT_URL) {
      const r = await callScript({ action: "updateEnquiryStatus", token: s.token, enquiryId, status: newStatus });
      if (!r.ok) throw new Error(r.error || "failed");
    }
    const target = adminEnquiries.find(x => x.enquiryId === enquiryId);
    if (target) target.status = newStatus;
    renderAdminEnquiriesList();
  } catch (e) {
    alert("Could not update enquiry status. Please check internet.");
  } finally {
    if (selEl) selEl.disabled = false;
  }
}

function isCustomerStorefrontPage() {
  const path = (window.location.pathname || "").toLowerCase();
  return !path.includes("admin-");
}
function getAdminSession() {
  try {
    const raw = localStorage.getItem("riddhi_admin_session") || sessionStorage.getItem("riddhi_admin_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.mode === "sheet" && !parsed.token) return null;
    if (parsed.mode !== "sheet" && parsed.mode !== "local") return null;
    return parsed;
  } catch (e) {
    return null;
  }
}
function isAdminLoggedIn() {
  const s = getAdminSession();
  return !!(s && (s.mode === "local" || (s.mode === "sheet" && s.token)));
}
function updateAdminMenuLabel() {
  // Never expose Admin Panel on customer storefront pages (index.html, about.html, care-guide.html)
  if (isCustomerStorefrontPage()) {
    const sidebarAdmin = document.getElementById("sidebarAdminSection");
    if (sidebarAdmin) sidebarAdmin.remove();
    const custModal = document.getElementById("allCustomersModal");
    if (custModal) custModal.remove();
    return;
  }
}

async function sha256Hex(text) {
  if (!(window.crypto && crypto.subtle)) {
    throw new Error("no-crypto");
  }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

window.makeAdminHash = async function (user, pass) {
  const h = await sha256Hex(user + ":" + pass);
  console.log(h);
  return h;
};

const ADMIN_MAX_FAILS = 5;
const ADMIN_LOCK_MS = 5 * 60 * 1000;

function getAdminLockInfo() {
  try { return JSON.parse(localStorage.getItem("riddhi_admin_fail") || "{}"); } catch (e) { return {}; }
}
function adminLockRemainingMs() {
  const info = getAdminLockInfo();
  return info.until && info.until > Date.now() ? info.until - Date.now() : 0;
}
function registerAdminFail() {
  const info = getAdminLockInfo();
  const count = (info.count || 0) + 1;
  if (count >= ADMIN_MAX_FAILS) {
    localStorage.setItem("riddhi_admin_fail", JSON.stringify({ count: 0, until: Date.now() + ADMIN_LOCK_MS }));
  } else {
    localStorage.setItem("riddhi_admin_fail", JSON.stringify({ count, until: 0 }));
  }
}
function clearAdminFails() {
  localStorage.removeItem("riddhi_admin_fail");
}

function showAdminLoginError(msg) {
  const box = document.getElementById("adminLoginError");
  if (!box) return;
  box.textContent = msg;
  box.classList.toggle("d-none", !msg);
}

let adminTapCount = 0, adminTapTimer = null;
function adminLogoTap() {
  adminTapCount++;
  clearTimeout(adminTapTimer);
  adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2000);
  if (adminTapCount >= 5) {
    adminTapCount = 0;
    handleAdminClick();
  }
}
function checkAdminHash() {
  if (location.hash === "#admin") {
    history.replaceState(null, "", location.pathname + location.search);
    setTimeout(() => openAdminLogin(), 50);
  }
}
window.addEventListener("hashchange", checkAdminHash);

async function refreshAdminHistory() {
  if (!isAdminLoggedIn() || isCustomerStorefrontPage()) return;
  try {
    if (await loadAdminOrders()) renderMyOrders();
  } catch (e) { /* keep existing */ }
}
document.addEventListener("show.bs.offcanvas", ev => {
  if (ev.target && ev.target.id === "myOrdersOffcanvas") {
    renderMyOrders();
    refreshMyOrderStatuses();
  }
  if (ev.target && ev.target.id === "menuOffcanvas") {
    updateCustomerAccountUI();
  updateAdminMenuLabel();
  }
});

function handleAdminClick() {
  openAdminLogin();
}

function openAdminLogin() {
  const el = document.getElementById("adminLoginModal");
  if (!el) return;
  document.getElementById("adminUser").value = "";
  document.getElementById("adminPass").value = "";
  showAdminLoginError("");
  bootstrap.Modal.getOrCreateInstance(el).show();
}

async function submitAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById("adminUser").value.trim();
  const password = document.getElementById("adminPass").value;
  const btn = document.getElementById("adminLoginBtn");

  const lockMs = adminLockRemainingMs();
  if (lockMs > 0) {
    showAdminLoginError(`Too many failed attempts. Try again after ${Math.ceil(lockMs / 60000)} minute(s).`);
    return;
  }

  btn.disabled = true;
  const oldLabel = btn.innerHTML;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Checking...`;
  showAdminLoginError("");

  try {
    let session;
    if (APPS_SCRIPT_URL) {
      let r;
      try {
        const ctrl = new AbortController();
        const tmr = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "adminLogin", username, password }),
          signal: ctrl.signal
        });
        clearTimeout(tmr);
        r = await res.json();
      } catch (netErr) {
        try {
          const h = await sha256Hex(username + ":" + password);
          if (username === ADMIN_USERNAME && h === ADMIN_LOCAL_HASH) {
            session = { mode: "local" };
            adminOrders = getLocalOrders();
            try { adminEnquiries = JSON.parse(localStorage.getItem('riddhi_enquiries') || '[]'); } catch (e) { adminEnquiries = []; }
            clearAdminFails();
            localStorage.setItem("riddhi_admin_session", JSON.stringify(session));
            sessionStorage.setItem("riddhi_admin_session", JSON.stringify(session));
            const loginEl = document.getElementById("adminLoginModal");
            if (loginEl) bootstrap.Modal.getOrCreateInstance(loginEl).hide();
            window.location.href = "admin-orders.html";
            return;
          }
        } catch (ex) {}
        showAdminLoginError("Invalid username or password.");
        return;
      }
      if (!r.ok) {
        if (r.error !== "locked") registerAdminFail();
        showAdminLoginError(r.error === "locked"
          ? "Too many failed attempts. Try again later."
          : "Invalid username or password.");
        return;
      }
      session = { mode: "sheet", token: r.token };
      adminOrders = r.orders || [];
      adminEnquiries = r.enquiries || [];
      if (typeof r.autoDeliverEnabled === "boolean") {
        syncAutoDeliverUI(r.autoDeliverEnabled);
      }
    } else {
      let hash;
      try {
        hash = await sha256Hex(username + ":" + password);
      } catch (cryptoErr) {
        showAdminLoginError("Open site over https:// or localhost to login.");
        return;
      }
      if (username !== ADMIN_USERNAME || hash !== ADMIN_LOCAL_HASH) {
        registerAdminFail();
        showAdminLoginError("Invalid username or password.");
        return;
      }
      session = { mode: "local" };
      adminOrders = getLocalOrders();
      try { adminEnquiries = JSON.parse(localStorage.getItem('riddhi_enquiries') || '[]'); } catch (e) { adminEnquiries = []; }
    }

    clearAdminFails();
    localStorage.setItem("riddhi_admin_session", JSON.stringify(session));
    sessionStorage.setItem("riddhi_admin_session", JSON.stringify(session));

    const loginEl = document.getElementById("adminLoginModal");
    if (loginEl) {
      bootstrap.Modal.getOrCreateInstance(loginEl).hide();
    }
    window.location.href = "admin-orders.html";
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldLabel;
    document.getElementById("adminPass").value = "";
  }
}

// Admin logs out ONLY when clicking the Logout button
async function adminLogout() {
  const s = getAdminSession();
  localStorage.removeItem("riddhi_admin_session");
  sessionStorage.removeItem("riddhi_admin_session");
  adminOrders = [];
  adminEnquiries = [];
  if (s && s.mode === "sheet" && APPS_SCRIPT_URL) {
    try { await callScript({ action: "adminLogout", token: s.token }); } catch (e) { /* ignore */ }
  }
  window.location.href = "admin-orders.html";
}

async function loadAdminOrders() {
  const s = getAdminSession();
  if (!s) return false;
  if (s.mode === "sheet") {
    const r = await callScript({ action: "getOrders", token: s.token });
    if (!r.ok) {
      localStorage.removeItem("riddhi_admin_session"); sessionStorage.removeItem("riddhi_admin_session");
      updateCustomerAccountUI();
  updateAdminMenuLabel();
      return false;
    }
    adminOrders = r.orders || [];
      adminEnquiries = r.enquiries || [];
    if (typeof r.autoDeliverEnabled === "boolean") {
      syncAutoDeliverUI(r.autoDeliverEnabled);
    }
  } else {
    autoDeliverLocalOrders();
    adminOrders = getLocalOrders();
      try { adminEnquiries = JSON.parse(localStorage.getItem('riddhi_enquiries') || '[]'); } catch (e) { adminEnquiries = []; }
  }
  return true;
}

async function openAllCustomersModal(skipReload = false) {
  if (!isAdminLoggedIn()) {
    openAdminLogin();
    return;
  }
  const modalEl = document.getElementById("allCustomersModal");
  if (!modalEl) return;

  refreshStockManagerDropdowns();
  syncAutoDeliverUI(isAutoDeliverEnabled());
  document.getElementById("customerSearchInput").value = "";
  document.getElementById("customerFilterType").value = "all";

  const s = getAdminSession();
  const srcEl = document.getElementById("adminSourceBadge");
  if (srcEl) {
    srcEl.className = "badge " + (s.mode === "sheet" ? "bg-success" : "bg-warning text-dark");
    srcEl.textContent = s.mode === "sheet" ? "Source: Google Sheet (All Devices)" : "Source: Local Device Data";
  }

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
  if (!skipReload) await refreshAdminPanel();
  else renderAllCustomersSummary();
}

async function refreshAdminPanel() {
  const container = document.getElementById("allCustomersListContainer");
  if (container) {
    container.innerHTML = `<div class="text-center text-muted py-4 small"><span class="spinner-border spinner-border-sm me-2"></span>Loading orders...</div>`;
  }
  try {
    const ok = await loadAdminOrders();
    if (!ok) {
      bootstrap.Modal.getOrCreateInstance(document.getElementById("allCustomersModal")).hide();
      openAdminLogin();
      showAdminLoginError("Session expired. Please login again.");
      return;
    }
  } catch (e) {
    if (container) container.innerHTML = `<div class="text-center text-danger py-4 small">Could not load orders. Check internet and click Refresh.</div>`;
    return;
  }
  renderAllCustomersSummary();
  renderAdminEnquiriesList();
  renderMyOrders();
}

const RECENT_DAYS = 7;

function groupOrdersByCustomer(orders) {
  const map = {};
  const recentCutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

  orders.forEach(ord => {
    const cust = ord.customer || {};
    const cleanPhone = String(cust.mobile || "").replace(/[^0-9]/g, "");
    const key = cleanPhone.slice(-10) || String(cust.name || "Unknown").toLowerCase();
    const period = (ord.timestamp || 0) >= recentCutoff ? "Present" : "Past";

    if (!map[key]) {
      map[key] = {
        name: cust.name || "Unknown",
        mobile: cust.mobile || "-",
        address: [cust.address, cust.city].filter(Boolean).join(", ") + (cust.pincode ? " - " + cust.pincode : ""),
        orders: []
      };
    }
    map[key].orders.push({
      orderId: ord.orderId, date: ord.date, timestamp: ord.timestamp || 0, period,
      total: Number(ord.total || 0),
      status: ord.status,
      cancelReason: ord.cancelReason || "",
      custName: cust.name, custMobile: cust.mobile,
      itemsHtml: ord.items ? buildItemsHtml(ord.items, ord.orderId) : (ord.itemsHtml || "")
    });
  });
  return Object.values(map);
}

function renderAllCustomersSummary() {
  const container = document.getElementById("allCustomersListContainer");
  const statsBar = document.getElementById("customerStatsBar");
  if (!container || !isAdminLoggedIn()) return;

  const searchQ = (document.getElementById("customerSearchInput")?.value || "").toLowerCase().trim();
  const filterPeriod = document.getElementById("customerFilterType")?.value || "all";

  let customers = groupOrdersByCustomer(adminOrders);

  if (searchQ) {
    customers = customers.filter(c =>
      c.name.toLowerCase().includes(searchQ) || String(c.mobile).toLowerCase().includes(searchQ)
    );
  }
  if (filterPeriod !== "all") {
    customers = customers
      .map(c => ({ ...c, orders: c.orders.filter(o => o.period.toLowerCase() === filterPeriod) }))
      .filter(c => c.orders.length > 0);
  }
  customers.forEach(c => {
    c.orders.sort((a, b) => b.timestamp - a.timestamp);
    c.orderCount = c.orders.length;
    c.totalSpent = c.orders.reduce((sum, o) => sum + o.total, 0);
  });
  customers.sort((a, b) => (b.orders[0]?.timestamp || 0) - (a.orders[0]?.timestamp || 0));

  const totalOrdersCount = customers.reduce((sum, c) => sum + c.orderCount, 0);
  const revenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);

  if (statsBar) {
    statsBar.innerHTML = `Customers: <span style="color: var(--primary-green);">${customers.length}</span> | Orders: <span style="color: var(--primary-green);">${totalOrdersCount}</span> | Total: <span style="color: var(--primary-green);">₹${revenue}</span>`;
  }

  if (customers.length === 0) {
    container.innerHTML = `<div class="text-center text-muted py-4 small">No matching customer order records found.</div>`;
    return;
  }

  container.innerHTML = customers.map(c => {
    let wa = String(c.mobile).replace(/[^0-9]/g, "").slice(-10);
    if (wa.length === 10) wa = "91" + wa;

    const historyHtml = c.orders.map(o => `
      <div class="p-2 rounded mb-1" style="background-color: #fdfaf5; border: 1px solid #efe3d2;">
        <div class="d-flex justify-content-between align-items-center">
          <span class="fw-bold text-dark">${esc(o.orderId)} <span class="badge ${o.period === "Present" ? "bg-success" : "bg-secondary"}" style="font-size:10px;">${o.period === "Present" ? "Recent" : "Past"}</span></span>
          <span class="fw-bold" style="color: var(--primary-green);">₹${esc(o.total)}</span>
        </div>
        <div class="text-muted" style="font-size:11px;">${esc(o.date)}</div>
        ${adminStatusControl(o.orderId, o.status, o.custName, o.custMobile, o.cancelReason)}
        <div class="mt-1">${o.itemsHtml}</div>
      </div>`).join("");

    return `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-3 small">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <div>
              <div class="fw-bold fs-6 text-dark">👤 ${esc(c.name)} ${c.orderCount > 1 ? `<span class="badge bg-info text-dark" style="font-size:10px;">Repeat</span>` : ""}</div>
              <div class="text-muted"><i class="bi bi-telephone me-1"></i>${esc(c.mobile)}</div>
              <div class="text-muted" style="font-size:11px;">${esc(c.address)}</div>
            </div>
            <div class="text-end">
              <span class="badge bg-warning text-dark">${c.orderCount} Order(s)</span>
              <div class="fw-bold mt-1" style="color: var(--primary-green);">Total: ₹${esc(c.totalSpent)}</div>
              <a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="btn btn-outline-success btn-sm py-0 px-2 mt-1" style="font-size: 11px;"><i class="bi bi-whatsapp"></i> Chat</a>
            </div>
          </div>
          ${historyHtml}
        </div>
      </div>`;
  }).join("");
}

function csvCell(v) {
  let t = String(v ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}

function exportOrdersCsv() {
  if (!isAdminLoggedIn()) return;
  const rows = [["Order ID", "Date", "Name", "Mobile", "Address", "City", "Pincode", "Items", "Image Links", "Total (INR)", "Status", "Cancel Reason"]];
  adminOrders.forEach(o => {
    const c = o.customer || {};
    const items = (o.items || []).map(i => `${i.name} (${i.id}) x${i.qty} [${i.size}]${i.note ? " note: " + i.note : ""}`).join(" | ");
    const imgs = (o.items || []).map(i => i.image || "").filter(Boolean).join(" | ");
    rows.push([o.orderId, o.date, c.name, c.mobile, c.address, c.city, c.pincode, items, imgs, o.total, normStatus(o.status), o.cancelReason || ""]);
  });
  const csv = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "riddhi-orders-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
