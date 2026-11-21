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
    return {
      ...it,
      image: getFullImageUrl(it.image),
      currentStock: preOrderStock
    };
  });
  return {
    orderId: o.orderId,
    timestamp: o.timestamp,
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

// ==========================================
// PER-PRODUCT LIVE STOCK PERSISTENCE + CATEGORY FILTERED STOCK UI
// ==========================================
function loadPersistedStock() {
  try {
    const savedMap = JSON.parse(localStorage.getItem("riddhi_product_stock") || "{}");
    PRODUCTS.forEach(p => {
      if (Object.prototype.hasOwnProperty.call(savedMap, p.id)) {
        p.availableStock = Math.max(0, parseInt(savedMap[p.id], 10) || 0);
      }
    });
  } catch (e) {
    console.warn("Could not read persisted stock", e);
  }
}

function savePersistedStock() {
  try {
    const map = {};
    PRODUCTS.forEach(p => {
      map[p.id] = Math.max(0, parseInt(p.availableStock, 10) || 0);
    });
    localStorage.setItem("riddhi_product_stock", JSON.stringify(map));
  } catch (e) {
    console.warn("Could not save persisted stock", e);
  }
}

function refreshAllProductViews() {
  renderNewArrivals();
  if (document.getElementById("productListView") && !document.getElementById("productListView").classList.contains("d-none")) {
    applyFilters();
  }
  if (document.getElementById("favoritesView") && !document.getElementById("favoritesView").classList.contains("d-none")) {
    renderFavoritesView();
  }
  refreshStockManagerDropdowns();
}

// Deducts stock ONLY for the specific ordered product(s) matching exact ID & Name
function deductStockForItems(items) {
  let changed = false;
  (items || []).forEach(it => {
    const prod = PRODUCTS.find(p => p.id === it.id && (!it.name || p.name === it.name)) || PRODUCTS.find(p => p.id === it.id);
    if (prod) {
      const orderedQty = Math.max(1, parseInt(it.qty, 10) || 1);
      prod.availableStock = Math.max(0, (parseInt(prod.availableStock, 10) || 0) - orderedQty);
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
    const catalogPayload = PRODUCTS.map(p => ({
      id: p.id,
      name: p.name,
      image: getFullImageUrl((p.images && p.images[0]) || ""),
      availableStock: Math.max(0, parseInt(p.availableStock, 10) || 0)
    }));
    const r = await callScript({ action: "syncCatalog", products: catalogPayload });
    if (r && r.ok && r.stock) {
      applyServerStockMap(r.stock);
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

  initCityAutocomplete();
  renderNewArrivals();
  renderCategories();
  initStockCategoryFilters();
  updateFavoritesBadge();
  updateCartUI();
  autoDeliverLocalOrders();
  renderMyOrders();
  syncPendingOrders();
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
            <img src="${prod.images[0]}" alt="${esc(prod.name)}">
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
// NEW ARRIVALS ON HOME PAGE
// ==========================================
function renderNewArrivals() {
  const container = document.getElementById("newArrivalsGrid");
  if (!container) return;
  const newItems = PRODUCTS.filter(p => p.isNewArrival).slice(0, 4);
  container.innerHTML = newItems.map((prod, idx) => buildProductCardHtml(prod, idx, true)).join("");
}

// ==========================================
// 15 CATEGORIES RENDERING (HOME, SIDEBAR, FILTER)
// ==========================================
function renderCategories() {
  const homeGrid = document.getElementById("homeCategoryGrid");
  const sidebarList = document.getElementById("sidebarCategoryList");
  const filterDropdown = document.getElementById("filterCategory");

  CATEGORIES.forEach((cat, idx) => {
    const delay = Math.min(idx * 0.04, 0.5).toFixed(2);
    if (homeGrid) {
      homeGrid.innerHTML += `
        <div class="col-6 col-md-4 col-lg-3 stagger-card" style="animation-delay: ${delay}s;">
          <div class="custom-card" onclick="openProductsView('${cat.name}')">
            <img src="${cat.image}" alt="${cat.name}">
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
  hideAllViews();
  document.getElementById("productListView").classList.remove("d-none");
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
    const matchCat = (selectedCat === "All") || (prod.category.toLowerCase() === selectedCat.toLowerCase());
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
    document.getElementById("availSoonWaBtn").href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(enquiryText)}`;
  } else {
    stockBadge.className = "badge bg-success-subtle text-success border border-success-subtle px-2 py-1";
    stockBadge.innerText = `Stock: ${stock} pcs`;
    inStockBox.classList.remove("d-none");
    availSoonBox.classList.add("d-none");
    document.getElementById("maxStockHint").innerText = `(Max ${stock} ready)`;
  }

  document.getElementById("modalSize").selectedIndex = 0;
  document.getElementById("modalQty").value = 1;
  document.getElementById("modalCustom").value = "";
  document.getElementById("bulkEnquiryBox").classList.add("d-none");

  const thumbContainer = document.getElementById("modalThumbnails");
  thumbContainer.innerHTML = "";

  currentProduct.images.slice(0, 3).forEach((imgUrl, idx) => {
    thumbContainer.innerHTML += `
      <div class="thumb-item ${idx === 0 ? "active" : ""}" onclick="setMainMedia('image', '${imgUrl}', this)">
        <img src="${imgUrl}" alt="Photo ${idx + 1}">
      </div>
    `;
  });

  if (currentProduct.video) {
    thumbContainer.innerHTML += `
      <div class="thumb-item" onclick="setMainMedia('video', '${currentProduct.video}', this)">
        <img src="${currentProduct.images[0]}" alt="Video Preview">
        <div class="video-badge-icon"><i class="bi bi-play-circle-fill"></i></div>
      </div>
    `;
  }

  setMainMedia("image", currentProduct.images[0], thumbContainer.firstElementChild);
  productModalInstance.show();
}

function setMainMedia(type, src, thumbEl) {
  currentActiveMedia = { type, src };
  const mainBox = document.getElementById("modalMainMedia");
  document.querySelectorAll(".thumb-item").forEach(el => el.classList.remove("active"));
  if (thumbEl) thumbEl.classList.add("active");

  const fsBtnHtml = `<button type="button" class="fullscreen-btn" onclick="openFullscreenMedia()" title="Full Screen"><i class="bi bi-arrows-fullscreen"></i> Full Screen</button>`;

  if (type === "video") {
    mainBox.innerHTML = `${fsBtnHtml}<video id="activeProductVideo" src="${src}" poster="${currentProduct ? currentProduct.images[0] : ''}" controls autoplay muted loop playsinline preload="auto"></video>`;
    const vidEl = document.getElementById("activeProductVideo");
    if (vidEl) {
      vidEl.muted = true;
      const playPromise = vidEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }
  } else {
    mainBox.innerHTML = `${fsBtnHtml}<img src="${src}" alt="Product View" onclick="openFullscreenMedia()">`;
  }
}

function openFullscreenMedia() {
  const overlay = document.getElementById("fullscreenOverlay");
  const content = document.getElementById("fullscreenContent");
  const vid = document.getElementById("activeProductVideo");
  if (vid) vid.pause();

  if (currentActiveMedia.type === "video") {
    content.innerHTML = `<video src="${currentActiveMedia.src}" controls autoplay muted loop playsinline preload="auto"></video>`;
  } else {
    content.innerHTML = `<img src="${currentActiveMedia.src}" alt="Full Screen View">`;
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
  let val = parseInt(qtyInput.value) + delta;
  if (val < 1) val = 1;
  if (val > currentProduct.availableStock) {
    alert(`Only ${currentProduct.availableStock} pieces are ready in stock. Use "Enquire 3+ Pcs" for custom bulk quantity!`);
    val = currentProduct.availableStock;
  }
  qtyInput.value = val;
}

function toggleBulkEnquiry() {
  document.getElementById("bulkEnquiryBox").classList.toggle("d-none");
}

function sendBulkEnquiryWhatsApp() {
  const reqQty = document.getElementById("bulkQtyInput").value;
  const note = document.getElementById("bulkNoteInput").value.trim();

  let msg = `Hello *Jewellery by Riddhi*! ✨\nI want to enquire for *${reqQty} pieces* of:\n\n`;
  msg += `🛍️ *Product:* *${currentProduct.name}* (${currentProduct.id})\n`;
  msg += `💰 *Offer Price per pc:* ₹${currentProduct.price}\n`;
  if (note) msg += `📝 *Customization:* _${note}_\n`;
  msg += `\nPlease confirm availability and custom making time.`;

  sendWhatsAppUrl(WHATSAPP_NUMBER, msg);
}

// ==========================================
// DIRECT ADD TO CART
// ==========================================
function handleAddToCartClick() {
  if (!currentProduct) return;
  const stock = Math.max(0, parseInt(currentProduct.availableStock, 10) || 0);
  if (stock <= 0) {
    alert("This product is currently out of stock (Available Soon). Please enquire on WhatsApp!");
    return;
  }

  const size = document.getElementById("modalSize").value;
  const qty = parseInt(document.getElementById("modalQty").value, 10) || 1;
  const customNote = document.getElementById("modalCustom").value.trim();

  const alreadyInCartQty = cart
    .filter(item => item.id === currentProduct.id)
    .reduce((sum, item) => sum + item.qty, 0);

  if (alreadyInCartQty + qty > stock) {
    const remainingAllowed = Math.max(0, stock - alreadyInCartQty);
    alert(`Only ${stock} piece(s) available in stock (you already have ${alreadyInCartQty} in cart).`);
    if (remainingAllowed <= 0) return;
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
  const maxStock = prod ? Math.max(0, parseInt(prod.availableStock, 10) || 0) : item.availableStock;
  if (newQty > maxStock) {
    alert(`Only ${maxStock} piece(s) are ready in stock for ${item.name}.`);
    return;
  }

  item.qty = newQty;
  updateCartUI();
}

function requestRemoveCartItem(index) {
  const item = cart[index];
  if (!item) return;
  pendingRemoveCartIndex = index;
  const titleEl = document.getElementById("removeCartItemTitle");
  if (titleEl) titleEl.innerText = item.name;
  if (removeCartConfirmModalInstance) {
    removeCartConfirmModalInstance.show();
  } else if (confirm("Do you want to remove this product from cart?")) {
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
    navCount.innerText = "0";
    document.getElementById("cartTotal").innerText = "0";
    if (savingsEl) savingsEl.innerText = "0";
    floatBtn.classList.add("d-none");
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
            <div class="d-flex justify-content-between align-items-start gap-1">
              <h6 class="mb-0 small fw-bold">${esc(item.name)}</h6>
              ${discPct > 0 ? `<span class="discount-badge" style="font-size:9px;">${discPct}% OFF</span>` : ""}
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
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }
  openCustomerModal("order_cart");
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
    id: currentProduct.id, name: currentProduct.name, size, qty,
    price: currentProduct.price, note: customNote, image: currentProduct.images[0],
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
      id: item.id, name: item.name, size: item.size, qty: item.qty,
      price: item.price, note: item.customNote || "", image: item.images[0],
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
function adminStatusControl(orderId, status, custName, custMobile, cancelReason = "") {
  const st = normStatus(status);
  let wa = String(custMobile || "").replace(/[^0-9]/g, "");
  if (wa.length === 10) wa = "91" + wa;
  const reasonLine = (st === "Cancelled" && cancelReason) ? `\n📝 *Reason:* ${cancelReason}` : "";
  const text = `Hello *Jewellery by Riddhi* Customer ${custName || ""}! ✨\n📦 *Order ID:* ${orderId}\n📌 *Order Status:* *${STATUS_META[st].label}*${reasonLine}\n${STATUS_META[st].msg}`;
  return `
    <div class="my-2">
      <div class="d-flex flex-wrap align-items-center gap-2">
        <select class="form-select form-select-sm w-auto" data-oid="${esc(orderId)}" data-prev="${esc(st)}" onchange="adminChangeStatus(this)" aria-label="Order status">
          ${ORDER_STATUSES.map(x => `<option value="${x}" ${x === st ? "selected" : ""}>${STATUS_META[x].label}</option>`).join("")}
        </select>
        <a href="https://wa.me/${wa}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" class="btn btn-outline-success btn-sm py-0 px-2" style="font-size:11px;"><i class="bi bi-whatsapp"></i> Notify Customer</a>
      </div>
      ${st === "Cancelled" && cancelReason ? `<div class="small text-danger mt-1" style="font-size:11px;"><i class="bi bi-info-circle me-1"></i><strong>Cancel Reason:</strong> ${esc(cancelReason)}</div>` : ""}
    </div>`;
}

function adminChangeStatus(sel) {
  const orderId = sel.dataset.oid;
  const status = sel.value;

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
          sessionStorage.removeItem("riddhi_admin_session");
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

async function refreshMyOrderStatuses() {
  autoDeliverLocalOrders();
  if (!APPS_SCRIPT_URL || isAdminLoggedIn()) return;
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
    renderMyOrders();
  } catch (e) { /* offline fallback */ }
}

function safeImgUrl(u) {
  const full = getFullImageUrl(u);
  return /^https?:\/\/[^\s"'<>]+$/i.test(full) ? full : "";
}

function buildItemsHtml(items) {
  return (items || []).map(it => `
    <div class="mb-1 d-flex gap-2 align-items-start">
      ${safeImgUrl(it.image) ? `<img src="${esc(safeImgUrl(it.image))}" alt="" referrerpolicy="no-referrer" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;">` : ""}
      <div><strong>${esc(it.name)}</strong> (${esc(it.id)})<br>
      <span class="text-muted" style="font-size:11px;">Size: ${esc(it.size)} | Qty: ${esc(it.qty)} | ₹${esc(it.price * it.qty)}${it.note ? ` | Note: ${esc(it.note)}` : ""}</span></div>
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
      <h6 class="fw-bold" style="color: var(--primary-green);">Order Processing &amp; Dispatch</h6>
      <p class="small text-muted">All pieces at <strong>Jewellery by Riddhi</strong> are handmade to order or carefully inspected before dispatch. Ready-to-ship items are dispatched within <strong>2–4 business days</strong>, and custom/bulk orders (3+ pieces) take <strong>5–8 business days</strong>.</p>
      <h6 class="fw-bold" style="color: var(--primary-green);">Delivery Timelines &amp; Charges</h6>
      <ul class="small text-muted">
        <li><strong>Pune &amp; Maharashtra:</strong> Typically 2–4 working days after dispatch.</li>
        <li><strong>Rest of India:</strong> Typically 4–7 working days via trusted courier partners.</li>
        <li>Shipping charges (if applicable) are confirmed on WhatsApp prior to final payment.</li>
      </ul>
    `;
  } else {
    titleEl.innerHTML = `<i class="bi bi-arrow-counterclockwise me-2"></i>Return &amp; Replacement Policy`;
    bodyEl.innerHTML = `
      <h6 class="fw-bold" style="color: var(--primary-green);">Damage or Wrong Item Replacement</h6>
      <p class="small text-muted">Because every item is handcrafted and customized, we do not offer general change-of-mind returns. However, if you receive a <strong>damaged, defective, or incorrect product</strong>, we gladly offer a replacement or resolution.</p>
      <h6 class="fw-bold" style="color: var(--primary-green);">Mandatory Unboxing Video Requirement</h6>
      <ul class="small text-muted">
        <li>Please record a <strong>clear, continuous unboxing video</strong> from the moment you open the sealed parcel.</li>
        <li>Contact us on WhatsApp (<strong>${BRAND_PHONE_DISPLAY}</strong>) within <strong>24 hours of delivery</strong> with the unboxing video and order details.</li>
        <li>Custom-made or bulk orders (3+ pieces) are eligible for replacement only in case of transit damage or wrong item sent.</li>
      </ul>
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

function renderMyOrders() {
  autoDeliverLocalOrders();
  const container = document.getElementById("myOrdersListContainer");
  const badge = document.getElementById("navOrdersCount");
  const adminView = isAdminLoggedIn();

  let allOrders = adminView
    ? adminOrders.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    : getLocalOrders();

  if (badge) {
    if (allOrders.length > 0) {
      badge.innerText = allOrders.length;
      badge.classList.remove("d-none");
    } else {
      badge.classList.add("d-none");
    }
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
  const now = Date.now();

  const orders = allOrders.filter(ord => {
    const st = normStatus(ord.status);
    if (statusFilter !== "all") {
      if (statusFilter === "Confirmed") {
        if (!["Confirmed", "Custom Making / Partial Stock Ready", "Packed"].includes(st)) return false;
      } else if (st !== statusFilter) {
        return false;
      }
    }

    const ts = Number(ord.timestamp) || 0;
    if (dateFilter === "30d") {
      if (now - ts > 30 * 24 * 60 * 60 * 1000) return false;
    } else if (dateFilter === "3m") {
      if (now - ts > 90 * 24 * 60 * 60 * 1000) return false;
    } else if (/^\d{4}$/.test(dateFilter)) {
      const yr = ts ? new Date(ts).getFullYear().toString() : "";
      if (yr !== dateFilter && !String(ord.date || "").includes(dateFilter)) return false;
    }

    return true;
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
    ? `<button type="button" class="btn btn-outline-dark btn-sm w-100 mb-3 rounded-pill" onclick="refreshMyOrderStatuses()"><i class="bi bi-arrow-clockwise me-1"></i>Refresh Order Status</button>`
    : "";

  container.innerHTML = warn + refreshBtn + orders.map(ord => {
    const cust = ord.customer || {};
    let cleanCustPhone = (cust.mobile || "").replace(/[^0-9]/g, "").slice(-10);
    if (cleanCustPhone.length === 10) cleanCustPhone = "91" + cleanCustPhone;
    const waSelfUrl = adminView
      ? `https://wa.me/${cleanCustPhone}`
      : `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(ord.fullMessage || "")}`;
    const waLabel = adminView ? "Chat with Customer" : "Send Copy to My WhatsApp";
    const itemsHtml = ord.items ? buildItemsHtml(ord.items) : (ord.itemsHtml || "");
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
}

function clearOrderHistory() {
  if (confirm("Clear saved order history from this browser?")) {
    localStorage.removeItem("riddhi_orders");
    renderMyOrders();
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

function getAdminSession() {
  try { return JSON.parse(sessionStorage.getItem("riddhi_admin_session") || "null"); } catch (e) { return null; }
}
function isAdminLoggedIn() {
  return !!getAdminSession();
}
function updateAdminMenuLabel() {
  const loggedIn = isAdminLoggedIn();
  const el = document.getElementById("adminMenuLabel");
  if (el) el.textContent = loggedIn ? "Admin Panel (Customers & Orders)" : "Admin Login";

  // Toggle persistent Admin section in Left Sidebar
  const sidebarAdmin = document.getElementById("sidebarAdminSection");
  if (sidebarAdmin) {
    sidebarAdmin.classList.toggle("d-none", !loggedIn);
    if (loggedIn) {
      refreshStockManagerDropdowns();
      syncAutoDeliverUI(isAutoDeliverEnabled());
    }
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
    handleAdminClick();
  }
}
window.addEventListener("hashchange", checkAdminHash);

async function refreshAdminHistory() {
  if (!isAdminLoggedIn()) return;
  try {
    if (await loadAdminOrders()) renderMyOrders();
    else renderMyOrders();
  } catch (e) { /* keep existing */ }
}
document.addEventListener("show.bs.offcanvas", ev => {
  if (ev.target && ev.target.id === "myOrdersOffcanvas") {
    renderMyOrders();
    refreshAdminHistory();
    refreshMyOrderStatuses();
  }
  if (ev.target && ev.target.id === "menuOffcanvas") {
    updateAdminMenuLabel();
  }
});

function handleAdminClick() {
  if (isAdminLoggedIn()) openAllCustomersModal();
  else openAdminLogin();
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
        r = await callScript({ action: "adminLogin", username, password });
      } catch (netErr) {
        showAdminLoginError("Could not connect to server. Check internet and try again.");
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
    }

    clearAdminFails();
    sessionStorage.setItem("riddhi_admin_session", JSON.stringify(session));
    updateAdminMenuLabel();
    renderMyOrders();

    const loginEl = document.getElementById("adminLoginModal");
    loginEl.addEventListener("hidden.bs.modal", () => openAllCustomersModal(true), { once: true });
    bootstrap.Modal.getOrCreateInstance(loginEl).hide();
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldLabel;
    document.getElementById("adminPass").value = "";
  }
}

// Admin logs out ONLY when clicking the Logout button
async function adminLogout() {
  const s = getAdminSession();
  sessionStorage.removeItem("riddhi_admin_session");
  adminOrders = [];
  updateAdminMenuLabel();
  renderMyOrders();
  const panel = document.getElementById("allCustomersModal");
  if (panel) bootstrap.Modal.getOrCreateInstance(panel).hide();
  if (s && s.mode === "sheet" && APPS_SCRIPT_URL) {
    try { await callScript({ action: "adminLogout", token: s.token }); } catch (e) { /* ignore */ }
  }
}

async function loadAdminOrders() {
  const s = getAdminSession();
  if (!s) return false;
  if (s.mode === "sheet") {
    const r = await callScript({ action: "getOrders", token: s.token });
    if (!r.ok) {
      sessionStorage.removeItem("riddhi_admin_session");
      updateAdminMenuLabel();
      return false;
    }
    adminOrders = r.orders || [];
    if (typeof r.autoDeliverEnabled === "boolean") {
      syncAutoDeliverUI(r.autoDeliverEnabled);
    }
  } else {
    autoDeliverLocalOrders();
    adminOrders = getLocalOrders();
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
      itemsHtml: ord.items ? buildItemsHtml(ord.items) : (ord.itemsHtml || "")
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
