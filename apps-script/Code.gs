/**
 * Jewellery by Riddhi - Google Sheet Orders, Stock, Products Master, Categories, Offers, Drive Media & Enquiry Backend
 */

// ====== SIRF YE 2 LINES BADLEIN ======
const ADMIN_USERNAME = 'Riddhi';
const ADMIN_PASSWORD = 'Riddhi@2026';
// =====================================

const SHEET_NAME = 'Orders';
const STOCK_SHEET_NAME = 'Stock';
const ENQUIRY_SHEET_NAME = 'Enquiry';
const PRODUCTS_SHEET_NAME = 'Products';
const CATEGORIES_SHEET_NAME = 'Categories';
const OFFERS_SHEET_NAME = 'Offers';
const DRIVE_MEDIA_FOLDER_NAME = 'Jewellery_by_Riddhi_Media';

const CATEGORIES_HEADERS = [
  'Category Name', 'Prefix', 'Image Preview', 'Image URL', 'Last Updated'
];

const OFFERS_HEADERS = [
  'Offer ID', 'Type', 'Badge 1', 'Badge 2', 'Title', 'Description', 'Target Category', 'Featured Green', 'Active', 'Last Updated'
];

const HEADERS = [
  'Timestamp', 'Order ID', 'Date', 'Name', 'Mobile', 'Address', 'City', 'Pincode',
  'Product ID', 'Category', 'Product Name', 'Size', 'Quantity', 'Customization Note',
  'Actual Price (INR)', 'Offer Price (INR)', 'Discount',
  'Total (INR)', 'Items JSON', 'Image Preview', 'Image 1', 'Image 2', 'Image 3', 'Image Links',
  'Status', 'Status Updated', 'Cancel Reason'
];

const STOCK_HEADERS = [
  'Date', 'Product ID', 'Category', 'Product Name', 'Size', 'Image',
  'Total Quantity', 'Available Quantity', 'Sale Hui Quantity', 'Last Updated'
];

const ENQUIRY_HEADERS = [
  'Timestamp', 'Enquiry ID', 'Date', 'Customer Name', 'Mobile',
  'Product ID', 'Category', 'Product Name', 'Size',
  'Available Stock', 'Requested Quantity', 'Extra Needed Qty',
  'Customization Note', 'Image', 'Status'
];

const PRODUCTS_HEADERS = [
  'Product ID', 'Category', 'Product Name', 'Offer Price (INR)', 'Actual Price (INR)',
  'New Arrival', 'Sizes & Stock JSON', 'Total Available Stock', 'Description',
  'Image Preview', 'Image 1 URL', 'Image 2 URL', 'Image 3 URL', 'Video URL', 'Last Updated'
];

const READ_COLS = 27;
const STATUS_COL = 25;
const CANCEL_REASON_COL = 27;
const STATUSES = ['Pending', 'Confirmed', 'Custom Making / Partial Stock Ready', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const ENQUIRY_STATUSES = ['New Enquiry', 'Contacted', 'Confirmed', 'Completed', 'Closed'];
const AUTO_DELIVER_DAYS = 5;
const MAX_IMG_COLS = 4;
const TOKEN_TTL_SEC = 2 * 60 * 60;
const MAX_FAILS = 5;
const LOCK_SEC = 10 * 60;

function doGet() {
  return json_({
    ok: true,
    service: 'Jewellery by Riddhi orders, stock, products, categories, offers & enquiry',
    stock: readStockMap_(),
    sizeStock: readSizeStockMap_(),
    products: readProductsMaster_(),
    categories: readCategoriesMaster_(),
    offers: readOffersMaster_(),
    deletedCategoryNames: getDeletedCategoryNames_(),
    deletedIds: getAllDeletedIds_()
  });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'newOrder':            return json_(addOrder_(body.order));
      case 'newEnquiry':          return json_(addEnquiry_(body.enquiry));
      case 'getEnquiries':        return json_(getEnquiries_(body.token));
      case 'updateEnquiryStatus': return json_(updateEnquiryStatus_(body.token, body.enquiryId, body.status));
      case 'enquiryStatus':       return json_(enquiryStatus_(body.enquiries));
      case 'getStock':          return json_({ ok: true, stock: readStockMap_(), sizeStock: readSizeStockMap_() });
      case 'getProducts':       return json_({ ok: true, products: readProductsMaster_(), deletedIds: getAllDeletedIds_(), sizeStock: readSizeStockMap_(), categories: readCategoriesMaster_(), deletedCategoryNames: getDeletedCategoryNames_(), offers: readOffersMaster_() });
      case 'getCategories':     return json_({ ok: true, categories: readCategoriesMaster_(), deletedCategoryNames: getDeletedCategoryNames_() });
      case 'saveCategory':      return json_(saveCategoryMaster_(body.token, body.category, body.oldName, body.siteBaseUrl));
      case 'deleteCategory':    return json_(deleteCategoryMaster_(body.token, body.categoryName));
      case 'getOffers':         return json_({ ok: true, offers: readOffersMaster_() });
      case 'saveOffer':         return json_(saveOfferMaster_(body.token, body.offer));
      case 'deleteOffer':       return json_(deleteOfferMaster_(body.token, body.offerId));
      case 'getOrdersByMobile': return json_(getOrdersByMobile_(body.mobile));
      case 'syncCatalog':       return json_(syncCatalog_(body.products, body.masterProducts, body.masterCategories, body.siteBaseUrl));
      case 'saveProduct':       return json_(saveProductMaster_(body.token, body.product, body.siteBaseUrl));
      case 'toggleNewArrival':  return json_(toggleNewArrival_(body.token, body.productId, body.isNewArrival));
      case 'deleteProduct':     return json_(deleteProductMaster_(body.token, body.productId));
      case 'clearAllSheetData': return json_(clearAllSheetData_(body.token));
      case 'clearStockData':    return json_(clearStockData_(body.token));
      case 'deleteStockRow':    return json_(deleteStockRow_(body.token, body.productId, body.size));
      case 'allocateOrderQty':  return json_(allocateOrderQty_(body.token, body.orderId, body.itemIndex, body.newQty));
      case 'setStock':          return json_(setStock_(body.token, body.productId, body.stock, body.productName, body.image, body.category, body.size, body.siteBaseUrl));
      case 'adminLogin':        return json_(adminLogin_(body.username, body.password));
      case 'getOrders':         return json_(getOrders_(body.token));
      case 'adminLogout':       return json_(adminLogout_(body.token));
      case 'updateStatus':      return json_(updateStatus_(body.token, body.orderId, body.status, body.cancelReason));
      case 'setAutoDeliver':    return json_(setAutoDeliver_(body.token, body.enabled));
      case 'orderStatus':       return json_(orderStatus_(body.orders));
      default:                  return json_({ ok: false, error: 'bad_request' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server_error', detail: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function isAutoDeliverEnabled_() {
  const val = PropertiesService.getScriptProperties().getProperty('AUTO_DELIVER_ENABLED');
  return val === null ? true : (val === 'true');
}

function setAutoDeliver_(token, enabled) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const flag = !!enabled;
  PropertiesService.getScriptProperties().setProperty('AUTO_DELIVER_ENABLED', flag ? 'true' : 'false');
  return { ok: true, autoDeliverEnabled: flag };
}

function statusValidation_(sh) {
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
  sh.getRange(2, STATUS_COL, 2000, 1).setDataValidation(rule);
}

// ---------- GOOGLE DRIVE PUBLIC IMAGE / VIDEO UPLOAD HELPER ----------
function getOrCreateMediaFolder_() {
  const folders = DriveApp.getFoldersByName(DRIVE_MEDIA_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const folder = DriveApp.createFolder(DRIVE_MEDIA_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function isPublicHttpUrl_(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(s)) return false;
  return true;
}

function resolveMediaUrl_(rawVal, filenamePrefix, siteBaseUrl) {
  const val = String(rawVal || '').trim();
  if (!val) return '';

  // 1) Public https:// URL (not localhost) -> return directly
  if (isPublicHttpUrl_(val)) {
    return val;
  }

  // 2) Base64 data URI -> upload to public Google Drive folder so =IMAGE() & cross-device <img> work everywhere!
  if (val.startsWith('data:')) {
    try {
      const match = val.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return '';
      const mimeType = match[1];
      const base64Data = match[2];
      const ext = mimeType.indexOf('png') > -1 ? 'png' : (mimeType.indexOf('mp4') > -1 ? 'mp4' : 'jpg');
      const bytes = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(bytes, mimeType, (filenamePrefix || 'media') + '_' + Date.now() + '.' + ext);
      const folder = getOrCreateMediaFolder_();
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileId = file.getId();
      if (ext === 'mp4') {
        return 'https://drive.google.com/uc?export=download&id=' + fileId;
      }
      return 'https://lh3.googleusercontent.com/d/' + fileId + '=w800';
    } catch (err) {
      return '';
    }
  }

  // 3) Relative path (e.g., assets/Categories/...): if siteBaseUrl is a public https:// URL (not localhost), convert to full URL
  const base = String(siteBaseUrl || '').trim();
  if (isPublicHttpUrl_(base)) {
    const cleanBase = base.replace(/\/+$/, '');
    const cleanRel = val.replace(/^\/+/, '');
    return encodeURI(cleanBase + '/' + cleanRel);
  }

  return val;
}

function buildPreviewFormula_(urlStr, siteBaseUrl) {
  const raw = String(urlStr || '').trim();
  if (!raw) return '';
  let http = imgUrl_(raw);
  if (!http && siteBaseUrl && isPublicHttpUrl_(siteBaseUrl)) {
    const cleanBase = String(siteBaseUrl).replace(/\/+$/, '');
    const cleanRel = raw.replace(/^\/+/, '');
    http = imgUrl_(encodeURI(cleanBase + '/' + cleanRel));
  }
  return http ? '=IMAGE("' + http + '")' : '';
}

function clearAllSheetData_(token) {
  if (token && !validToken_(token)) return { ok: false, error: 'auth' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheets = [
      productsSheet_(),
      categoriesSheet_(),
      stockSheet_(),
      sheet_(),
      enquirySheet_(),
      offersSheet_()
    ];
    sheets.forEach(function (sh) {
      const last = sh.getLastRow();
      if (last >= 2) {
        sh.deleteRows(2, last - 1);
      }
    });
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty('DELETED_PRODUCT_IDS');
    props.deleteProperty('KNOWN_PRODUCT_IDS');
    props.deleteProperty('DELETED_CATEGORY_NAMES');
    return { ok: true, message: 'All Google Sheet tabs cleared (headers preserved).' };
  } finally {
    lock.releaseLock();
  }
}

function clearAllDataFromEditor() {
  return clearAllSheetData_(null);
}

function clearStockData_(token) {
  if (token && !validToken_(token)) return { ok: false, error: 'auth' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = stockSheet_();
    const last = sh.getLastRow();
    if (last >= 2) {
      sh.deleteRows(2, last - 1);
    }
    return { ok: true, stock: {}, sizeStock: {} };
  } finally {
    lock.releaseLock();
  }
}

function clearStockSheetFromEditor() {
  return clearStockData_(null);
}

function deleteStockRow_(token, productId, size) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const pid = safe_(productId, 30);
  const psize = safe_(size || '', 60);
  if (!pid) return { ok: false, error: 'bad_product' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = stockSheet_();
    const last = sh.getLastRow();
    if (last >= 2) {
      const rows = sh.getRange(2, 2, last - 1, 4).getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        const rPid = String(rows[i][0] || '').trim();
        const rSz = String(rows[i][3] || '').trim();
        if (rPid === pid && (!psize || rSz === psize)) {
          sh.deleteRow(i + 2);
        }
      }
    }
    return { ok: true, stock: readStockMap_(), sizeStock: readSizeStockMap_() };
  } finally {
    lock.releaseLock();
  }
}

function allocateOrderQty_(token, orderId, itemIndex, newQty) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const oid = safe_(orderId, 30);
  const idx = Math.max(0, parseInt(itemIndex, 10) || 0);
  const targetQty = Math.max(0, Math.min(500, parseInt(newQty, 10) || 0));
  if (!oid) return { ok: false, error: 'bad_order' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'not_found' };
    const rows = sh.getRange(2, 1, last - 1, Math.min(READ_COLS, sh.getLastColumn())).getValues();
    for (let r = 0; r < rows.length; r++) {
      if (String(rows[r][1] || '').trim() === oid) {
        let items = [];
        try { items = JSON.parse(rows[r][18] || '[]'); } catch (e) { items = []; }
        if (!Array.isArray(items) || !items[idx]) return { ok: false, error: 'item_not_found' };
        const oldQty = Math.max(1, parseInt(items[idx].qty, 10) || 1);
        const diffQty = oldQty - targetQty; // positive if reducing qty given to customer (e.g., 4 -> 2 => diffQty = 2 restored to stock)
        items[idx].qty = targetQty;
        const newTotal = items.reduce(function (s, it) { return s + (Math.max(0, parseInt(it.qty, 10) || 0)) * (Number(it.price) || 0); }, 0);
        const qtyCol = items.map(function (it) { return it.qty; }).join('\n');
        sh.getRange(r + 2, 13).setValue(qtyCol);
        sh.getRange(r + 2, 18).setValue(newTotal);
        sh.getRange(r + 2, 19).setValue(JSON.stringify(items));

        // Adjust Stock sheet available quantity by diffQty
        const sSh = stockSheet_();
        const sLast = sSh.getLastRow();
        const pid = String(items[idx].id || '').trim();
        const sz = String(items[idx].size || 'Free Size (Adjustable Dori)').trim();
        if (sLast >= 2 && pid && diffQty !== 0) {
          const sRows = sSh.getRange(2, 2, sLast - 1, 4).getValues();
          for (let k = 0; k < sRows.length; k++) {
            if (String(sRows[k][0] || '').trim() === pid && (!String(sRows[k][3] || '').trim() || String(sRows[k][3] || '').trim() === sz)) {
              const rowNum = k + 2;
              const curAvail = Math.max(0, parseInt(sSh.getRange(rowNum, 8).getValue(), 10) || 0);
              const nextAvail = Math.max(0, curAvail + diffQty);
              sSh.getRange(rowNum, 8).setValue(nextAvail);
              sSh.getRange(rowNum, 10).setValue(new Date());
              break;
            }
          }
        }
        return { ok: true, orderId: oid, total: newTotal, items: items };
      }
    }
    return { ok: false, error: 'not_found' };
  } finally {
    lock.releaseLock();
  }
}

// ---------- PRODUCTS MASTER SHEET ("Products" tab) ----------
function productsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PRODUCTS_SHEET_NAME);
    sh.appendRow(PRODUCTS_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PRODUCTS_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(1, 105);
    sh.setColumnWidth(2, 150);
    sh.setColumnWidth(3, 230);
    sh.setColumnWidth(7, 220);
    sh.setColumnWidth(9, 250);
    sh.setColumnWidth(10, 110);
    sh.setColumnWidth(11, 260);
    sh.setColumnWidth(12, 260);
    sh.setColumnWidth(13, 260);
    sh.setColumnWidth(14, 260);
  }
  return sh;
}

function getDeletedProductIds_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('DELETED_PRODUCT_IDS');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function setDeletedProductIds_(arr) {
  const unique = Array.from(new Set((arr || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean)));
  PropertiesService.getScriptProperties().setProperty('DELETED_PRODUCT_IDS', JSON.stringify(unique.slice(0, 500)));
  return unique;
}

function getKnownSyncedIds_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('KNOWN_PRODUCT_IDS');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function setKnownSyncedIds_(arr) {
  const unique = Array.from(new Set((arr || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean)));
  PropertiesService.getScriptProperties().setProperty('KNOWN_PRODUCT_IDS', JSON.stringify(unique.slice(0, 500)));
  return unique;
}

function getAllDeletedIds_() {
  const storedDeleted = getDeletedProductIds_();
  const knownIds = getKnownSyncedIds_();
  if (knownIds.length === 0) return storedDeleted;

  const sh = productsSheet_();
  const last = sh.getLastRow();
  const presentMap = {};
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    ids.forEach(function (r) {
      const pid = String(r[0] || '').trim();
      if (pid) presentMap[pid] = true;
    });
  }

  const newlyDeleted = [];
  knownIds.forEach(function (kid) {
    if (!presentMap[kid]) {
      newlyDeleted.push(kid);
    }
  });

  if (newlyDeleted.length > 0) {
    const mergedDeleted = setDeletedProductIds_(storedDeleted.concat(newlyDeleted));
    const remainingKnown = knownIds.filter(function (k) { return !!presentMap[k]; });
    setKnownSyncedIds_(remainingKnown);

    const stockSh = stockSheet_();
    const sLast = stockSh.getLastRow();
    if (sLast >= 2) {
      const sIds = stockSh.getRange(2, 2, sLast - 1, 1).getValues();
      for (let j = sIds.length - 1; j >= 0; j--) {
        const spid = String(sIds[j][0] || '').trim();
        if (newlyDeleted.indexOf(spid) > -1) {
          stockSh.deleteRow(j + 2);
        }
      }
    }
    return mergedDeleted;
  }

  return storedDeleted;
}

function readProductsMaster_() {
  const sh = productsSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, PRODUCTS_HEADERS.length).getValues();
  const out = [];
  const presentIds = [];

  rows.forEach(function (r) {
    const pid = String(r[0] || '').trim();
    if (!pid) return;
    presentIds.push(pid);
    let sizeStock = {};
    try { sizeStock = JSON.parse(String(r[6] || '{}')); } catch (e) {}
    const sizes = Object.keys(sizeStock);
    const totalAvail = sizes.length
      ? sizes.reduce(function (s, k) { return s + (Math.max(0, parseInt(sizeStock[k], 10) || 0)); }, 0)
      : Math.max(0, parseInt(r[7], 10) || 0);
    const imgs = [String(r[10] || '').trim(), String(r[11] || '').trim(), String(r[12] || '').trim()].filter(Boolean);
    out.push({
      id: pid,
      category: String(r[1] || '').trim(),
      name: String(r[2] || '').trim(),
      price: Number(r[3]) || 0,
      actualPrice: Number(r[4]) || 0,
      isNewArrival: String(r[5]).toUpperCase() === 'YES' || r[5] === true,
      sizes: sizes.length ? sizes : ['Free Size (Adjustable Dori)'],
      sizeStock: sizes.length ? sizeStock : { 'Free Size (Adjustable Dori)': totalAvail },
      availableStock: totalAvail,
      desc: String(r[8] || '').trim(),
      images: imgs.length ? imgs : ['assets/Categories/Comming-Soon.png'],
      video: String(r[13] || '').trim()
    });
  });

  if (presentIds.length > 0) {
    setKnownSyncedIds_(getKnownSyncedIds_().concat(presentIds));
  }
  return out;
}

function toggleNewArrival_(token, productId, isNewArrival) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const pid = safe_(productId, 30);
  if (!pid) return { ok: false, error: 'bad_product' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = productsSheet_();
    const last = sh.getLastRow();
    if (last >= 2) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim() === pid) {
          sh.getRange(i + 2, 6).setValue(isNewArrival ? 'YES' : 'NO');
          sh.getRange(i + 2, 15).setValue(new Date());
          break;
        }
      }
    }
    return { ok: true, products: readProductsMaster_() };
  } finally {
    lock.releaseLock();
  }
}

function saveProductMaster_(token, prod, siteBaseUrl) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  if (!prod || !prod.id || !prod.name || !prod.category) {
    return { ok: false, error: 'invalid_product' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = productsSheet_();
    const stockSh = stockSheet_();
    const pid = safe_(prod.id, 30);

    setDeletedProductIds_(getDeletedProductIds_().filter(function (x) { return x !== pid; }));
    setKnownSyncedIds_(getKnownSyncedIds_().concat([pid]));

    const pcat = safe_(prod.category, 80);
    const pname = safe_(prod.name, 140);
    const price = Math.max(0, Number(prod.price) || 0);
    const actualPrice = Math.max(0, Number(prod.actualPrice) || 0);
    const isNew = prod.isNewArrival ? 'YES' : 'NO';
    const desc = safe_(prod.desc || '', 500);

    const sizeStock = (prod.sizeStock && typeof prod.sizeStock === 'object') ? prod.sizeStock : { 'Free Size (Adjustable Dori)': Math.max(0, parseInt(prod.availableStock, 10) || 0) };
    const sizes = Object.keys(sizeStock);
    const totalAvail = sizes.reduce(function (s, k) { return s + (Math.max(0, parseInt(sizeStock[k], 10) || 0)); }, 0);

    const rawImgs = Array.isArray(prod.images) ? prod.images : [];
    const img1 = resolveMediaUrl_(rawImgs[0], pid + '_img1', siteBaseUrl);
    const img2 = resolveMediaUrl_(rawImgs[1], pid + '_img2', siteBaseUrl);
    const img3 = resolveMediaUrl_(rawImgs[2], pid + '_img3', siteBaseUrl);
    const videoUrl = resolveMediaUrl_(prod.video, pid + '_vid', siteBaseUrl);
    const now = new Date();

    const previewFormula = buildPreviewFormula_(img1, siteBaseUrl);

    const rowData = [
      pid, pcat, pname, price, actualPrice, isNew,
      JSON.stringify(sizeStock), totalAvail, desc,
      previewFormula, img1, img2, img3, videoUrl, now
    ];

    const last = sh.getLastRow();
    let updatedRow = -1;
    if (last >= 2) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim() === pid) {
          updatedRow = i + 2;
          break;
        }
      }
    }

    if (updatedRow > 0) {
      sh.getRange(updatedRow, 1, 1, PRODUCTS_HEADERS.length).setValues([rowData]);
      if (previewFormula) sh.setRowHeight(updatedRow, 95);
    } else {
      sh.appendRow(rowData);
      if (previewFormula) sh.setRowHeight(sh.getLastRow(), 95);
    }

    const stockLast = stockSh.getLastRow();
    if (stockLast >= 2) {
      const stockRows = stockSh.getRange(2, 2, stockLast - 1, 4).getValues();
      for (let r = stockRows.length - 1; r >= 0; r--) {
        const rPid = String(stockRows[r][0] || '').trim();
        const rSz = String(stockRows[r][3] || '').trim();
        if (rPid === pid && rSz && !Object.prototype.hasOwnProperty.call(sizeStock, rSz)) {
          stockSh.deleteRow(r + 2);
        }
      }
    }

    sizes.forEach(function (sz) {
      upsertStockRow_(stockSh, pid, pname, sizeStock[sz], img1, false, pcat, sz, 0, siteBaseUrl);
    });

    return {
      ok: true,
      products: readProductsMaster_(),
      deletedIds: getAllDeletedIds_(),
      stock: readStockMap_(),
      sizeStock: readSizeStockMap_()
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteProductMaster_(token, productId) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const pid = safe_(productId, 30);
  if (!pid) return { ok: false, error: 'bad_product' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = productsSheet_();
    setDeletedProductIds_(getDeletedProductIds_().concat([pid]));
    setKnownSyncedIds_(getKnownSyncedIds_().filter(function (x) { return x !== pid; }));

    const last = sh.getLastRow();
    if (last >= 2) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0] || '').trim() === pid) {
          sh.deleteRow(i + 2);
        }
      }
    }

    const stockSh = stockSheet_();
    const sLast = stockSh.getLastRow();
    if (sLast >= 2) {
      const sIds = stockSh.getRange(2, 2, sLast - 1, 1).getValues();
      for (let j = sIds.length - 1; j >= 0; j--) {
        if (String(sIds[j][0] || '').trim() === pid) {
          stockSh.deleteRow(j + 2);
        }
      }
    }

    return {
      ok: true,
      products: readProductsMaster_(),
      deletedIds: getAllDeletedIds_(),
      stock: readStockMap_(),
      sizeStock: readSizeStockMap_()
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ORDERS SHEET ----------
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(11, 220);
    for (let c = 20; c <= 22; c++) sh.setColumnWidth(c, 110);
    statusValidation_(sh);
  } else {
    const col15 = String(sh.getRange(1, 15).getValue() || '').trim();
    if (col15 !== 'Actual Price (INR)') {
      sh.insertColumnsBefore(15, 3);
    }
    const col20 = String(sh.getRange(1, 20).getValue() || '').trim();
    if (col20 !== 'Image Preview') {
      sh.insertColumnsBefore(20, 1);
    }
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    statusValidation_(sh);
  }
  return sh;
}

// ---------- LIVE GLOBAL STOCK SHEET ("Stock" tab) ----------
function stockSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(STOCK_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(STOCK_SHEET_NAME);
    sh.appendRow(STOCK_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, STOCK_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(1, 130);
    sh.setColumnWidth(2, 105);
    sh.setColumnWidth(3, 150);
    sh.setColumnWidth(4, 230);
    sh.setColumnWidth(5, 170);
    sh.setColumnWidth(6, 110);
    sh.setColumnWidth(7, 130);
    sh.setColumnWidth(8, 150);
    sh.setColumnWidth(9, 145);
    sh.setColumnWidth(10, 170);
  }
  return sh;
}

// ---------- ENQUIRY SHEET ("Enquiry" tab) ----------
function enquirySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ENQUIRY_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ENQUIRY_SHEET_NAME);
    sh.appendRow(ENQUIRY_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ENQUIRY_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(8, 220);
    sh.setColumnWidth(13, 240);
    sh.setColumnWidth(14, 110);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(ENQUIRY_STATUSES, true).setAllowInvalid(false).build();
    sh.getRange(2, 15, 2000, 1).setDataValidation(rule);
  }
  return sh;
}

function addEnquiry_(enq) {
  if (!enq || !enq.productId) {
    return { ok: false, error: 'invalid_enquiry' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = enquirySheet_();
    const now = new Date();
    const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd MMM yyyy, hh:mm a');
    const enqId = safe_(enq.enquiryId || ('ENQ-' + now.getTime().toString().slice(-6)), 30);
    const avail = Math.max(0, parseInt(enq.availableStock, 10) || 0);
    const reqQty = Math.max(1, parseInt(enq.requestedQty, 10) || 1);
    const extraQty = Math.max(0, reqQty - avail);
    const resolvedImg = resolveMediaUrl_(enq.image, enqId + '_img', enq.siteBaseUrl || '');
    const previewFormula = buildPreviewFormula_(resolvedImg, enq.siteBaseUrl || '');
    const mobile = String(enq.mobile || '').replace(/[^0-9]/g, '');

    sh.appendRow([
      now,
      enqId,
      dateStr,
      safe_(enq.customerName || 'Website Customer', 100),
      mobile ? ("'" + mobile) : '-',
      safe_(enq.productId, 30),
      safe_(enq.category || '', 80),
      safe_(enq.productName || '', 120),
      safe_(enq.size || 'Free Size (Adjustable Dori)', 60),
      avail,
      reqQty,
      extraQty,
      safe_(enq.note || '', 300),
      previewFormula || resolvedImg || '',
      'New Enquiry'
    ]);
    const rowNum = sh.getLastRow();
    if (previewFormula) {
      sh.getRange(rowNum, 14).setFormula(previewFormula);
      sh.setRowHeight(rowNum, 95);
    }
    return { ok: true, enquiryId: enqId };
  } finally {
    lock.releaseLock();
  }
}

function readStockMap_() {
  const sh = stockSheet_();
  const last = sh.getLastRow();
  const map = {};
  if (last < 2) return map;
  const rows = sh.getRange(2, 1, last - 1, 10).getValues();
  rows.forEach(function (r) {
    const pid = String(r[1] || '').trim();
    if (pid) {
      map[pid] = (map[pid] || 0) + Math.max(0, parseInt(r[7], 10) || 0);
    }
  });
  return map;
}

function readSizeStockMap_() {
  const sh = stockSheet_();
  const last = sh.getLastRow();
  const map = {};
  if (last < 2) return map;
  const rows = sh.getRange(2, 1, last - 1, 10).getValues();
  rows.forEach(function (r) {
    const pid = String(r[1] || '').trim();
    const sz = String(r[4] || 'Free Size (Adjustable Dori)').trim();
    if (pid) {
      if (!map[pid]) map[pid] = {};
      map[pid][sz] = Math.max(0, parseInt(r[7], 10) || 0);
    }
  });
  return map;
}

function upsertStockRow_(sh, productId, productName, newAvailStock, imageUrl, onlyIfMissing, category, size, soldDelta, siteBaseUrl) {
  const pid = safe_(productId, 30);
  const pname = safe_(productName || '', 120);
  const pcat = safe_(category || '', 80);
  const psize = safe_(size || 'Free Size (Adjustable Dori)', 60);
  const availQty = Math.max(0, parseInt(newAvailStock, 10) || 0);
  const deltaSold = Math.max(0, parseInt(soldDelta, 10) || 0);
  const resolvedImg = resolveMediaUrl_(imageUrl, pid + '_stk', siteBaseUrl);
  const imgFormula = buildPreviewFormula_(resolvedImg, siteBaseUrl);
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd MMM yyyy');

  const last = sh.getLastRow();
  if (last >= 2) {
    const idAndSizes = sh.getRange(2, 2, last - 1, 4).getValues();
    for (let i = 0; i < idAndSizes.length; i++) {
      const rowPid = String(idAndSizes[i][0] || '').trim();
      const rowSz = String(idAndSizes[i][3] || '').trim();
      if (rowPid === pid && (!rowSz || rowSz === psize)) {
        const rowNum = i + 2;
        const rowVals = sh.getRange(rowNum, 1, 1, 10).getValues()[0];
        const prevTotal = Math.max(0, parseInt(rowVals[6], 10) || 0);
        const prevAvail = Math.max(0, parseInt(rowVals[7], 10) || 0);
        const prevSold = Math.max(0, parseInt(rowVals[8], 10) || 0);

        if (onlyIfMissing) {
          if (pcat) sh.getRange(rowNum, 3).setValue(pcat);
          if (pname) sh.getRange(rowNum, 4).setValue(pname);
          if (psize && !rowVals[4]) sh.getRange(rowNum, 5).setValue(psize);
          if (imgFormula) {
            sh.getRange(rowNum, 6).setFormula(imgFormula);
            sh.setRowHeight(rowNum, 90);
          } else if (resolvedImg && !rowVals[5]) {
            sh.getRange(rowNum, 6).setValue(resolvedImg);
          }
          const fixedTotal = Math.max(prevTotal, prevAvail + prevSold);
          if (fixedTotal !== prevTotal) {
            sh.getRange(rowNum, 7).setValue(fixedTotal);
          }
          return prevAvail;
        }

        if (pcat) sh.getRange(rowNum, 3).setValue(pcat);
        if (pname) sh.getRange(rowNum, 4).setValue(pname);
        if (psize) sh.getRange(rowNum, 5).setValue(psize);
        if (imgFormula) {
          sh.getRange(rowNum, 6).setFormula(imgFormula);
          sh.setRowHeight(rowNum, 90);
        } else {
          sh.getRange(rowNum, 6).setValue('');
        }

        const updatedSold = prevSold + deltaSold;
        const updatedTotal = deltaSold > 0
          ? Math.max(prevTotal, availQty + updatedSold)
          : (availQty + updatedSold);

        sh.getRange(rowNum, 7, 1, 4).setValues([[updatedTotal, availQty, updatedSold, now]]);
        return availQty;
      }
    }
  }

  const initSold = deltaSold;
  const initTotal = availQty + initSold;
  sh.appendRow([dateStr, pid, pcat, pname, psize, imgFormula || '', initTotal, availQty, initSold, now]);
  const newRowNum = sh.getLastRow();
  if (imgFormula) {
    sh.getRange(newRowNum, 6).setFormula(imgFormula);
    sh.setRowHeight(newRowNum, 90);
  }
  return availQty;
}

function syncCatalog_(productsList, masterProductsList, masterCategoriesList, siteBaseUrl) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (Array.isArray(masterCategoriesList) && masterCategoriesList.length > 0) {
      const cSh = categoriesSheet_();
      const delCats = {};
      getDeletedCategoryNames_().forEach(function (n) { delCats[String(n).trim().toLowerCase()] = true; });
      const existingCats = {};
      const cLast = cSh.getLastRow();
      if (cLast >= 2) {
        cSh.getRange(2, 1, cLast - 1, 1).getValues().forEach(function (r) {
          const nm = String(r[0] || '').trim().toLowerCase();
          if (nm) existingCats[nm] = true;
        });
      }
      masterCategoriesList.slice(0, 100).forEach(function (cat) {
        const cname = safe_(cat && cat.name, 80);
        if (!cname) return;
        const key = cname.toLowerCase();
        if (delCats[key] || existingCats[key]) return;
        const prefix = safe_(cat.prefix || cname.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3), 10);
        const imgPath = resolveMediaUrl_(cat.image || 'assets/Categories/Comming-Soon.png', 'CAT_' + cname.replace(/[^A-Za-z0-9]/g, '_'), siteBaseUrl);
        const formula = buildPreviewFormula_(imgPath, siteBaseUrl);
        cSh.appendRow([cname, prefix, formula, imgPath, new Date()]);
        if (formula) cSh.setRowHeight(cSh.getLastRow(), 90);
        existingCats[key] = true;
      });
    }

    const delSet = {};
    getAllDeletedIds_().forEach(function (id) { delSet[String(id).trim()] = true; });

    if (Array.isArray(masterProductsList) && masterProductsList.length > 0) {
      const pSh = productsSheet_();
      const existingPids = {};
      const pLast = pSh.getLastRow();
      if (pLast >= 2) {
        pSh.getRange(2, 1, pLast - 1, 1).getValues().forEach(function (r) {
          const pid = String(r[0] || '').trim();
          if (pid) existingPids[pid] = true;
        });
      }
      masterProductsList.slice(0, 300).forEach(function (mp) {
        const pid = safe_(mp && mp.id, 30);
        if (!pid || delSet[pid] || existingPids[pid]) return;
        const imgs = Array.isArray(mp.images) ? mp.images : [];
        const img1 = resolveMediaUrl_(imgs[0] || '', pid + '_img1', siteBaseUrl);
        const img2 = resolveMediaUrl_(imgs[1] || '', pid + '_img2', siteBaseUrl);
        const img3 = resolveMediaUrl_(imgs[2] || '', pid + '_img3', siteBaseUrl);
        const vidUrl = resolveMediaUrl_(mp.video || '', pid + '_vid', siteBaseUrl);
        const formula = buildPreviewFormula_(img1, siteBaseUrl);
        const sizeStock = (mp.sizeStock && typeof mp.sizeStock === 'object') ? mp.sizeStock : { 'Free Size (Adjustable Dori)': Math.max(0, parseInt(mp.availableStock, 10) || 0) };
        const totalAvail = Object.values(sizeStock).reduce(function (s, v) { return s + (Math.max(0, parseInt(v, 10) || 0)); }, 0);
        pSh.appendRow([
          pid,
          safe_(mp.category, 80),
          safe_(mp.name, 140),
          Math.max(0, Number(mp.price) || 0),
          Math.max(0, Number(mp.actualPrice) || 0),
          mp.isNewArrival ? 'YES' : 'NO',
          JSON.stringify(sizeStock),
          totalAvail,
          safe_(mp.desc || '', 500),
          formula,
          img1,
          img2,
          img3,
          vidUrl,
          new Date()
        ]);
        if (formula) pSh.setRowHeight(pSh.getLastRow(), 90);
        existingPids[pid] = true;
      });
    }

    if (Array.isArray(productsList) && productsList.length > 0) {
      const sh = stockSheet_();
      productsList.slice(0, 300).forEach(function (p) {
        if (!p || !p.id || delSet[String(p.id).trim()]) return;
        upsertStockRow_(
          sh,
          p.id,
          p.name || '',
          p.availableStock,
          p.image || '',
          true,
          p.category || '',
          p.size || 'Free Size (Adjustable Dori)',
          0,
          siteBaseUrl
        );
      });
    }

    return {
      ok: true,
      stock: readStockMap_(),
      sizeStock: readSizeStockMap_(),
      products: readProductsMaster_(),
      deletedIds: getAllDeletedIds_(),
      categories: readCategoriesMaster_(),
      deletedCategoryNames: getDeletedCategoryNames_(),
      offers: readOffersMaster_()
    };
  } finally {
    lock.releaseLock();
  }
}

function setStock_(token, productId, stock, productName, imageUrl, category, size, siteBaseUrl) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const pid = safe_(productId, 30);
  if (!pid) return { ok: false, error: 'bad_product' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = stockSheet_();
    upsertStockRow_(sh, pid, productName, stock, imageUrl, false, category || '', size || 'Free Size (Adjustable Dori)', 0, siteBaseUrl);
    return { ok: true, stock: readStockMap_(), sizeStock: readSizeStockMap_() };
  } finally {
    lock.releaseLock();
  }
}

function deductStockFromSheet_(items, siteBaseUrl, soldDeltaOverride) {
  const sh = stockSheet_();
  const sizeMap = readSizeStockMap_();
  items.forEach(function (it) {
    const pid = String(it.id || '').trim();
    if (!pid) return;
    const soldQty = Math.max(1, parseInt(it.qty, 10) || 1);
    const sz = String(it.size || 'Free Size (Adjustable Dori)').trim();
    const baseStock = (sizeMap[pid] && Object.prototype.hasOwnProperty.call(sizeMap[pid], sz))
      ? sizeMap[pid][sz]
      : Math.max(0, parseInt(it.currentStock, 10) || 0);
    const updatedAvail = Math.max(0, baseStock - soldQty);
    if (!sizeMap[pid]) sizeMap[pid] = {};
    sizeMap[pid][sz] = updatedAvail;

    upsertStockRow_(
      sh,
      pid,
      it.name,
      updatedAvail,
      it.image,
      false,
      it.category || '',
      sz,
      soldQty,
      ''
    );
  });
  return { stock: readStockMap_(), sizeStock: readSizeStockMap_() };
}

function safe_(v, max) {
  let t = String(v == null ? '' : v).replace(/\r/g, '').slice(0, max || 300);
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return t;
}

function imgUrl_(u) {
  u = String(u || '').trim();
  if (!/^https?:\/\/[^\s"'<>]{1,480}$/i.test(u)) return '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(u)) return '';
  return u;
}

function constEq_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ---------- new order ----------
function addOrder_(o) {
  if (!o || !o.orderId || !o.customer || !Array.isArray(o.items) || o.items.length === 0 || o.items.length > 50) {
    return { ok: false, error: 'invalid_order' };
  }
  const c = o.customer;
  const mobile = String(c.mobile || '').replace(/[^0-9]/g, '');
  const pin = String(c.pincode || '').replace(/[^0-9]/g, '');
  if (!c.name || mobile.length !== 10 || pin.length !== 6 || !c.address || !c.city) {
    return { ok: false, error: 'invalid_customer' };
  }

  const masterById = {};
  readProductsMaster_().forEach(function (mp) { masterById[mp.id] = mp; });

  const items = o.items.map(function (i) {
    const pid = safe_(i.id, 20);
    const mp = masterById[pid] || {};
    const resolvedImg = resolveMediaUrl_(i.image, pid + '_ord', o.siteBaseUrl || '');
    const offerPrice = Math.max(0, Math.min(1000000, Number(i.price) || Number(mp.price) || 0));
    const actualPrice = Math.max(0, Math.min(1000000, Number(i.actualPrice) || Number(mp.actualPrice) || offerPrice));
    const discAmt = actualPrice > offerPrice ? (actualPrice - offerPrice) : 0;
    const discPct = actualPrice > offerPrice ? Math.round((discAmt / actualPrice) * 100) : 0;
    return {
      id: pid,
      category: safe_(i.category || mp.category || '', 80),
      name: safe_(i.name || mp.name || '', 120),
      size: safe_(i.size, 60),
      qty: Math.max(1, Math.min(500, Number(i.qty) || 1)),
      price: offerPrice,
      actualPrice: actualPrice,
      discountText: discAmt > 0 ? ('₹' + discAmt + ' (' + discPct + '% OFF)') : '₹0 (0%)',
      note: safe_(i.note, 300),
      image: imgUrl_(resolvedImg) || resolvedImg,
      currentStock: Math.max(0, parseInt(i.currentStock, 10) || 0)
    };
  });
  const total = items.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
  const orderId = safe_(o.orderId, 30);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last > 1) {
      const ids = sh.getRange(2, 2, last - 1, 1).getValues();
      for (let r = 0; r < ids.length; r++) {
        if (ids[r][0] === orderId) return { ok: true, duplicate: true, stock: readStockMap_(), sizeStock: readSizeStockMap_() };
      }
    }

    const productIdsCol   = items.map(function (i) { return i.id; }).join('\n');
    const categoriesCol   = items.map(function (i) { return i.category || '-'; }).join('\n');
    const productNamesCol = items.map(function (i) { return i.name; }).join('\n');
    const sizesCol        = items.map(function (i) { return i.size; }).join('\n');
    const quantitiesCol   = items.map(function (i) { return i.qty; }).join('\n');
    const customNotesCol  = items.map(function (i) { return i.note || '-'; }).join('\n');
    const actualPriceCol  = items.map(function (i) { return i.actualPrice; }).join('\n');
    const offerPriceCol   = items.map(function (i) { return i.price; }).join('\n');
    const discountCol     = items.map(function (i) { return i.discountText; }).join('\n');

    const imgs = items.map(function (i) { return i.image; }).filter(Boolean);
    const imgCells = [];
    for (let k = 0; k < MAX_IMG_COLS; k++) {
      const formula = imgs[k] ? buildPreviewFormula_(imgs[k], o.siteBaseUrl || '') : '';
      imgCells.push(formula || '');
    }

    const cleanItemsForJson = items.map(function (i) {
      return { id: i.id, category: i.category, name: i.name, size: i.size, qty: i.qty, price: i.price, actualPrice: i.actualPrice, discount: i.discountText, note: i.note, image: i.image };
    });

    const firstImgUrl = (items[0] && items[0].image) ? items[0].image : '';
    const previewFormula = firstImgUrl ? buildPreviewFormula_(firstImgUrl, o.siteBaseUrl || '') : '';
    sh.appendRow([
      new Date(Number(o.timestamp) || Date.now()), orderId, safe_(o.date, 40),
      safe_(c.name, 100), "'" + mobile, safe_(c.address, 300), safe_(c.city, 80), "'" + pin,
      productIdsCol, categoriesCol, productNamesCol, sizesCol, quantitiesCol, customNotesCol,
      actualPriceCol, offerPriceCol, discountCol,
      total, JSON.stringify(cleanItemsForJson),
      previewFormula || firstImgUrl || ''
    ].concat(imgCells.slice(0, 3), [imgs.join('\n'), 'Pending', new Date(), '']));
    if (previewFormula) {
      sh.getRange(sh.getLastRow(), 20).setFormula(previewFormula);
    }
    if (imgs.length) sh.setRowHeight(sh.getLastRow(), 100);

    const stockRes = deductStockFromSheet_(items, o.siteBaseUrl || '', 0);
    return { ok: true, stock: stockRes.stock, sizeStock: stockRes.sizeStock };
  } finally {
    lock.releaseLock();
  }
}

// ---------- admin ----------
function adminLogin_(username, password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_FAILS) return { ok: false, error: 'locked' };

  const good = constEq_(username || '', ADMIN_USERNAME) & constEq_(password || '', ADMIN_PASSWORD);
  if (!good) {
    cache.put('fails', String(fails + 1), LOCK_SEC);
    return { ok: false, error: 'invalid' };
  }
  cache.remove('fails');
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, '1', TOKEN_TTL_SEC);
  return {
    ok: true,
    token: token,
    orders: readOrders_(),
    enquiries: readEnquiries_(),
    stock: readStockMap_(),
    sizeStock: readSizeStockMap_(),
    products: readProductsMaster_(),
    categories: readCategoriesMaster_(),
    offers: readOffersMaster_(),
    deletedIds: getAllDeletedIds_(),
    autoDeliverEnabled: isAutoDeliverEnabled_()
  };
}

function validToken_(token) {
  return !!token && CacheService.getScriptCache().get('tok_' + token) === '1';
}

function getOrders_(token) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  return {
    ok: true,
    orders: readOrders_(),
    enquiries: readEnquiries_(),
    stock: readStockMap_(),
    sizeStock: readSizeStockMap_(),
    products: readProductsMaster_(),
    categories: readCategoriesMaster_(),
    offers: readOffersMaster_(),
    deletedIds: getAllDeletedIds_(),
    autoDeliverEnabled: isAutoDeliverEnabled_()
  };
}

function adminLogout_(token) {
  if (token) CacheService.getScriptCache().remove('tok_' + token);
  return { ok: true };
}

function getOrderIdSetProp_(key) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function addOrderIdToProp_(key, oid) {
  const arr = getOrderIdSetProp_(key);
  if (arr.indexOf(oid) < 0) {
    arr.push(oid);
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(arr.slice(-1000)));
  }
}

function removeOrderIdFromProp_(key, oid) {
  const arr = getOrderIdSetProp_(key).filter(function (x) { return x !== oid; });
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(arr));
}

function syncProductRowStockFromSheet_(pid, sizeMapForPid) {
  if (!pid || !sizeMapForPid) return;
  try {
    const pSh = productsSheet_();
    const pLast = pSh.getLastRow();
    if (pLast < 2) return;
    const pids = pSh.getRange(2, 1, pLast - 1, 1).getValues();
    for (let r = 0; r < pids.length; r++) {
      if (String(pids[r][0] || '').trim() === pid) {
        const totalAvail = Object.values(sizeMapForPid).reduce(function (s, v) { return s + (Math.max(0, parseInt(v, 10) || 0)); }, 0);
        pSh.getRange(r + 2, 7, 1, 2).setValues([[JSON.stringify(sizeMapForPid), totalAvail]]);
        break;
      }
    }
  } catch (e) {}
}

function applySaleOrRestoreOnStatusChange_(orderRow, orderId, newStatus) {
  const SALE_ELIGIBLE = ['Confirmed', 'Custom Making / Partial Stock Ready', 'Packed', 'Shipped', 'Delivered'];
  let items = [];
  try {
    items = JSON.parse(orderRow[18] || '[]');
  } catch (e) {
    items = [];
  }
  if (!Array.isArray(items) || items.length === 0) return;

  const sh = stockSheet_();
  const saleCountedIds = getOrderIdSetProp_('SALE_COUNTED_ORDER_IDS');
  const alreadyCountedSale = saleCountedIds.indexOf(orderId) >= 0;

  if (SALE_ELIGIBLE.indexOf(newStatus) >= 0 && !alreadyCountedSale) {
    const sizeMap = readSizeStockMap_();
    items.forEach(function (it) {
      const pid = String(it.id || '').trim();
      if (!pid) return;
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const sz = String(it.size || 'Free Size (Adjustable Dori)').trim();
      const curAvail = (sizeMap[pid] && Object.prototype.hasOwnProperty.call(sizeMap[pid], sz))
        ? Math.max(0, parseInt(sizeMap[pid][sz], 10) || 0)
        : 0;
      upsertStockRow_(sh, pid, it.name, curAvail, it.image, false, it.category || '', sz, qty, '');
    });
    addOrderIdToProp_('SALE_COUNTED_ORDER_IDS', orderId);
    removeOrderIdFromProp_('STOCK_RESTORED_ORDER_IDS', orderId);
  } else if (newStatus === 'Cancelled') {
    const restoredIds = getOrderIdSetProp_('STOCK_RESTORED_ORDER_IDS');
    if (restoredIds.indexOf(orderId) < 0) {
      const sizeMap = readSizeStockMap_();
      const last = sh.getLastRow();
      const updatedPids = {};

      items.forEach(function (it) {
        const pid = String(it.id || '').trim();
        if (!pid) return;
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        const sz = String(it.size || 'Free Size (Adjustable Dori)').trim();
        const curAvail = (sizeMap[pid] && Object.prototype.hasOwnProperty.call(sizeMap[pid], sz))
          ? Math.max(0, parseInt(sizeMap[pid][sz], 10) || 0)
          : 0;
        const restoredAvail = curAvail + qty;
        if (!sizeMap[pid]) sizeMap[pid] = {};
        sizeMap[pid][sz] = restoredAvail;
        updatedPids[pid] = sizeMap[pid];

        let matchedStockRow = false;
        if (last >= 2) {
          const sRows = sh.getRange(2, 2, last - 1, 4).getValues();
          for (let k = 0; k < sRows.length; k++) {
            const sPid = String(sRows[k][0] || '').trim();
            const sSz = String(sRows[k][3] || '').trim();
            if (sPid === pid && (!sSz || sSz === sz)) {
              const rowNum = k + 2;
              const prevTotal = Math.max(0, parseInt(sh.getRange(rowNum, 7).getValue(), 10) || 0);
              const prevSold = Math.max(0, parseInt(sh.getRange(rowNum, 9).getValue(), 10) || 0);
              const nextSold = Math.max(0, prevSold - qty);
              const nextTotal = Math.max(restoredAvail + nextSold, prevTotal);
              sh.getRange(rowNum, 7, 1, 4).setValues([[nextTotal, restoredAvail, nextSold, new Date()]]);
              matchedStockRow = true;
              break;
            }
          }
        }
        if (!matchedStockRow) {
          upsertStockRow_(sh, pid, it.name, restoredAvail, it.image, false, it.category || '', sz, 0, '');
        }
      });

      Object.keys(updatedPids).forEach(function (upid) {
        syncProductRowStockFromSheet_(upid, updatedPids[upid]);
      });

      addOrderIdToProp_('STOCK_RESTORED_ORDER_IDS', orderId);
      removeOrderIdFromProp_('SALE_COUNTED_ORDER_IDS', orderId);
    }
  }
}

function updateStatus_(token, orderId, status, cancelReason) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  if (STATUSES.indexOf(status) < 0) return { ok: false, error: 'bad_status' };
  const reason = status === 'Cancelled' ? safe_(cancelReason, 250) : '';
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'not_found' };
    const allRows = sh.getRange(2, 1, last - 1, Math.min(READ_COLS, sh.getLastColumn())).getValues();
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i][1] === orderId) {
        const now = new Date();
        sh.getRange(i + 2, STATUS_COL, 1, 3).setValues([[status, now, reason]]);
        applySaleOrRestoreOnStatusChange_(allRows[i], orderId, status);
        return {
          ok: true,
          status: status,
          cancelReason: reason,
          statusUpdated: now.getTime(),
          stock: readStockMap_(),
          sizeStock: readSizeStockMap_()
        };
      }
    }
    return { ok: false, error: 'not_found' };
  } finally {
    lock.releaseLock();
  }
}

function autoDeliverCheck_(sh, rows) {
  if (!isAutoDeliverEnabled_()) return;
  const cutoff = Date.now() - AUTO_DELIVER_DAYS * 24 * 60 * 60 * 1000;
  const now = new Date();
  rows.forEach(function (r, idx) {
    const st = r[24];
    const upd = r[25] instanceof Date ? r[25].getTime() : 0;
    if (st === 'Shipped' && upd > 0 && upd <= cutoff) {
      r[24] = 'Delivered';
      r[25] = now;
      sh.getRange(idx + 2, STATUS_COL, 1, 2).setValues([['Delivered', now]]);
    }
  });
}

function autoDeliverTrigger() {
  if (!isAutoDeliverEnabled_()) return;
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const rows = sh.getRange(2, 1, last - 1, Math.min(READ_COLS, sh.getLastColumn())).getValues();
  autoDeliverCheck_(sh, rows);
}

function orderStatus_(list) {
  if (!Array.isArray(list)) return { ok: false, error: 'bad_request' };
  const sh = sheet_();
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return { ok: true, statuses: out };
  const rows = sh.getRange(2, 1, last - 1, Math.min(READ_COLS, sh.getLastColumn())).getValues();
  autoDeliverCheck_(sh, rows);
  const byId = {};
  rows.forEach(function (r) { byId[r[1]] = r; });
  list.slice(0, 30).forEach(function (q) {
    const r = q && byId[String(q.orderId)];
    if (!r) return;
    const a = String(r[4]).replace(/[^0-9]/g, '').slice(-10);
    const b = String(q.mobile || '').replace(/[^0-9]/g, '').slice(-10);
    if (a && a === b) {
      out[q.orderId] = {
        status: STATUSES.indexOf(r[24]) >= 0 ? r[24] : 'Pending',
        updated: r[25] instanceof Date ? r[25].getTime() : 0,
        cancelReason: String(r[26] || '')
      };
    }
  });
  return { ok: true, statuses: out };
}

function readOrders_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, Math.min(READ_COLS, sh.getLastColumn())).getValues();
  autoDeliverCheck_(sh, rows);
  return rows.map(function (r) {
    let items = [];
    try { items = JSON.parse(r[18] || '[]'); } catch (e) {}
    const ts = r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0;
    return {
      orderId: r[1], timestamp: ts, date: String(r[2]), total: Number(r[17]) || 0,
      customer: { name: r[3], mobile: String(r[4]).replace(/^'/, ''), address: r[5], city: r[6],
                  pincode: String(r[7]).replace(/^'/, '') },
      items: items,
      status: STATUSES.indexOf(r[24]) >= 0 ? r[24] : 'Pending',
      statusUpdated: r[25] instanceof Date ? r[25].getTime() : 0,
      cancelReason: String(r[26] || '')
    };
  }).reverse();
}

function readEnquiries_() {
  const sh = enquirySheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, ENQUIRY_HEADERS.length).getValues();
  return rows.map(function (r) {
    const enqId = String(r[1] || '').trim();
    if (!enqId) return null;
    const ts = r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0;
    return {
      enquiryId: enqId,
      timestamp: ts,
      date: String(r[2] || ''),
      customerName: String(r[3] || ''),
      mobile: String(r[4] || '').replace(/^'/, ''),
      productId: String(r[5] || ''),
      category: String(r[6] || ''),
      productName: String(r[7] || ''),
      size: String(r[8] || ''),
      availableStock: Number(r[9]) || 0,
      requestedQty: Number(r[10]) || 1,
      extraQty: Number(r[11]) || 0,
      note: String(r[12] || ''),
      status: ENQUIRY_STATUSES.indexOf(String(r[14] || '')) >= 0 ? String(r[14]) : 'New Enquiry'
    };
  }).filter(Boolean).reverse();
}

function getEnquiries_(token) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  return { ok: true, enquiries: readEnquiries_() };
}

function updateEnquiryStatus_(token, enquiryId, status) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  if (ENQUIRY_STATUSES.indexOf(status) < 0) return { ok: false, error: 'bad_status' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = enquirySheet_();
    const last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'not_found' };
    const ids = sh.getRange(2, 2, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim() === String(enquiryId || '').trim()) {
        sh.getRange(i + 2, 15).setValue(status);
        return { ok: true, enquiryId: enquiryId, status: status };
      }
    }
    return { ok: false, error: 'not_found' };
  } finally {
    lock.releaseLock();
  }
}

function enquiryStatus_(list) {
  if (!Array.isArray(list)) return { ok: false, error: 'bad_request' };
  const all = readEnquiries_();
  const byId = {};
  all.forEach(function (q) { byId[q.enquiryId] = q; });
  const out = {};
  list.slice(0, 40).forEach(function (item) {
    const rec = item && byId[String(item.enquiryId || '')];
    if (!rec) return;
    const a = String(rec.mobile || '').replace(/[^0-9]/g, '').slice(-10);
    const b = String(item.mobile || '').replace(/[^0-9]/g, '').slice(-10);
    if (!b || !a || a === b) {
      out[item.enquiryId] = { status: rec.status };
    }
  });
  return { ok: true, statuses: out };
}

// ---------- CATEGORIES MASTER SHEET ("Categories" tab) ----------
function categoriesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CATEGORIES_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CATEGORIES_SHEET_NAME);
    sh.appendRow(CATEGORIES_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CATEGORIES_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(1, 200);
    sh.setColumnWidth(2, 95);
    sh.setColumnWidth(3, 110);
    sh.setColumnWidth(4, 280);
  }
  return sh;
}

function getDeletedCategoryNames_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('DELETED_CATEGORY_NAMES');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function setDeletedCategoryNames_(arr) {
  const unique = Array.from(new Set((arr || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean)));
  PropertiesService.getScriptProperties().setProperty('DELETED_CATEGORY_NAMES', JSON.stringify(unique.slice(0, 300)));
  return unique;
}

function readCategoriesMaster_() {
  const sh = categoriesSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, CATEGORIES_HEADERS.length).getValues();
  const out = [];
  rows.forEach(function (r) {
    const cname = String(r[0] || '').trim();
    if (!cname) return;
    out.push({
      name: cname,
      prefix: String(r[1] || '').trim(),
      image: String(r[3] || '').trim() || 'assets/Categories/Comming-Soon.png'
    });
  });
  return out;
}

function saveCategoryMaster_(token, catObj, oldName, siteBaseUrl) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  if (!catObj || !catObj.name) return { ok: false, error: 'invalid_category' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = categoriesSheet_();
    const cname = safe_(catObj.name, 80);
    const prevName = safe_(oldName || cname, 80);
    const prefix = safe_(catObj.prefix || cname.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3), 10);
    const resolvedImg = resolveMediaUrl_(catObj.image, 'CAT_' + cname.replace(/[^A-Za-z0-9]/g, '_'), siteBaseUrl);
    const previewFormula = buildPreviewFormula_(resolvedImg, siteBaseUrl);
    const now = new Date();

    setDeletedCategoryNames_(getDeletedCategoryNames_().filter(function (x) {
      return x.toLowerCase() !== cname.toLowerCase();
    }));

    const rowData = [cname, prefix, previewFormula, resolvedImg, now];
    const last = sh.getLastRow();
    let targetRow = -1;
    if (last >= 2) {
      const names = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < names.length; i++) {
        const existing = String(names[i][0] || '').trim();
        if (existing.toLowerCase() === prevName.toLowerCase() || existing.toLowerCase() === cname.toLowerCase()) {
          targetRow = i + 2;
          break;
        }
      }
    }

    if (targetRow > 0) {
      sh.getRange(targetRow, 1, 1, CATEGORIES_HEADERS.length).setValues([rowData]);
      if (previewFormula) sh.setRowHeight(targetRow, 95);
    } else {
      sh.appendRow(rowData);
      if (previewFormula) sh.setRowHeight(sh.getLastRow(), 95);
    }

    if (prevName && cname && prevName.toLowerCase() !== cname.toLowerCase()) {
      const pSh = productsSheet_();
      const pLast = pSh.getLastRow();
      if (pLast >= 2) {
        const pCats = pSh.getRange(2, 2, pLast - 1, 1).getValues();
        for (let r = 0; r < pCats.length; r++) {
          if (String(pCats[r][0] || '').trim().toLowerCase() === prevName.toLowerCase()) {
            pSh.getRange(r + 2, 2).setValue(cname);
          }
        }
      }
      const sSh = stockSheet_();
      const sLast = sSh.getLastRow();
      if (sLast >= 2) {
        const sCats = sSh.getRange(2, 3, sLast - 1, 1).getValues();
        for (let r = 0; r < sCats.length; r++) {
          if (String(sCats[r][0] || '').trim().toLowerCase() === prevName.toLowerCase()) {
            sSh.getRange(r + 2, 3).setValue(cname);
          }
        }
      }
    }

    return {
      ok: true,
      categories: readCategoriesMaster_(),
      deletedCategoryNames: getDeletedCategoryNames_(),
      products: readProductsMaster_()
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteCategoryMaster_(token, categoryName) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const cname = safe_(categoryName, 80);
  if (!cname) return { ok: false, error: 'bad_category' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = categoriesSheet_();
    setDeletedCategoryNames_(getDeletedCategoryNames_().concat([cname]));
    const last = sh.getLastRow();
    if (last >= 2) {
      const names = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = names.length - 1; i >= 0; i--) {
        if (String(names[i][0] || '').trim().toLowerCase() === cname.toLowerCase()) {
          sh.deleteRow(i + 2);
        }
      }
    }

    const pSh = productsSheet_();
    const pLast = pSh.getLastRow();
    const removedPids = [];
    if (pLast >= 2) {
      const pRows = pSh.getRange(2, 1, pLast - 1, 2).getValues();
      for (let r = pRows.length - 1; r >= 0; r--) {
        if (String(pRows[r][1] || '').trim().toLowerCase() === cname.toLowerCase()) {
          const pid = String(pRows[r][0] || '').trim();
          if (pid) removedPids.push(pid);
          pSh.deleteRow(r + 2);
        }
      }
    }
    if (removedPids.length > 0) {
      setDeletedProductIds_(getDeletedProductIds_().concat(removedPids));
    }

    const sSh = stockSheet_();
    const sLast = sSh.getLastRow();
    if (sLast >= 2) {
      const sCats = sSh.getRange(2, 3, sLast - 1, 1).getValues();
      for (let r = sCats.length - 1; r >= 0; r--) {
        if (String(sCats[r][0] || '').trim().toLowerCase() === cname.toLowerCase()) {
          sSh.deleteRow(r + 2);
        }
      }
    }

    return {
      ok: true,
      categories: readCategoriesMaster_(),
      deletedCategoryNames: getDeletedCategoryNames_(),
      products: readProductsMaster_(),
      deletedIds: getAllDeletedIds_()
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------- OFFERS MASTER SHEET ("Offers" tab) ----------
function offersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(OFFERS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(OFFERS_SHEET_NAME);
    sh.appendRow(OFFERS_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, OFFERS_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(1, 110);
    sh.setColumnWidth(2, 110);
    sh.setColumnWidth(5, 210);
    sh.setColumnWidth(6, 300);
  }
  return sh;
}

function readOffersMaster_() {
  const sh = offersSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, OFFERS_HEADERS.length).getValues();
  return rows.map(function (r) {
    const oid = String(r[0] || '').trim();
    if (!oid) return null;
    return {
      id: oid,
      type: String(r[1] || 'card').trim(),
      badge1: String(r[2] || '').trim(),
      badge2: String(r[3] || '').trim(),
      title: String(r[4] || '').trim(),
      desc: String(r[5] || '').trim(),
      targetCategory: String(r[6] || 'All').trim(),
      featuredGreen: String(r[7]).toUpperCase() === 'YES' || r[7] === true,
      active: String(r[8]).toUpperCase() !== 'NO'
    };
  }).filter(Boolean);
}

function saveOfferMaster_(token, offer) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  if (!offer || !offer.title) return { ok: false, error: 'invalid_offer' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = offersSheet_();
    const oid = safe_(offer.id || ('OFR-' + Date.now().toString().slice(-5)), 30);
    const rowData = [
      oid,
      safe_(offer.type || 'card', 30),
      safe_(offer.badge1 || '', 60),
      safe_(offer.badge2 || '', 60),
      safe_(offer.title || '', 120),
      safe_(offer.desc || '', 300),
      safe_(offer.targetCategory || 'All', 80),
      offer.featuredGreen ? 'YES' : 'NO',
      offer.active === false ? 'NO' : 'YES',
      new Date()
    ];
    const last = sh.getLastRow();
    let targetRow = -1;
    if (last >= 2) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim() === oid) {
          targetRow = i + 2;
          break;
        }
      }
    }
    if (targetRow > 0) {
      sh.getRange(targetRow, 1, 1, OFFERS_HEADERS.length).setValues([rowData]);
    } else {
      sh.appendRow(rowData);
    }
    return { ok: true, offers: readOffersMaster_() };
  } finally {
    lock.releaseLock();
  }
}

function deleteOfferMaster_(token, offerId) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const oid = safe_(offerId, 30);
  if (!oid) return { ok: false, error: 'bad_offer' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = offersSheet_();
    const last = sh.getLastRow();
    if (last >= 2) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0] || '').trim() === oid) {
          sh.deleteRow(i + 2);
        }
      }
    }
    return { ok: true, offers: readOffersMaster_() };
  } finally {
    lock.releaseLock();
  }
}

function getOrdersByMobile_(mobile) {
  const cleanMob = String(mobile || '').replace(/[^0-9]/g, '').slice(-10);
  if (cleanMob.length !== 10) {
    return { ok: false, error: 'invalid_mobile' };
  }
  const allOrders = readOrders_().filter(function (o) {
    const om = String((o.customer && o.customer.mobile) || '').replace(/[^0-9]/g, '').slice(-10);
    return om === cleanMob;
  });
  const allEnqs = readEnquiries_().filter(function (eq) {
    const em = String(eq.mobile || '').replace(/[^0-9]/g, '').slice(-10);
    return em === cleanMob;
  });
  return { ok: true, orders: allOrders, enquiries: allEnqs };
}

function setup() {
  categoriesSheet_();
  offersSheet_();
  sheet_();
  stockSheet_();
  enquirySheet_();
  productsSheet_();
  getOrCreateMediaFolder_();
}
