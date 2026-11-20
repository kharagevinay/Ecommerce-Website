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
            ${item.customNote ? `<small class="text-success d-block" style="font-size: 11px;"><strong>Note:</strong> ${item.customNote}</small>` : ""}
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

  const summaryHtml = `
    <div class="small">
      <div class="fw-bold text-dark mb-1">🛍️ ${currentProduct.name} (${currentProduct.id})</div>
      <div class="text-muted">Size: ${size} | Qty: ${qty} | <strong>Total: ₹${total}</strong></div>
      ${customNote ? `<div class="text-success">Note: ${customNote}</div>` : ""}
      <hr class="my-2">
      <div class="fw-semibold text-dark">👤 ${cust.name} (${cust.mobile})</div>
      <div class="text-muted">${cust.address}, ${cust.city} - ${cust.pincode}</div>
    </div>
  `;

  saveOrderToHistory({
    total: total,
    itemsHtml: `<div><strong>${currentProduct.name}</strong> (${currentProduct.id})<br><span class="text-muted" style="font-size:11px;">Size: ${size} | Qty: ${qty}${customNote ? ` | Note: ${customNote}` : ""}</span></div>`,
    customer: cust,
    fullMessage: `📋 *Order Receipt - Jewellery by Riddhi*\n\n` + msg
  });

  dispatchOrderToSellerAndCustomer(msg, cust.mobile, summaryHtml);
}

function executeOrderCart(cust) {
  let grandTotal = 0;
  let msg = `Hello *Jewellery by Riddhi*! ✨\n*NEW MULTI-ITEM ORDER*\n\n`;

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

  const summaryHtml = `
    <div class="small">
      <div class="fw-bold text-dark mb-1">🛍️ ${currentProduct.name} (${currentProduct.id})</div>
      <div class="text-muted">Size: ${size} | Qty: ${qty} | <strong>Total: ₹${total}</strong></div>
      ${customNote ? `<div class="text-success">Note: ${customNote}</div>` : ""}
      <hr class="my-2">
      <div class="fw-semibold text-dark">👤 ${cust.name} (${cust.mobile})</div>
      <div class="text-muted">${cust.address}, ${cust.city} - ${cust.pincode}</div>
    </div>
  `;

  saveOrderToHistory({
    total: total,
    itemsHtml: `<div><strong>${currentProduct.name}</strong> (${currentProduct.id})<br><span class="text-muted" style="font-size:11px;">Size: ${size} | Qty: ${qty}${customNote ? ` | Note: ${customNote}` : ""}</span></div>`,
    customer: cust,
    fullMessage: `📋 *Order Receipt - Jewellery by Riddhi*\n\n` + msg
  });

  dispatchOrderToSellerAndCustomer(msg, cust.mobile, summaryHtml);
}

function dispatchOrderToSellerAndCustomer(orderMessage, customerMobile, summaryHtml = "") {
  // 1. Open WhatsApp to Seller (918412981213) immediately on user click
  sendWhatsAppUrl(WHATSAPP_NUMBER, orderMessage);

  // 2. Clean customer mobile number (add 91 if 10 digits)
  let cleanCustPhone = customerMobile.replace(/[^0-9]/g, "");
  if (cleanCustPhone.length === 10) {
    cleanCustPhone = "91" + cleanCustPhone;
  }

  // Prepare customer order summary copy for their own WhatsApp
  const customerCopyMsg =
    `📋 *Order Receipt - Jewellery by Riddhi*\n` +
    `Thank you for your order! Here are your ordered product & delivery details:\n\n` +
    orderMessage;

  const custWaUrl = `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(customerCopyMsg)}`;

  // 3. Close modals/offcanvas and show Order Placed Successfully Popup
  closeProductModal();
  const cartEl = document.getElementById("cartOffcanvas");
  const cartOffcanvasInst = bootstrap.Offcanvas.getInstance(cartEl);
  if (cartOffcanvasInst) cartOffcanvasInst.hide();

  const summaryBox = document.getElementById("successOrderSummaryBox");
  const custBtn = document.getElementById("customerWhatsAppCopyBtn");

  if (summaryBox) {
    summaryBox.innerHTML = summaryHtml;
  }
  if (custBtn) {
    custBtn.href = custWaUrl;
  }
  if (orderSuccessModalInstance) {
    orderSuccessModalInstance.show();
  }
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
// MY ORDERS HISTORY (LOCALSTORAGE)
// ==========================================
function saveOrderToHistory(orderRecord) {
  try {
    const orders = JSON.parse(localStorage.getItem("riddhi_orders") || "[]");
    orders.unshift({
      orderId: "ORD-" + Date.now().toString().slice(-6),
      date: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
      ...orderRecord
    });
    localStorage.setItem("riddhi_orders", JSON.stringify(orders));
    renderMyOrders();
  } catch (e) {
    console.error("Failed to save order history", e);
  }
}

function renderMyOrders() {
  const container = document.getElementById("myOrdersListContainer");
  const badge = document.getElementById("navOrdersCount");
  const orders = JSON.parse(localStorage.getItem("riddhi_orders") || "[]");

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
        <p class="mt-2 small">You haven't placed any orders on this device yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(ord => {
    let cleanCustPhone = (ord.customer.mobile || "").replace(/[^0-9]/g, "");
    if (cleanCustPhone.length === 10) cleanCustPhone = "91" + cleanCustPhone;
    const waSelfUrl = `https://wa.me/${cleanCustPhone}?text=${encodeURIComponent(ord.fullMessage || "")}`;

    return `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-body p-3 small">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge" style="background-color: var(--primary-green);">${ord.orderId}</span>
            <span class="fw-bold" style="color: var(--primary-green);">₹${ord.total}</span>
          </div>
          <div class="text-muted mb-2" style="font-size: 11px;"><i class="bi bi-clock me-1"></i>${ord.date}</div>
          <div class="mb-2">${ord.itemsHtml}</div>
          <div class="p-2 rounded bg-light text-muted mb-2" style="font-size: 11px;">
            <strong class="text-dark">👤 ${ord.customer.name}</strong> (${ord.customer.mobile})<br>
            ${ord.customer.address}, ${ord.customer.city} - ${ord.customer.pincode}
          </div>
          <a href="${waSelfUrl}" target="_blank" class="btn btn-outline-success btn-sm w-100 rounded-pill" style="font-size: 11px;">
            <i class="bi bi-whatsapp me-1"></i> Send Copy to My WhatsApp
          </a>
        </div>
      </div>
    `;
  }).join("");
}

function clearOrderHistory() {
  if (confirm("Clear saved order history from this browser?")) {
    localStorage.removeItem("riddhi_orders");
    renderMyOrders();
  }
}
