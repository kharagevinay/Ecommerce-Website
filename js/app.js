// Kisi bhi user-written text ko HTML me dikhane se pehle escape karta hai (XSS se bachav)
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ==========================================
// PRICE / DISCOUNT HELPERS
// ==========================================
function getProduct(id) {
  return PRODUCTS.find(p => p.id === id);
}
// actualPrice (asli) vs price (offer) -> discount %
function discountPct(p) {
  return p && p.actualPrice > p.price ? Math.round(((p.actualPrice - p.price) / p.actualPrice) * 100) : 0;
}
function priceBlockHtml(p) {
  const pct = discountPct(p);
  return `<span class="price-row"><span class="price-tag">₹${p.price}</span>` +
    (pct ? `<span class="actual-price">₹${p.actualPrice}</span>` : "") + `</span>`;
}

// ==========================================
// LIVE STOCK (runtime state + localStorage)
// Original stock data.js se aata hai. Bika hua quantity localStorage me "sold" ke roop me save hota hai,
// isliye data.js me stock badhane par wo khud apply ho jata hai.
// ==========================================
const SOLD_KEY = "riddhi_sold";
const ORIGINAL_STOCK = {};
PRODUCTS.forEach(p => { ORIGINAL_STOCK[p.id] = p.availableStock; });

function getSoldMap() {
  try { return JSON.parse(localStorage.getItem(SOLD_KEY) || "{}") || {}; } catch (e) { return {}; }
}
function applyStockFromStorage() {
  const sold = getSoldMap();
  PRODUCTS.forEach(p => {
    p.availableStock = Math.max(0, ORIGINAL_STOCK[p.id] - (Number(sold[p.id]) || 0));
  });
}
function deductStock(items) {
  const sold = getSoldMap();
  items.forEach(it => {
    const p = getProduct(it.id);
    if (!p) return;
    sold[it.id] = Math.min(ORIGINAL_STOCK[it.id], (Number(sold[it.id]) || 0) + it.qty);
    p.availableStock = Math.max(0, ORIGINAL_STOCK[it.id] - sold[it.id]);
  });
  try { localStorage.setItem(SOLD_KEY, JSON.stringify(sold)); } catch (e) { /* storage band: sirf runtime me ghatega */ }
  refreshStockViews();
}
function resetStock() {
  if (!confirm("Is device par saare products ka stock original (data.js wala) kar dein?")) return;
  try { localStorage.removeItem(SOLD_KEY); } catch (e) { /* ignore */ }
  applyStockFromStorage();
  refreshStockViews();
  alert("Stock reset ho gaya.");
}
function refreshStockViews() {
  renderNewArrivals(false);
  renderOffers();
  const list = document.getElementById("productListView");
  if (list && !list.classList.contains("d-none")) applyFilters(false);
  updateCartUI();
}
// Ek product ke total qty (cart ki saari lines mila kar)
function cartQtyOf(id) {
  return cart.filter(i => i.id === id).reduce((n, i) => n + i.qty, 0);
}
// items me se jinka stock kam hai unki list (same product ki lines jod kar check hota hai)
function stockProblems(items) {
  const need = {};
  items.forEach(it => { need[it.id] = (need[it.id] || 0) + it.qty; });
  return Object.keys(need).filter(id => {
    const p = getProduct(id);
    return !p || p.availableStock < need[id];
  }).map(id => {
    const p = getProduct(id);
    return `${p ? p.name : id} (ready: ${p ? p.availableStock : 0}, aapko chahiye: ${need[id]})`;
  });
}

let cart = [];
let currentProduct = null;
let currentActiveMedia = { type: "image", src: "" };
let pendingAction = null; // 'order_single' or 'order_cart'
let productModalInstance = null;
let customerModalInstance = null;
let policyModalInstance = null;
let orderSuccessModalInstance = null;
let confirmOrderModalInstance = null;
let removeCartModalInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  const mk = id => document.getElementById(id) ? new bootstrap.Modal(document.getElementById(id)) : null;
  productModalInstance = mk("productModal");
  customerModalInstance = mk("customerDetailsModal");
  policyModalInstance = mk("policyModal");
  orderSuccessModalInstance = mk("orderSuccessModal");
  confirmOrderModalInstance = mk("confirmOrderModal");
  removeCartModalInstance = mk("removeCartModal");

  // Har step alag try/catch me: ek feature fail ho to baaki (products, categories) phir bhi dikhein
  [applyStockFromStorage, renderOffers, renderNewArrivals, renderCategories, updateCartUI, renderMyOrders,
   syncPendingOrders, updateAdminMenuLabel, checkAdminHash, refreshAdminHistory, refreshMyOrderStatuses,
   initNameField, initCityAutocomplete].forEach(fn => {
    try { fn(); } catch (e) { console.error("Init error in " + fn.name, e); }
  });
});

// ==========================================
// FESTIVE OFFERS (ribbon + highlighted cards)
// ==========================================
function renderOffers() {
  const maxOff = Math.max(0, ...PRODUCTS.map(discountPct));

  const track = document.getElementById("offerTrack");
  if (track) {
    const one = (typeof FESTIVE_OFFERS === "undefined" ? [] : FESTIVE_OFFERS).map(t => `<span class="offer-item">${esc(t.replace("{maxOff}", maxOff))}</span>`).join("");
    track.innerHTML = one + one; // 2 baar: taaki marquee beech me ruke bina chalta rahe
  }

  const grid = document.getElementById("offerCardsGrid");
  if (!grid) return;
  const under500 = PRODUCTS.filter(p => p.price < 500 && p.availableStock > 0).length;
  const combos = PRODUCTS.filter(p => p.category === "Combo Set" && p.actualPrice > p.price);
  const bestCombo = combos.sort((a, b) => (b.actualPrice - b.price) - (a.actualPrice - a.price))[0];
  const lowStock = PRODUCTS.filter(p => p.availableStock > 0 && p.availableStock <= 2).length;

  const cards = [
    { tag: "HOT", big: `Up to ${maxOff}% OFF`, title: "Festive Mega Offer", sub: "On handmade jewellery - special offer prices",
      go: "openProductsView('All')" },
    { tag: "BUDGET", big: "Under ₹500", title: "Budget Picks", sub: `${under500} pieces at offer price`,
      go: "openProductsView('All','under-500')" }
  ];
  if (bestCombo) {
    cards.push({ tag: "BEST VALUE", big: `Save ₹${bestCombo.actualPrice - bestCombo.price}`, title: "Wedding Combo Deal", sub: bestCombo.name,
      go: "openProductsView('Combo Set')" });
  }
  cards.push({ tag: "HURRY", big: "Only 1-2 pcs", title: "Limited Stock", sub: `${lowStock} designs are almost gone`,
    go: "openProductsView('All')" });

  grid.innerHTML = cards.map((c, i) => `
    <div class="col-6 col-md-3">
      <div class="offer-card reveal-card" style="--i:${i}" onclick="${c.go}">
        <span class="offer-tag">${esc(c.tag)}</span>
        <div class="offer-big mt-3">${esc(c.big)}</div>
        <div class="offer-title">${esc(c.title)}</div>
        <div class="offer-sub">${esc(c.sub)}</div>
      </div>
    </div>`).join("");
}

// ==========================================
// PRODUCT CARD (New Arrivals + All Products)
// ==========================================
function productCardHtml(prod, opts) {
  const soon = prod.availableStock <= 0;
  const pct = discountPct(prod);
  return `
    <div class="${opts.colClass}">
      <div class="product-card ${opts.animate ? "reveal-card" : ""} ${soon ? "sold-out" : ""}" style="--i:${opts.idx}" onclick="openProductDetail('${prod.id}')">
        <div>
          <div class="position-relative">
            <img src="${prod.images[0]}" alt="${esc(prod.name)}">
            ${opts.isNew ? `<span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2" style="font-size: 10px;">NEW</span>` : ""}
            <span class="badge bg-dark bg-opacity-75 position-absolute top-0 end-0 m-2" style="font-size: 10px;">Stock: ${prod.availableStock}</span>
            ${pct ? `<span class="discount-badge position-absolute bottom-0 start-0 m-2">${pct}% OFF</span>` : ""}
            ${soon ? `<span class="badge soon-badge position-absolute bottom-0 end-0 m-2" style="font-size: 10px;">Available Soon</span>` : ""}
          </div>
          <div class="p-2 p-md-3">
            <small class="text-muted d-block" style="font-size: 11px;">${esc(prod.category)}</small>
            <h6 class="fw-semibold mb-1 text-dark small">${esc(prod.name)}</h6>
          </div>
        </div>
        <div class="px-2 px-md-3 pb-3 d-flex justify-content-between align-items-center gap-1 flex-wrap">
          ${priceBlockHtml(prod)}
          <span class="btn btn-sm btn-green rounded-pill px-3">${soon ? "Enquire" : "View"}</span>
        </div>
      </div>
    </div>`;
}

// ==========================================
// NEW ARRIVALS ON HOME PAGE
// ==========================================
function renderNewArrivals(animate = true) {
  const container = document.getElementById("newArrivalsGrid");
  if (!container) return;
  const newItems = PRODUCTS.filter(p => p.isNewArrival).slice(0, 4);
  container.innerHTML = newItems.map((prod, i) =>
    productCardHtml(prod, { colClass: "col-6 col-md-3", isNew: true, idx: i, animate })).join("");
}

// ==========================================
// 15 CATEGORIES RENDERING (HOME, SIDEBAR, FILTER)
// ==========================================
function renderCategories() {
  const homeGrid = document.getElementById("homeCategoryGrid");
  const sidebarList = document.getElementById("sidebarCategoryList");
  const filterDropdown = document.getElementById("filterCategory");

  CATEGORIES.forEach(cat => {
    if (homeGrid) {
      homeGrid.innerHTML += `
        <div class="col-6 col-md-4 col-lg-3">
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
  ["homeView", "productListView", "aboutView", "careView"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("d-none");
  });
}

function navigateTo(viewName) {
  hideAllViews();
  if (viewName === "home") document.getElementById("homeView").classList.remove("d-none");
  if (viewName === "about") document.getElementById("aboutView").classList.remove("d-none");
  if (viewName === "care") document.getElementById("careView").classList.remove("d-none");
  window.scrollTo(0, 0);
}

function openProductsView(selectedCat = "All", priceFilter = "default") {
  hideAllViews();
  document.getElementById("productListView").classList.remove("d-none");
  document.getElementById("filterCategory").value = selectedCat;
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterPrice").value = priceFilter;
  applyFilters();
  window.scrollTo(0, 0);
}

function applyFilters(animate = true) {
  const selectedCat = document.getElementById("filterCategory").value;
  const searchText = document.getElementById("filterSearch").value.toLowerCase().trim();
  const priceSort = document.getElementById("filterPrice").value;

  document.getElementById("collectionHeading").innerText =
    selectedCat === "All" ? "All Products" : selectedCat + " Collection";

  let filtered = PRODUCTS.filter(prod => {
    const matchCat = (selectedCat === "All") || (prod.category.toLowerCase() === selectedCat.toLowerCase());
    const matchSearch = prod.name.toLowerCase().includes(searchText) ||
                        prod.category.toLowerCase().includes(searchText) ||
                        prod.desc.toLowerCase().includes(searchText);
    return matchCat && matchSearch;
  });

  // Price filters offer price (jo customer ko dena hai) par chalte hain
  switch (priceSort) {
    case "under-500":  filtered = filtered.filter(p => p.price < 500); break;
    case "500-1000":   filtered = filtered.filter(p => p.price >= 500 && p.price <= 1000); break;
    case "1000-1500":  filtered = filtered.filter(p => p.price > 1000 && p.price <= 1500); break;
    case "1500-2000":  filtered = filtered.filter(p => p.price > 1500 && p.price <= 2000); break;
    case "above-2000": filtered = filtered.filter(p => p.price > 2000); break;
    case "low-high":   filtered.sort((a, b) => a.price - b.price); break;
    case "high-low":   filtered.sort((a, b) => b.price - a.price); break;
    case "az":         filtered.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })); break;
    case "za":         filtered.sort((a, b) => b.name.localeCompare(a.name, "en", { sensitivity: "base" })); break;
  }

  document.getElementById("productCountBadge").innerText = filtered.length + " Items";
  const grid = document.getElementById("productsGrid");

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-12 text-center py-5 text-muted">No products found matching your filter.</div>`;
    return;
  }
  grid.innerHTML = filtered.map((prod, i) =>
    productCardHtml(prod, { colClass: "col-6 col-md-4 col-lg-3", isNew: false, idx: i, animate })).join("");
}

// ==========================================
// PRODUCT POPUP (3 IMAGES + 1 VIDEO + FULLSCREEN)
// ==========================================
function openProductDetail(productId) {
  currentProduct = PRODUCTS.find(p => p.id === productId);
  if (!currentProduct) return;

  document.getElementById("modalCategory").innerText = currentProduct.category;
  document.getElementById("modalTitle").innerText = currentProduct.name;
  document.getElementById("modalPrice").innerText = currentProduct.price;
  document.getElementById("modalDesc").innerText = currentProduct.desc;

  // Actual price vs offer price + discount badge
  const pct = discountPct(currentProduct);
  const actualEl = document.getElementById("modalActualPrice");
  const pctEl = document.getElementById("modalDiscountBadge");
  actualEl.innerText = `₹${currentProduct.actualPrice}`;
  pctEl.innerText = `${pct}% OFF`;
  actualEl.classList.toggle("d-none", !pct);
  pctEl.classList.toggle("d-none", !pct);

  // Stock / "Available Soon"
  const stock = currentProduct.availableStock;
  const soon = stock <= 0;
  const stockBadge = document.getElementById("modalStockBadge");
  stockBadge.innerText = soon ? "Stock: 0 | Available Soon" : `Available Stock: ${stock} pcs`;
  stockBadge.className = soon
    ? "badge soon-badge border px-2 py-1"
    : "badge bg-success-subtle text-success border border-success-subtle px-2 py-1";
  document.getElementById("maxStockHint").innerText = `(Max ${stock} ready)`;
  document.getElementById("modalSoonBox").classList.toggle("d-none", !soon);
  document.getElementById("modalOrderControls").classList.toggle("d-none", soon);
  if (soon) {
    const text = `Hello Jewellery by Riddhi! I am interested in "${currentProduct.name}" (${currentProduct.id}), currently showing Available Soon. Please let me know when it is available.`;
    document.getElementById("soonCallBtn").href = `tel:+${WHATSAPP_NUMBER}`;
    document.getElementById("soonWaBtn").href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }

  document.getElementById("modalSize").selectedIndex = 0;
  document.getElementById("modalQty").value = 1;
  document.getElementById("modalCustom").value = "";
  document.getElementById("bulkEnquiryBox").classList.add("d-none");

  const thumbContainer = document.getElementById("modalThumbnails");
  thumbContainer.innerHTML = "";

  // Render up to 3 images
  currentProduct.images.slice(0, 3).forEach((imgUrl, idx) => {
    thumbContainer.innerHTML += `
      <div class="thumb-item ${idx === 0 ? "active" : ""}" onclick="setMainMedia('image', '${imgUrl}', this)">
        <img src="${imgUrl}" alt="Photo ${idx + 1}">
      </div>
    `;
  });

  // Render 1 video thumbnail
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
    mainBox.innerHTML = `${fsBtnHtml}<video id="activeProductVideo" src="${src}" controls autoplay muted playsinline></video>`;
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
    content.innerHTML = `<video src="${currentActiveMedia.src}" controls autoplay playsinline></video>`;
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
  msg += `• Product: *${currentProduct.name}* (${currentProduct.id})\n`;
  msg += `• Price per pc: ₹${currentProduct.price}\n`;
  msg += `• Image: ${currentProduct.images[0]}\n`;
  if (note) msg += `• Customization: _${note}_\n`;
  msg += `\nPlease confirm availability and making time.`;

  sendWhatsAppUrl(WHATSAPP_NUMBER, msg);
}

// ==========================================
// CUSTOMER DETAILS (validation) -> ORDER CONFIRMATION -> WHATSAPP
// Add to Cart par details nahi maangi jaati: product seedha cart me jata hai.
// Details sirf "Order Now" / "Order All on WhatsApp" par maangi jaati hain.
// ==========================================
let pendingDraft = null;     // {items, total, multi} - order button dabate waqt ka snapshot
let pendingCustomer = null;

const NAME_RE = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
function cleanName(v) {
  return String(v || "").replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");
}
function cleanCity(v) {
  return String(v || "").replace(/[^A-Za-z\s.\-]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");
}

// Full Name: typing ke saath hi letters/space ke alawa sab hat jata hai
function initNameField() {
  const el = document.getElementById("custName");
  if (!el) return;
  el.addEventListener("input", () => {
    const v = cleanName(el.value);
    if (v !== el.value) el.value = v;
    el.classList.remove("is-invalid");
  });
}

// City: live suggestions dropdown (India cities). Native <datalist> sirf fallback hai, taaki 2 popup na aayein.
function initCityAutocomplete() {
  const input = document.getElementById("custCity");
  const box = document.getElementById("citySuggestions");
  const dl = document.getElementById("cityList");
  if (!input || !box || typeof INDIAN_CITIES === "undefined") return;
  if (dl) dl.innerHTML = INDIAN_CITIES.map(c => `<option value="${esc(c)}"></option>`).join("");
  input.removeAttribute("list");

  let matches = [];
  let active = -1;

  const hide = () => { box.classList.add("d-none"); active = -1; };
  const pick = city => { input.value = city; hide(); };
  const paint = () => {
    box.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", i === active));
  };
  const show = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return hide();
    const starts = INDIAN_CITIES.filter(c => c.toLowerCase().startsWith(q));
    const has = INDIAN_CITIES.filter(c => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
    matches = starts.concat(has).slice(0, 8);
    if (!matches.length) return hide();
    box.innerHTML = matches.map((c, i) => {
      const at = c.toLowerCase().indexOf(q);
      return `<button type="button" role="option" data-i="${i}">${esc(c.slice(0, at))}<mark>${esc(c.slice(at, at + q.length))}</mark>${esc(c.slice(at + q.length))}</button>`;
    }).join("");
    active = -1;
    box.classList.remove("d-none");
  };

  input.addEventListener("input", () => {
    const v = cleanCity(input.value);
    if (v !== input.value) input.value = v;
    show();
  });
  input.addEventListener("focus", show);
  input.addEventListener("blur", () => setTimeout(hide, 150));
  input.addEventListener("keydown", e => {
    if (box.classList.contains("d-none")) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % matches.length; paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; paint(); }
    else if (e.key === "Enter" && active > -1) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === "Escape") { hide(); }
  });
  // mousedown (click se pehle) taaki input ka blur dropdown na band kar de
  box.addEventListener("mousedown", e => {
    const btn = e.target.closest("button[data-i]");
    if (btn) { e.preventDefault(); pick(matches[Number(btn.dataset.i)]); }
  });
}

function getSavedCustomer() {
  try {
    return JSON.parse(localStorage.getItem("riddhi_customer") || "null");
  } catch (e) {
    return null;
  }
}

function openCustomerModal(actionType) {
  pendingAction = actionType;
  const saved = getSavedCustomer();
  if (saved) {
    document.getElementById("custName").value = cleanName(saved.name);
    document.getElementById("custMobile").value = saved.mobile || "";
    document.getElementById("custAddress").value = saved.address || "";
    document.getElementById("custCity").value = cleanCity(saved.city);
    document.getElementById("custPincode").value = saved.pincode || "";
  }
  document.getElementById("custName").classList.remove("is-invalid");
  customerModalInstance.show();
}

function submitCustomerDetails(e) {
  e.preventDefault();
  const nameEl = document.getElementById("custName");
  const name = cleanName(nameEl.value).trim();
  const mobile = document.getElementById("custMobile").value.trim();
  const address = document.getElementById("custAddress").value.trim();
  const city = cleanCity(document.getElementById("custCity").value).trim();
  const pincode = document.getElementById("custPincode").value.trim();

  if (!NAME_RE.test(name) || name.length < 2) {
    nameEl.classList.add("is-invalid");
    nameEl.focus();
    return;
  }
  if (!name || !mobile || !address || !city || !pincode) {
    alert("Please fill all required fields: Name, Mobile Number, Address, City, and Pincode.");
    return;
  }

  const customerObj = { name, mobile, address, city, pincode };
  try { localStorage.setItem("riddhi_customer", JSON.stringify(customerObj)); } catch (err) { /* ignore */ }
  pendingCustomer = customerObj;

  // Details modal band hone ke baad order review/confirmation dikhayein
  document.getElementById("customerDetailsModal").addEventListener(
    "hidden.bs.modal", () => showOrderConfirmation(), { once: true });
  customerModalInstance.hide();
}

// ---- Order review & confirmation step ----
function showOrderConfirmation() {
  if (!pendingDraft || !pendingCustomer) return;
  const { items, total } = pendingDraft;
  const c = pendingCustomer;
  const savings = items.reduce((n, i) => n + Math.max(0, ((i.actualPrice || i.price) - i.price) * i.qty), 0);
  document.getElementById("confirmOrderBody").innerHTML = `
    <div class="small">
      ${buildItemsHtml(items)}
      <div class="d-flex justify-content-between fw-bold mt-2" style="color: var(--primary-green);">
        <span>Total</span><span>₹${esc(total)}</span>
      </div>
      ${savings ? `<div class="text-success" style="font-size:12px;">You save ₹${esc(savings)} on this order 🎉</div>` : ""}
      <hr class="my-2">
      <div class="fw-semibold text-dark">👤 ${esc(c.name)}</div>
      <div class="text-muted">📞 ${esc(c.mobile)}</div>
      <div class="text-muted">📍 ${esc(c.address)}, ${esc(c.city)} - ${esc(c.pincode)}</div>
    </div>`;
  confirmOrderModalInstance.show();
}

function editOrderDetails() {
  document.getElementById("confirmOrderModal").addEventListener(
    "hidden.bs.modal", () => openCustomerModal(pendingAction), { once: true });
  confirmOrderModalInstance.hide();
}

function cancelOrderConfirmation() {
  pendingDraft = null;
  pendingCustomer = null;
  confirmOrderModalInstance.hide();
}

// ---- WhatsApp message branding ----
// wa.me links sirf text bhejte hain (file attach nahi hoti), isliye logo ka link message me jata hai;
// WhatsApp us link ko photo preview ki tarah dikha deta hai (site https par hosted ho tab).
function logoUrl() {
  try {
    if (typeof SITE_BASE_URL !== "undefined" && SITE_BASE_URL) return SITE_BASE_URL.replace(/\/+$/, "") + "/assets/logo.png";
    const u = new URL("assets/logo.png", location.href);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch (e) { return ""; }
}
function brandHeader() {
  const logo = logoUrl();
  return `💎 *JEWELLERY BY RIDDHI* 💎\n` + (logo ? `🖼️ Logo: ${logo}\n` : "") + `━━━━━━━━━━━━━━\n`;
}
// Product ka name, size, quantity, price, image aur grand total - order aur status dono messages me
function itemsMessageBlock(items, total) {
  let t = "";
  (items || []).forEach((it, idx) => {
    t += `*${idx + 1}. ${it.name}* (${it.id})\n`;
    t += `   • Size: ${it.size}\n`;
    t += `   • Qty: ${it.qty} x ₹${it.price} = *₹${it.price * it.qty}*\n`;
    if (it.note) t += `   • Customization: _${it.note}_\n`;
    if (safeImgUrl(it.image)) t += `   • Image: ${it.image}\n`;
    t += `\n`;
  });
  const grand = total != null ? total : (items || []).reduce((n, i) => n + i.price * i.qty, 0);
  return t + `💰 *Grand Total: ₹${grand}*\n`;
}

function buildOrderMessage(items, total, cust, multi) {
  let msg = brandHeader() + `Hello *Jewellery by Riddhi*! ✨\n*${multi ? "NEW MULTI-ITEM ORDER" : "NEW ORDER RECEIVED"}*\n\n`;
  items.forEach((it, idx) => {
    const mrp = it.actualPrice > it.price ? ` (MRP ~₹${it.actualPrice}~)` : "";
    msg += `*${idx + 1}. ${it.name}* (${it.id})\n`;
    msg += `   • Size: ${it.size}\n`;
    msg += `   • Qty: ${it.qty} x ₹${it.price}${mrp} = *₹${it.price * it.qty}*\n`;
    if (it.note) msg += `   • Customization: _${it.note}_\n`;
    msg += `   • Image: ${it.image}\n\n`;
  });
  msg += `💰 *Grand Total: ₹${total}*\n\n`;
  msg += formatCustomerBlock(cust);
  return msg;
}

// "Yes, Confirm & Send on WhatsApp"
function confirmAndSendOrder() {
  if (!pendingDraft || !pendingCustomer) return;
  const { items, total, multi } = pendingDraft;
  const cust = pendingCustomer;

  // stock dobara check (beech me kam ho gaya ho to)
  const bad = stockProblems(items);
  if (bad.length) {
    alert("Ye items ab itne ready nahi hain:\n\n" + bad.join("\n") + "\n\nPlease cart/quantity update karein ya WhatsApp par enquiry karein.");
    cancelOrderConfirmation();
    return;
  }

  confirmOrderModalInstance.hide();
  const msg = buildOrderMessage(items, total, cust, multi);

  const order = saveOrderToHistory({
    total, items, customer: cust,
    fullMessage: `📋 *Order Receipt - Jewellery by Riddhi*\n\n` + msg
  });

  deductStock(items);   // live stock kam karein
  dispatchOrderToSellerAndCustomer(msg, cust.mobile, buildSummaryHtml(items, total, cust));
  syncOrderToSheet(order);

  if (multi) {
    cart = [];
    updateCartUI();
  }
  pendingDraft = null;
  pendingCustomer = null;
}

function handleOrderSingleClick() {
  if (!currentProduct) return;
  const p = getProduct(currentProduct.id);
  const qty = parseInt(document.getElementById("modalQty").value) || 1;
  if (p.availableStock <= 0) {
    alert("Ye product abhi Available Soon hai. Please Call/WhatsApp enquiry karein.");
    return;
  }
  if (qty > p.availableStock) {
    alert(`Sirf ${p.availableStock} piece ready hain. 3+ pieces ke liye "Enquire 3+ Pcs" use karein.`);
    return;
  }
  const item = {
    id: p.id, name: p.name, size: document.getElementById("modalSize").value, qty,
    price: p.price, actualPrice: p.actualPrice,
    note: document.getElementById("modalCustom").value.trim(), image: p.images[0]
  };
  pendingDraft = { items: [item], total: p.price * qty, multi: false };
  openCustomerModal("order_single");
}

function handleCheckoutCartClick() {
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }
  const items = cart.map(i => ({
    id: i.id, name: i.name, size: i.size, qty: i.qty,
    price: i.price, actualPrice: i.actualPrice, note: i.customNote || "", image: i.images[0]
  }));
  const bad = stockProblems(items);
  if (bad.length) {
    alert("Cart me kuch items ka stock kam hai:\n\n" + bad.join("\n") + "\n\nPlease quantity kam karein ya item hata dein.");
    return;
  }
  pendingDraft = { items, total: items.reduce((n, i) => n + i.price * i.qty, 0), multi: true };
  openCustomerModal("order_cart");
}

// ==========================================
// CART  (Add to Cart = sirf cart me jodta hai, order place nahi hota)
// ==========================================
function handleAddToCartClick() {
  if (!currentProduct) return;
  const p = getProduct(currentProduct.id);
  const qty = parseInt(document.getElementById("modalQty").value) || 1;
  const inCart = cartQtyOf(p.id);

  if (p.availableStock <= 0) {
    alert("Ye product abhi Available Soon hai.");
    return;
  }
  if (inCart + qty > p.availableStock) {
    alert(inCart
      ? `Cart me already ${inCart} piece hai. Sirf ${p.availableStock} piece ready hain.`
      : `Sirf ${p.availableStock} piece ready hain.`);
    return;
  }

  const size = document.getElementById("modalSize").value;
  const customNote = document.getElementById("modalCustom").value.trim();
  const existingIndex = cart.findIndex(item =>
    item.id === p.id && item.size === size && item.customNote === customNote
  );
  if (existingIndex > -1) {
    cart[existingIndex].qty += qty;
  } else {
    cart.push({ ...p, size, qty, customNote });
  }

  updateCartUI();
  bumpCartBadge();
  closeProductModal();
  bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("cartOffcanvas")).show();
}

function bumpCartBadge() {
  const el = document.getElementById("navCartCount");
  if (!el) return;
  el.classList.remove("cart-bump");
  void el.offsetWidth;
  el.classList.add("cart-bump");
}

function updateCartItemQty(index, delta) {
  const item = cart[index];
  if (!item) return;
  if (delta < 0 && item.qty + delta <= 0) {
    askRemoveCartItem(index);          // qty 0 hone par seedha nahi hatate, pehle poochte hain
    return;
  }
  if (delta > 0) {
    const p = getProduct(item.id);
    if (!p || cartQtyOf(item.id) + delta > p.availableStock) {
      alert(`Sirf ${p ? p.availableStock : 0} piece ready hain.`);
      return;
    }
  }
  item.qty += delta;
  updateCartUI();
}

// ---- Remove from cart confirmation ----
let pendingRemoveIndex = null;

function askRemoveCartItem(index) {
  if (!cart[index]) return;
  pendingRemoveIndex = index;
  document.getElementById("removeCartName").innerText = cart[index].name;
  removeCartModalInstance.show();
}
function confirmRemoveCartItem() {
  if (pendingRemoveIndex !== null && cart[pendingRemoveIndex]) cart.splice(pendingRemoveIndex, 1);
  pendingRemoveIndex = null;
  removeCartModalInstance.hide();
  updateCartUI();
}
function cancelRemoveCartItem() {
  pendingRemoveIndex = null;
  removeCartModalInstance.hide();
}

function updateCartUI() {
  const container = document.getElementById("cartItemsContainer");
  if (!container) return;
  const navCount = document.getElementById("navCartCount");
  const floatBtn = document.getElementById("floatingCartBtn");
  const saveRow = document.getElementById("cartSavingsRow");

  let totalQty = 0;
  let totalPrice = 0;
  let totalSavings = 0;

  if (cart.length === 0) {
    container.innerHTML = `<div class="text-center text-muted my-5"><i class="bi bi-bag-x fs-1"></i><p class="mt-2">Your cart is empty.</p></div>`;
    navCount.innerText = "0";
    document.getElementById("cartTotal").innerText = "0";
    if (saveRow) saveRow.classList.add("d-none");
    floatBtn.classList.add("d-none");
    return;
  }

  container.innerHTML = "";
  cart.forEach((item, index) => {
    totalQty += item.qty;
    totalPrice += item.price * item.qty;
    const pct = discountPct(item);
    if (pct) totalSavings += (item.actualPrice - item.price) * item.qty;
    const live = getProduct(item.id);
    const stockWarn = live && live.availableStock < cartQtyOf(item.id)
      ? `<small class="text-danger d-block" style="font-size: 11px;"><i class="bi bi-exclamation-triangle me-1"></i>${live.availableStock <= 0 ? "Available Soon - please remove" : `Only ${live.availableStock} ready`}</small>`
      : "";

    container.innerHTML += `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-2 d-flex gap-2 align-items-center">
          <img src="${item.images[0]}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">
          <div class="flex-grow-1">
            <h6 class="mb-0 small fw-bold">${esc(item.name)}</h6>
            <small class="text-muted d-block" style="font-size: 11px;">Size: ${esc(item.size)}</small>
            ${item.customNote ? `<small class="text-success d-block" style="font-size: 11px;"><strong>Note:</strong> ${esc(item.customNote)}</small>` : ""}
            ${stockWarn}
            <div class="d-flex justify-content-between align-items-center mt-1">
              <span class="price-row">
                <span class="fw-bold small" style="color: var(--primary-green);">₹${item.price * item.qty}</span>
                ${pct ? `<span class="actual-price" style="font-size:11px;">₹${item.actualPrice * item.qty}</span><span class="discount-badge">${pct}% OFF</span>` : ""}
              </span>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary py-0 px-2" onclick="updateCartItemQty(${index}, -1)">-</button>
                <span class="btn btn-light py-0 px-2 disabled text-dark fw-bold">${item.qty}</span>
                <button class="btn btn-outline-secondary py-0 px-2" onclick="updateCartItemQty(${index}, 1)">+</button>
              </div>
            </div>
          </div>
          <button class="btn btn-sm text-danger" onclick="askRemoveCartItem(${index})" aria-label="Remove from cart"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  });

  navCount.innerText = totalQty;
  document.getElementById("cartTotal").innerText = totalPrice;
  if (saveRow) {
    saveRow.classList.toggle("d-none", totalSavings <= 0);
    document.getElementById("cartSavings").innerText = totalSavings;
  }
  floatBtn.classList.remove("d-none");
  document.getElementById("floatCount").innerText = totalQty;
  document.getElementById("floatTotal").innerText = totalPrice;
}

function formatCustomerBlock(cust) {
  return `👤 *Customer Details:*\n` +
         `• Name: ${cust.name}\n` +
         `• Mobile: ${cust.mobile}\n` +
         `• Address: ${cust.address}, ${cust.city} - ${cust.pincode}\n`;
}

// Order ki items list ko safe HTML me badalta hai (customer ka likha text escape hota hai)
// ==========================================
// ORDER STATUS
// ==========================================
// "Custom Making" / "Partial Stock Ready": jab customer ko 3-4+ pieces chahiye aur stock kam ho, admin ye status daalta hai
const ORDER_STATUSES = ["Pending", "Confirmed", "Custom Making", "Partial Stock Ready", "Packed", "Shipped", "Delivered", "Cancelled"];
const NOT_SHIPPED_STATUSES = ["Pending", "Confirmed", "Custom Making", "Partial Stock Ready", "Packed"];
const STATUS_META = {
  Pending:   { label: "Order Placed (Pending)", cls: "bg-secondary",         msg: "Aapka order mil gaya hai. Hum jaldi confirm karenge. Customer ko call/WhatsApp karenge aur payment lenge tabhi order confirmed hoga.",
               waMsg: "Aapka order mil gaya hai. Hum jaldi confirm karenge." },
  Confirmed: { label: "Confirmed",              cls: "bg-primary",           msg: "Aapka order confirm ho gaya hai." },
  "Custom Making":       { label: "Custom Making",       cls: "bg-dark",            msg: "Aapke extra pieces custom banaye ja rahe hain. Ready hote hi hum aapko batayenge." },
  "Partial Stock Ready": { label: "Partial Stock Ready", cls: "bg-info text-dark",  msg: "Aapke order ka kuch stock ready hai, baaki pieces ban rahe hain. Hum aapse WhatsApp par baat karenge." },
  Packed:    { label: "Packed",                 cls: "bg-info text-dark",    msg: "Aapka order pack ho gaya hai." },
  Shipped:   { label: "Shipped",                cls: "bg-warning text-dark", msg: "Aapka order ship ho gaya hai." },
  Delivered: { label: "Delivered",              cls: "bg-success",           msg: "Aapka order deliver ho gaya hai. Dhanyavaad!" },
  Cancelled: { label: "Cancelled",              cls: "bg-danger",            msg: "Aapka order cancel kar diya gaya hai." }
};
const STATUS_FLOW = ["Pending", "Confirmed", "Packed", "Shipped", "Delivered"];

function normStatus(st) {
  return ORDER_STATUSES.includes(st) ? st : "Pending";
}

function fmtStatusTime(ts) {
  return ts ? new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
}

// Customer ko dikhne wala status: badge + chhota progress tracker
function customerStatusHtml(ord) {
  const st = normStatus(ord.status);
  const meta = STATUS_META[st];
  let tracker = "";
  if (st !== "Cancelled") {
    // Custom Making / Partial Stock Ready "Confirmed" aur "Packed" ke beech ka step hai
    const idx = STATUS_FLOW.includes(st) ? STATUS_FLOW.indexOf(st) : STATUS_FLOW.indexOf("Confirmed");
    tracker = `<div class="d-flex align-items-center my-2" aria-hidden="true">` + STATUS_FLOW.map((step, i) => `
      <div class="text-center" style="flex:1;">
        <div class="mx-auto rounded-circle" style="width:12px;height:12px;background:${i <= idx ? "var(--primary-green)" : "#d9d2c5"};"></div>
        <div style="font-size:9px;" class="${i <= idx ? "fw-semibold" : "text-muted"}">${step === "Pending" ? "Placed" : step}</div>
      </div>`).join("") + `</div>`;
  }
  return `
    <div class="p-2 rounded mb-2" style="background:#fdfaf5;border:1px solid #efe3d2;">
      <div class="d-flex justify-content-between align-items-center">
        <span class="badge ${meta.cls}">${esc(meta.label)}</span>
        ${ord.statusUpdated ? `<span class="text-muted" style="font-size:10px;">Updated: ${esc(fmtStatusTime(ord.statusUpdated))}</span>` : ""}
      </div>
      ${tracker}
      <div class="text-muted" style="font-size:11px;">${esc(meta.msg)}</div>
    </div>`;
}

// Admin ke liye status dropdown + customer ko WhatsApp se batane ka button
function adminStatusControl(orderId, status, custName, custMobile, order) {
  const st = normStatus(status);
  let wa = String(custMobile || "").replace(/[^0-9]/g, "");
  if (wa.length === 10) wa = "91" + wa;
  let text = brandHeader() + `Namaste ${custName || ""}! 🌸\nAapke order *${orderId}* ka status: *${STATUS_META[st].label}*\n${STATUS_META[st].waMsg || STATUS_META[st].msg}\n\n`;
  if (order && order.items && order.items.length) {
    text += `🛍️ *Order Details:*\n` + itemsMessageBlock(order.items, order.total) + `\n`;
  }
  text += `- Jewellery by Riddhi`;
  return `
    <div class="d-flex flex-wrap align-items-center gap-2 my-2">
      <select class="form-select form-select-sm w-auto" data-oid="${esc(orderId)}" onchange="adminChangeStatus(this)" aria-label="Order status">
        ${ORDER_STATUSES.map(x => `<option value="${x}" ${x === st ? "selected" : ""}>${STATUS_META[x].label}</option>`).join("")}
      </select>
      <a href="https://wa.me/${wa}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" class="btn btn-outline-success btn-sm py-0 px-2" style="font-size:11px;"><i class="bi bi-whatsapp"></i> Customer ko batayein</a>
    </div>`;
}

async function adminChangeStatus(sel) {
  const orderId = sel.dataset.oid;
  const status = sel.value;
  const s = getAdminSession();
  if (!s) return;
  sel.disabled = true;
  try {
    let updated = Date.now();
    if (s.mode === "sheet") {
      const r = await callScript({ action: "updateStatus", token: s.token, orderId, status });
      if (!r.ok) {
        if (r.error === "auth") {
          localStorage.removeItem("riddhi_admin_session");
          updateAdminMenuLabel();
          alert("Session expire ho gaya. Dobara admin login karein.");
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
        o.statusUpdated = updated;
        localStorage.setItem("riddhi_orders", JSON.stringify(orders));
      }
    }
    const mine = adminOrders.find(x => x.orderId === orderId);
    if (mine) { mine.status = status; mine.statusUpdated = updated; }
  } catch (e) {
    alert("Status update nahi ho paya. Internet check karke dobara try karein.");
  } finally {
    sel.disabled = false;
    renderAllCustomersSummary();
    renderMyOrders();
  }
}

// Customer ke device par status Sheet se laata hai (orderId + mobile match hone par hi)
async function refreshMyOrderStatuses() {
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
      if (st && (o.status !== st.status || o.statusUpdated !== st.updated)) {
        o.status = st.status;
        o.statusUpdated = st.updated;
        changed = true;
      }
    });
    if (changed) localStorage.setItem("riddhi_orders", JSON.stringify(fresh));
    renderMyOrders();
  } catch (e) { /* internet nahi: purana status dikhta rahega */ }
}

function safeImgUrl(u) {
  return /^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? u : "";
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
      <div class="fw-bold mt-1" style="color: var(--primary-green);">Total: ₹${esc(total)}</div>
      <hr class="my-2">
      <div class="fw-semibold text-dark">👤 ${esc(cust.name)} (${esc(cust.mobile)})</div>
      <div class="text-muted">${esc(cust.address)}, ${esc(cust.city)} - ${esc(cust.pincode)}</div>
    </div>`;
}

function dispatchOrderToSellerAndCustomer(orderMessage, customerMobile, summaryHtml = "") {
  // 1. Seller ko WhatsApp
  sendWhatsAppUrl(WHATSAPP_NUMBER, orderMessage);

  // 2. Customer ka number clean karein (10 digit ho to 91 lagayein)
  let cleanCustPhone = customerMobile.replace(/[^0-9]/g, "");
  if (cleanCustPhone.length === 10) cleanCustPhone = "91" + cleanCustPhone;

  const customerCopyMsg =
    `📋 *Order Receipt - Jewellery by Riddhi*\n` +
    `Thank you for your order! Here are your ordered product & delivery details:\n\n` +
    orderMessage;

  const custWaUrl = `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(customerCopyMsg)}`;

  // 3. Popups band karke "Order Placed" popup dikhayein
  closeProductModal();
  const cartEl = document.getElementById("cartOffcanvas");
  const cartOffcanvasInst = bootstrap.Offcanvas.getInstance(cartEl);
  if (cartOffcanvasInst) cartOffcanvasInst.hide();

  const summaryBox = document.getElementById("successOrderSummaryBox");
  const custBtn = document.getElementById("customerWhatsAppCopyBtn");
  if (summaryBox) summaryBox.innerHTML = summaryHtml;
  const noteBox = document.getElementById("successStatusNote");
  if (noteBox) noteBox.innerHTML = `<i class="bi bi-info-circle-fill me-1" style="color: var(--accent-gold);"></i><strong>Order Status: ${esc(STATUS_META.Pending.label)}</strong><br>${esc(STATUS_META.Pending.msg)}`;
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
      <h6 class="fw-bold" style="color: var(--primary-green);">Order Processing & Dispatch</h6>
      <p class="small text-muted">All pieces at <strong>Jewellery by Riddhi</strong> are handmade to order or carefully inspected before dispatch. Ready-to-ship items are dispatched within <strong>2–4 business days</strong>, and custom/bulk orders (3+ pieces) take <strong>5–8 business days</strong>.</p>
      <h6 class="fw-bold" style="color: var(--primary-green);">Delivery Timelines & Charges</h6>
      <ul class="small text-muted">
        <li><strong>Pune & Maharashtra:</strong> Typically 2–4 working days after dispatch.</li>
        <li><strong>Rest of India:</strong> Typically 4–7 working days via trusted courier partners.</li>
        <li>Shipping charges (if applicable) are confirmed on WhatsApp prior to final payment.</li>
      </ul>
    `;
  } else {
    titleEl.innerHTML = `<i class="bi bi-arrow-counterclockwise me-2"></i>Return & Replacement Policy`;
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
// MY ORDERS HISTORY (LOCALSTORAGE - sirf is device ke liye)
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

// ---- My Orders filters: All / Not Yet Shipped / Date-wise (30 days, 3 months, year) ----
function filterOrders(list, f) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  if (f === "notshipped") return list.filter(o => NOT_SHIPPED_STATUSES.includes(normStatus(o.status)));
  if (f.startsWith("status-")) return list.filter(o => normStatus(o.status) === f.slice(7));
  if (f === "last30") return list.filter(o => (o.timestamp || 0) >= now - 30 * DAY);
  if (f === "last3m") return list.filter(o => (o.timestamp || 0) >= now - 90 * DAY);
  if (f.startsWith("year-")) {
    const y = Number(f.slice(5));
    return list.filter(o => new Date(o.timestamp || 0).getFullYear() === y);
  }
  return list;
}

// Year-wise options orders ke saal ke hisaab se khud ban jaate hain (current saal hamesha)
function syncYearOptions(orders) {
  const sel = document.getElementById("orderFilter");
  if (!sel) return;
  const years = new Set([new Date().getFullYear()]);
  orders.forEach(o => { const y = new Date(o.timestamp || 0).getFullYear(); if (y > 2000) years.add(y); });
  const cur = sel.value;
  sel.querySelectorAll("option[data-year]").forEach(o => o.remove());
  Array.from(years).sort((a, b) => b - a).forEach(y => {
    const opt = new Option(`Year ${y}`, `year-${y}`);
    opt.dataset.year = "1";
    (document.getElementById("orderDateGroup") || sel).appendChild(opt);
  });
  sel.value = Array.from(sel.options).some(o => o.value === cur) ? cur : "all";
}

function renderMyOrders() {
  const container = document.getElementById("myOrdersListContainer");
  const badge = document.getElementById("navOrdersCount");
  const adminView = isAdminLoggedIn();
  // Admin ko yahan saare customers ke orders dikhte hain, customer ko sirf apne
  const allOrders = adminView
    ? adminOrders.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    : getLocalOrders();
  syncYearOptions(allOrders);
  const orders = filterOrders(allOrders, (document.getElementById("orderFilter") || {}).value || "all");

  const warn = adminView && (getAdminSession() || {}).mode === "local"
    ? `<div class="alert alert-warning small py-2"><strong>Google Sheet connect nahi hai.</strong> Sirf is device ke orders dikh rahe hain. <code>js/data.js</code> me <code>APPS_SCRIPT_URL</code> daalein (SETUP-HINDI.md dekhein), phir dobara login karein.</div>`
    : "";

  const titleEl = document.querySelector("#myOrdersOffcanvas .offcanvas-title");
  if (titleEl) titleEl.innerHTML = adminView
    ? `<i class="bi bi-receipt-cutoff me-2"></i>All Orders (Admin)`
    : `<i class="bi bi-receipt-cutoff me-2"></i>My Placed Orders`;
  const footEl = document.querySelector("#myOrdersOffcanvas .border-top");
  if (footEl) footEl.classList.toggle("d-none", adminView);

  if (badge) {
    if (allOrders.length > 0) {
      badge.innerText = allOrders.length;
      badge.classList.remove("d-none");
    } else {
      badge.classList.add("d-none");
    }
  }
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = warn + `
      <div class="text-center text-muted my-5">
        <i class="bi bi-receipt fs-1"></i>
        <p class="mt-2 small">${allOrders.length ? "No orders match this filter." : adminView ? "No orders yet." : "You haven't placed any orders on this device yet."}</p>
      </div>`;
    return;
  }

  const refreshBtn = (!adminView && APPS_SCRIPT_URL)
    ? `<button type="button" class="btn btn-outline-dark btn-sm w-100 mb-3 rounded-pill" onclick="refreshMyOrderStatuses()"><i class="bi bi-arrow-clockwise me-1"></i>Refresh Order Status</button>`
    : "";

  container.innerHTML = warn + refreshBtn + orders.map(ord => {
    const cust = ord.customer || {};
    let cleanCustPhone = (cust.mobile || "").replace(/[^0-9]/g, "");
    if (cleanCustPhone.length === 10) cleanCustPhone = "91" + cleanCustPhone;
    const waSelfUrl = adminView
      ? `https://wa.me/${cleanCustPhone}`
      : `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(ord.fullMessage || "")}`;
    const waLabel = adminView ? "Chat with Customer" : "Send Copy to My WhatsApp";
    const itemsHtml = ord.items ? buildItemsHtml(ord.items) : (ord.itemsHtml || "");
    const statusHtml = adminView
      ? adminStatusControl(ord.orderId, ord.status, cust.name, cust.mobile, ord)
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
// GOOGLE SHEET SYNC (har device ka order ek hi Sheet me)
// ==========================================
async function callScript(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    // text/plain rakhne se browser "preflight" nahi bhejta, Apps Script isi ke saath chalta hai
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

function toSheetOrder(o) {
  return {
    orderId: o.orderId, timestamp: o.timestamp, date: o.date, total: o.total,
    customer: o.customer, items: o.items || []
  };
}

async function syncOrderToSheet(order) {
  if (!APPS_SCRIPT_URL || !order) return;
  try {
    const r = await callScript({ action: "newOrder", order: toSheetOrder(order) });
    if (!r.ok) throw new Error(r.error || "sync failed");
  } catch (e) {
    // internet/server issue: baad me dobara try hoga
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
// ADMIN LOGIN (sirf admin ko customers/orders dikhte hain)
// ==========================================
let adminOrders = [];

function getAdminSession() {
  try { return JSON.parse(localStorage.getItem("riddhi_admin_session") || "null"); } catch (e) { return null; }
}
function isAdminLoggedIn() {
  return !!getAdminSession();
}
function updateAdminMenuLabel() {
  const on = isAdminLoggedIn();
  // Sidebar ke admin-only items (All Orders (Admin), Customers panel, Logout) login ke baad hi dikhte hain
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("d-none", !on));
}

async function sha256Hex(text) {
  if (!(window.crypto && crypto.subtle)) {
    throw new Error("no-crypto");
  }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Local mode ka naya password hash banane ke liye console me:  makeAdminHash("user","pass")
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

// Admin link customers ko menu me nahi dikhta. Admin ke raaste:
//  1) site ka link  index.html#admin  kholna
//  2) top-left logo/naam par jaldi-jaldi 5 baar tap karna
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

// Order history khulte hi admin ke liye taaza data laata hai
async function refreshAdminHistory() {
  if (!isAdminLoggedIn()) return;
  try {
    if (await loadAdminOrders()) renderMyOrders();
    else renderMyOrders();
  } catch (e) { /* purana data dikhta rahega */ }
}
document.addEventListener("show.bs.offcanvas", ev => {
  if (ev.target && ev.target.id === "myOrdersOffcanvas") {
    renderMyOrders();
    refreshAdminHistory();
    refreshMyOrderStatuses();
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
    showAdminLoginError(`Bahut zyada galat koshish. ${Math.ceil(lockMs / 60000)} minute baad try karein.`);
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
        showAdminLoginError("Server se connect nahi ho paya. Internet check karke dobara try karein.");
        return;
      }
      if (!r.ok) {
        if (r.error !== "locked") registerAdminFail();
        showAdminLoginError(r.error === "locked"
          ? "Bahut zyada galat koshish. Kuch der baad try karein."
          : "Username ya password galat hai.");
        return;
      }
      session = { mode: "sheet", token: r.token };
      adminOrders = r.orders || [];
    } else {
      let hash;
      try {
        hash = await sha256Hex(username + ":" + password);
      } catch (cryptoErr) {
        showAdminLoginError("Login ke liye site ko https:// ya localhost par kholein.");
        return;
      }
      if (username !== ADMIN_USERNAME || hash !== ADMIN_LOCAL_HASH) {
        registerAdminFail();
        showAdminLoginError("Username ya password galat hai.");
        return;
      }
      session = { mode: "local" };
      adminOrders = getLocalOrders();
    }

    clearAdminFails();
    localStorage.setItem("riddhi_admin_session", JSON.stringify(session));
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

async function adminLogout() {
  if (!confirm("Admin se logout karna hai?")) return;
  ["menuOffcanvas", "myOrdersOffcanvas"].forEach(id => {
    const inst = bootstrap.Offcanvas.getInstance(document.getElementById(id));
    if (inst) inst.hide();
  });
  const s = getAdminSession();
  localStorage.removeItem("riddhi_admin_session");
  adminOrders = [];
  updateAdminMenuLabel();
  renderMyOrders();
  const panel = document.getElementById("allCustomersModal");
  if (panel) bootstrap.Modal.getOrCreateInstance(panel).hide();
  if (s && s.mode === "sheet" && APPS_SCRIPT_URL) {
    try { await callScript({ action: "adminLogout", token: s.token }); } catch (e) { /* ignore */ }
  }
}

// ==========================================
// ADMIN PANEL: ALL CUSTOMERS & ORDERS
// ==========================================
async function loadAdminOrders() {
  const s = getAdminSession();
  if (!s) return false;
  if (s.mode === "sheet") {
    const r = await callScript({ action: "getOrders", token: s.token });
    if (!r.ok) {
      // session expire ho gaya
      localStorage.removeItem("riddhi_admin_session");
      updateAdminMenuLabel();
      return false;
    }
    adminOrders = r.orders || [];
  } else {
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

  document.getElementById("customerSearchInput").value = "";
  document.getElementById("customerFilterType").value = "all";
  document.getElementById("customerFilterStatus").value = "all";

  const s = getAdminSession();
  const srcEl = document.getElementById("adminSourceBadge");
  if (srcEl) {
    srcEl.className = "badge " + (s.mode === "sheet" ? "bg-success" : "bg-warning text-dark");
    srcEl.textContent = s.mode === "sheet" ? "Source: Google Sheet (saare devices)" : "Source: Sirf is device ka data";
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
      showAdminLoginError("Session expire ho gaya. Dobara login karein.");
      return;
    }
  } catch (e) {
    if (container) container.innerHTML = `<div class="text-center text-danger py-4 small">Orders load nahi ho paaye. Internet check karke Refresh dabayein.</div>`;
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
      custName: cust.name, custMobile: cust.mobile,
      items: ord.items || [],
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
  const filterStatus = document.getElementById("customerFilterStatus")?.value || "all";

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
  if (filterStatus !== "all") {
    customers = customers
      .map(c => ({ ...c, orders: c.orders.filter(o => normStatus(o.status) === filterStatus) }))
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
    let wa = String(c.mobile).replace(/[^0-9]/g, "");
    if (wa.length === 10) wa = "91" + wa;

    const historyHtml = c.orders.map(o => `
      <div class="p-2 rounded mb-1" style="background-color: #fdfaf5; border: 1px solid #efe3d2;">
        <div class="d-flex justify-content-between align-items-center">
          <span class="fw-bold text-dark">${esc(o.orderId)} <span class="badge ${o.period === "Present" ? "bg-success" : "bg-secondary"}" style="font-size:10px;">${o.period === "Present" ? "Recent" : "Past"}</span></span>
          <span class="fw-bold" style="color: var(--primary-green);">₹${esc(o.total)}</span>
        </div>
        <div class="text-muted" style="font-size:11px;">${esc(o.date)}</div>
        ${adminStatusControl(o.orderId, o.status, o.custName, o.custMobile, o)}
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

// CSV export (Excel me khulta hai)
function csvCell(v) {
  let t = String(v ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(t)) t = "'" + t; // Excel formula injection se bachav
  return '"' + t.replace(/"/g, '""') + '"';
}

function exportOrdersCsv() {
  if (!isAdminLoggedIn()) return;
  const rows = [["Order ID", "Date", "Name", "Mobile", "Address", "City", "Pincode", "Items", "Image Links", "Total (INR)", "Status"]];
  adminOrders.forEach(o => {
    const c = o.customer || {};
    const items = (o.items || []).map(i => `${i.name} (${i.id}) x${i.qty} [${i.size}]${i.note ? " note: " + i.note : ""}`).join(" | ");
    const imgs = (o.items || []).map(i => i.image || "").filter(Boolean).join(" | ");
    rows.push([o.orderId, o.date, c.name, c.mobile, c.address, c.city, c.pincode, items, imgs, o.total, normStatus(o.status)]);
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
