// Kisi bhi user-written text ko HTML me dikhane se pehle escape karta hai (XSS se bachav)
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let cart = [];
let currentProduct = null;
let currentActiveMedia = { type: "image", src: "" };
let pendingAction = null; // 'add_to_cart' or 'order_single'
let productModalInstance = null;
let customerModalInstance = null;
let policyModalInstance = null;
let orderSuccessModalInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("productModal")) {
    productModalInstance = new bootstrap.Modal(document.getElementById("productModal"));
  }
  if (document.getElementById("customerDetailsModal")) {
    customerModalInstance = new bootstrap.Modal(document.getElementById("customerDetailsModal"));
  }
  if (document.getElementById("policyModal")) {
    policyModalInstance = new bootstrap.Modal(document.getElementById("policyModal"));
  }
  if (document.getElementById("orderSuccessModal")) {
    orderSuccessModalInstance = new bootstrap.Modal(document.getElementById("orderSuccessModal"));
  }

  renderNewArrivals();
  renderCategories();
  updateCartUI();
  renderMyOrders();
  syncPendingOrders();
  updateAdminMenuLabel();
  checkAdminHash();
  refreshAdminHistory();
});

// ==========================================
// NEW ARRIVALS ON HOME PAGE
// ==========================================
function renderNewArrivals() {
  const container = document.getElementById("newArrivalsGrid");
  if (!container) return;
  const newItems = PRODUCTS.filter(p => p.isNewArrival).slice(0, 4);
  container.innerHTML = "";

  newItems.forEach(prod => {
    container.innerHTML += `
      <div class="col-6 col-md-3">
        <div class="product-card" onclick="openProductDetail('${prod.id}')">
          <div>
            <div class="position-relative">
              <img src="${prod.images[0]}" alt="${prod.name}">
              <span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2" style="font-size: 10px;">NEW</span>
              <span class="badge bg-dark bg-opacity-75 position-absolute top-0 end-0 m-2" style="font-size: 10px;">Stock: ${prod.availableStock}</span>
            </div>
            <div class="p-2 p-md-3">
              <small class="text-muted d-block" style="font-size: 11px;">${prod.category}</small>
              <h6 class="fw-semibold mb-1 text-dark small">${prod.name}</h6>
            </div>
          </div>
          <div class="px-2 px-md-3 pb-3 d-flex justify-content-between align-items-center">
            <span class="price-tag">₹${prod.price}</span>
            <span class="btn btn-sm btn-green rounded-pill px-3">View</span>
          </div>
        </div>
      </div>
    `;
  });
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

  if (priceSort === "under-500") filtered = filtered.filter(p => p.price < 500);
  else if (priceSort === "500-1000") filtered = filtered.filter(p => p.price >= 500 && p.price <= 1000);
  else if (priceSort === "low-high") filtered.sort((a, b) => a.price - b.price);
  else if (priceSort === "high-low") filtered = filtered.sort((a, b) => b.price - a.price);

  document.getElementById("productCountBadge").innerText = filtered.length + " Items";
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = "";

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-12 text-center py-5 text-muted">No products found matching your filter.</div>`;
    return;
  }

  filtered.forEach(prod => {
    grid.innerHTML += `
      <div class="col-6 col-md-4 col-lg-3">
        <div class="product-card" onclick="openProductDetail('${prod.id}')">
          <div>
            <div class="position-relative">
              <img src="${prod.images[0]}" alt="${prod.name}">
              <span class="badge bg-dark bg-opacity-75 position-absolute top-0 end-0 m-2" style="font-size: 10px;">
                Stock: ${prod.availableStock}
              </span>
            </div>
            <div class="p-2 p-md-3">
              <small class="text-muted d-block" style="font-size: 11px;">${prod.category}</small>
              <h6 class="fw-semibold mb-1 text-dark small">${prod.name}</h6>
            </div>
          </div>
          <div class="px-2 px-md-3 pb-3 d-flex justify-content-between align-items-center">
            <span class="price-tag">₹${prod.price}</span>
            <span class="btn btn-sm btn-green rounded-pill px-3">View</span>
          </div>
        </div>
      </div>
    `;
  });
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
  document.getElementById("modalStockBadge").innerText = `Available Stock: ${currentProduct.availableStock} pcs`;
  document.getElementById("maxStockHint").innerText = `(Max ${currentProduct.availableStock} ready)`;

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
// COMPULSORY CUSTOMER DETAILS GATEWAY
// ==========================================
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
    document.getElementById("custName").value = saved.name || "";
    document.getElementById("custMobile").value = saved.mobile || "";
    document.getElementById("custAddress").value = saved.address || "";
    document.getElementById("custCity").value = saved.city || "";
    document.getElementById("custPincode").value = saved.pincode || "";
  }
  customerModalInstance.show();
}

function submitCustomerDetails(e) {
  e.preventDefault();
  const name = document.getElementById("custName").value.trim();
  const mobile = document.getElementById("custMobile").value.trim();
  const address = document.getElementById("custAddress").value.trim();
  const city = document.getElementById("custCity").value.trim();
  const pincode = document.getElementById("custPincode").value.trim();

  if (!name || !mobile || !address || !city || !pincode) {
    alert("Please fill all required fields: Name, Mobile Number, Address, City, and Pincode.");
    return;
  }

  const customerObj = { name, mobile, address, city, pincode };
  localStorage.setItem("riddhi_customer", JSON.stringify(customerObj));
  customerModalInstance.hide();

  if (pendingAction === "add_to_cart") {
    executeAddToCart();
  } else if (pendingAction === "order_single") {
    executeOrderSingle(customerObj);
  } else if (pendingAction === "order_cart") {
    executeOrderCart(customerObj);
  }
}

function handleAddToCartClick() {
  openCustomerModal("add_to_cart");
}

function handleOrderSingleClick() {
  openCustomerModal("order_single");
}

function handleCheckoutCartClick() {
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }
  openCustomerModal("order_cart");
}

// ==========================================
// CART & DUAL WHATSAPP ORDER DISPATCH
// (Sends to Seller 918412981213 + Opens Copy for Customer Mobile)
// ==========================================
function executeAddToCart() {
  const size = document.getElementById("modalSize").value;
  const qty = parseInt(document.getElementById("modalQty").value);
  const customNote = document.getElementById("modalCustom").value.trim();

  const existingIndex = cart.findIndex(item =>
    item.id === currentProduct.id && item.size === size && item.customNote === customNote
  );

  if (existingIndex > -1) {
    cart[existingIndex].qty += qty;
  } else {
    cart.push({
      ...currentProduct,
      size,
      qty,
      customNote
    });
  }

  updateCartUI();
  closeProductModal();

  const cartCanvas = new bootstrap.Offcanvas(document.getElementById("cartOffcanvas"));
  cartCanvas.show();
}

function updateCartItemQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  updateCartUI();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById("cartItemsContainer");
  if (!container) return;
  const navCount = document.getElementById("navCartCount");
  const floatBtn = document.getElementById("floatingCartBtn");

  let totalQty = 0;
  let totalPrice = 0;

  if (cart.length === 0) {
    container.innerHTML = `<div class="text-center text-muted my-5"><i class="bi bi-bag-x fs-1"></i><p class="mt-2">Your cart is empty.</p></div>`;
    navCount.innerText = "0";
    document.getElementById("cartTotal").innerText = "0";
    floatBtn.classList.add("d-none");
    return;
  }

  container.innerHTML = "";
  cart.forEach((item, index) => {
    totalQty += item.qty;
    totalPrice += item.price * item.qty;

    container.innerHTML += `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-2 d-flex gap-2 align-items-center">
          <img src="${item.images[0]}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">
          <div class="flex-grow-1">
            <h6 class="mb-0 small fw-bold">${item.name}</h6>
            <small class="text-muted d-block" style="font-size: 11px;">Size: ${item.size}</small>
            ${item.customNote ? `<small class="text-success d-block" style="font-size: 11px;"><strong>Note:</strong> ${esc(item.customNote)}</small>` : ""}
            <div class="d-flex justify-content-between align-items-center mt-1">
              <span class="fw-bold small" style="color: var(--primary-green);">₹${item.price * item.qty}</span>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary py-0 px-2" onclick="updateCartItemQty(${index}, -1)">-</button>
                <span class="btn btn-light py-0 px-2 disabled text-dark fw-bold">${item.qty}</span>
                <button class="btn btn-outline-secondary py-0 px-2" onclick="updateCartItemQty(${index}, 1)">+</button>
              </div>
            </div>
          </div>
          <button class="btn btn-sm text-danger" onclick="removeCartItem(${index})"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  });

  navCount.innerText = totalQty;
  document.getElementById("cartTotal").innerText = totalPrice;
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

function executeOrderSingle(cust) {
  const size = document.getElementById("modalSize").value;
  const qty = parseInt(document.getElementById("modalQty").value);
  const customNote = document.getElementById("modalCustom").value.trim();
  const total = currentProduct.price * qty;

  let msg = `Hello *Jewellery by Riddhi*! ✨\n*NEW ORDER RECEIVED*\n\n`;
  msg += `🛍️ *Product:* ${currentProduct.name} (${currentProduct.id})\n`;
  msg += `• Size: ${size}\n`;
  msg += `• Qty: ${qty} x ₹${currentProduct.price} = *₹${total}*\n`;
  if (customNote) msg += `• Customization: _${customNote}_\n`;
  msg += `• Product Image: ${currentProduct.images[0]}\n\n`;
  msg += formatCustomerBlock(cust);

  const items = [{
    id: currentProduct.id, name: currentProduct.name, size, qty,
    price: currentProduct.price, note: customNote, image: currentProduct.images[0]
  }];

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

  const items = cart.map(item => ({
    id: item.id, name: item.name, size: item.size, qty: item.qty,
    price: item.price, note: item.customNote || "", image: item.images[0]
  }));

  cart.forEach((item, idx) => {
    const sub = item.price * item.qty;
    grandTotal += sub;
    msg += `*${idx + 1}. ${item.name}* (${item.id})\n`;
    msg += `   • Size: ${item.size} | Qty: ${item.qty} | Price: ₹${sub}\n`;
    if (item.customNote) msg += `   • Customization: _${item.customNote}_\n`;
    msg += `   • Image: ${item.images[0]}\n\n`;
  });

  msg += `💰 *Grand Total: ₹${grandTotal}*\n\n`;
  msg += formatCustomerBlock(cust);

  const order = saveOrderToHistory({
    total: grandTotal, items, customer: cust,
    fullMessage: `📋 *Order Receipt - Jewellery by Riddhi*\n\n` + msg
  });

  dispatchOrderToSellerAndCustomer(msg, cust.mobile, buildSummaryHtml(items, grandTotal, cust));
  syncOrderToSheet(order);

  // order ho gaya -> cart khaali karein
  cart = [];
  updateCartUI();
}

// Order ki items list ko safe HTML me badalta hai (customer ka likha text escape hota hai)
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
  const container = document.getElementById("myOrdersListContainer");
  const badge = document.getElementById("navOrdersCount");
  const adminView = isAdminLoggedIn();
  // Admin ko yahan saare customers ke orders dikhte hain, customer ko sirf apne
  const orders = adminView
    ? adminOrders.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    : getLocalOrders();

  const titleEl = document.querySelector("#myOrdersOffcanvas .offcanvas-title");
  if (titleEl) titleEl.innerHTML = adminView
    ? `<i class="bi bi-receipt-cutoff me-2"></i>All Orders (Admin)`
    : `<i class="bi bi-receipt-cutoff me-2"></i>My Placed Orders`;
  const footEl = document.querySelector("#myOrdersOffcanvas .border-top");
  if (footEl) footEl.classList.toggle("d-none", adminView);

  if (badge) {
    if (orders.length > 0) {
      badge.innerText = orders.length;
      badge.classList.remove("d-none");
    } else {
      badge.classList.add("d-none");
    }
  }
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted my-5">
        <i class="bi bi-receipt fs-1"></i>
        <p class="mt-2 small">${adminView ? "No orders yet." : "You haven't placed any orders on this device yet."}</p>
      </div>`;
    return;
  }

  container.innerHTML = orders.map(ord => {
    const cust = ord.customer || {};
    let cleanCustPhone = (cust.mobile || "").replace(/[^0-9]/g, "");
    if (cleanCustPhone.length === 10) cleanCustPhone = "91" + cleanCustPhone;
    const waSelfUrl = adminView
      ? `https://wa.me/${cleanCustPhone}`
      : `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(ord.fullMessage || "")}`;
    const waLabel = adminView ? "Chat with Customer" : "Send Copy to My WhatsApp";
    const itemsHtml = ord.items ? buildItemsHtml(ord.items) : (ord.itemsHtml || "");

    return `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-3 small">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge" style="background-color: var(--primary-green);">${esc(ord.orderId)}</span>
            <span class="fw-bold" style="color: var(--primary-green);">₹${esc(ord.total)}</span>
          </div>
          <div class="text-muted mb-2" style="font-size: 11px;"><i class="bi bi-clock me-1"></i>${esc(ord.date)}</div>
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
  try { return JSON.parse(sessionStorage.getItem("riddhi_admin_session") || "null"); } catch (e) { return null; }
}
function isAdminLoggedIn() {
  return !!getAdminSession();
}
function updateAdminMenuLabel() {
  const el = document.getElementById("adminMenuLabel");
  if (el) el.textContent = isAdminLoggedIn() ? "Admin Panel (Customers & Orders)" : "Admin Login";
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
      sessionStorage.removeItem("riddhi_admin_session");
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
    let wa = String(c.mobile).replace(/[^0-9]/g, "");
    if (wa.length === 10) wa = "91" + wa;

    const historyHtml = c.orders.map(o => `
      <div class="p-2 rounded mb-1" style="background-color: #fdfaf5; border: 1px solid #efe3d2;">
        <div class="d-flex justify-content-between align-items-center">
          <span class="fw-bold text-dark">${esc(o.orderId)} <span class="badge ${o.period === "Present" ? "bg-success" : "bg-secondary"}" style="font-size:10px;">${o.period === "Present" ? "Recent" : "Past"}</span></span>
          <span class="fw-bold" style="color: var(--primary-green);">₹${esc(o.total)}</span>
        </div>
        <div class="text-muted" style="font-size:11px;">${esc(o.date)}</div>
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
  const rows = [["Order ID", "Date", "Name", "Mobile", "Address", "City", "Pincode", "Items", "Image Links", "Total (INR)"]];
  adminOrders.forEach(o => {
    const c = o.customer || {};
    const items = (o.items || []).map(i => `${i.name} (${i.id}) x${i.qty} [${i.size}]${i.note ? " note: " + i.note : ""}`).join(" | ");
    const imgs = (o.items || []).map(i => i.image || "").filter(Boolean).join(" | ");
    rows.push([o.orderId, o.date, c.name, c.mobile, c.address, c.city, c.pincode, items, imgs, o.total]);
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
