/**
 * Jewellery by Riddhi - Google Sheet Orders, Stock, Products Master, Drive Media & Enquiry Backend
 *
 * Tabs managed automatically:
 *  1) "Orders"   -> Timestamp, Order ID, Date, Name, Mobile, Address, City, Pincode, Product ID, Category, Product Name, Size, Quantity, Customization Note, Total (INR), Items JSON, Image 1, Image 2, Image 3, Image Links, Status, Status Updated, Cancel Reason
 *  2) "Stock"    -> Date, Product ID, Category, Product Name, Size, Image, Total Quantity, Available Quantity, Sale Hui Quantity, Last Updated
 *  3) "Enquiry"  -> Timestamp, Enquiry ID, Date, Customer Name, Mobile, Product ID, Category, Product Name, Size, Available Stock, Requested Quantity, Extra Needed Qty, Customization Note, Image, Status
 *  4) "Products" -> Product ID, Category, Product Name, Offer Price (INR), Actual Price (INR), New Arrival, Sizes & Stock JSON, Total Available Stock, Description, Image Preview, Image 1 URL, Image 2 URL, Image 3 URL, Video URL, Last Updated
 */

// ====== SIRF YE 2 LINES BADLEIN ======
const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = 'Admin@123';   // <-- deploy karne se pehle zaroor badal dein
// =====================================

const SHEET_NAME = 'Orders';
const STOCK_SHEET_NAME = 'Stock';
const ENQUIRY_SHEET_NAME = 'Enquiry';
const PRODUCTS_SHEET_NAME = 'Products';
const DRIVE_MEDIA_FOLDER_NAME = 'Jewellery_by_Riddhi_Media';

const HEADERS = [
  'Timestamp', 'Order ID', 'Date', 'Name', 'Mobile', 'Address', 'City', 'Pincode',
  'Product ID', 'Category', 'Product Name', 'Size', 'Quantity', 'Customization Note',
  'Total (INR)', 'Items JSON', 'Image 1', 'Image 2', 'Image 3', 'Image Links',
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

const READ_COLS = 23;
const STATUS_COL = 21;
const CANCEL_REASON_COL = 23;
const STATUSES = ['Pending', 'Confirmed', 'Custom Making / Partial Stock Ready', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const ENQUIRY_STATUSES = ['New Enquiry', 'Contacted', 'Confirmed', 'Completed', 'Closed'];
const AUTO_DELIVER_DAYS = 5;
const MAX_IMG_COLS = 3;
const TOKEN_TTL_SEC = 2 * 60 * 60;
const MAX_FAILS = 5;
const LOCK_SEC = 10 * 60;

function doGet() {
  return json_({
    ok: true,
    service: 'Jewellery by Riddhi orders, stock, products & enquiry',
    stock: readStockMap_(),
    sizeStock: readSizeStockMap_(),
    products: readProductsMaster_(),
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
      case 'getProducts':       return json_({ ok: true, products: readProductsMaster_(), deletedIds: getAllDeletedIds_(), sizeStock: readSizeStockMap_() });
      case 'syncCatalog':       return json_(syncCatalog_(body.products));
      case 'saveProduct':       return json_(saveProductMaster_(body.token, body.product));
      case 'deleteProduct':     return json_(deleteProductMaster_(body.token, body.productId));
      case 'setStock':          return json_(setStock_(body.token, body.productId, body.stock, body.productName, body.image, body.category, body.size));
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

// ---------- helpers ----------
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

function resolveMediaUrl_(rawVal, filenamePrefix) {
  const val = String(rawVal || '').trim();
  if (!val) return '';
  // If already a normal http/https URL or relative asset path, return as-is
  if (!val.startsWith('data:')) {
    return val;
  }
  // Convert data:<mime>;base64,<data> into a real public Drive file URL so =IMAGE() works in Google Sheet & across all devices!
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
    // lh3.googleusercontent.com direct image URL works reliably in both Google Sheets =IMAGE() and mobile/desktop <img> tags!
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w800';
  } catch (err) {
    return '';
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
  } else {
    // Migrate old 14-col Products sheet (without Image Preview column) to 15-col format
    const col10 = String(sh.getRange(1, 10).getValue() || '').trim();
    if (col10 !== 'Image Preview' || sh.getLastColumn() < PRODUCTS_HEADERS.length) {
      const last = sh.getLastRow();
      const oldRows = last >= 2 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
      sh.clear();
      sh.appendRow(PRODUCTS_HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, PRODUCTS_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
      sh.setColumnWidth(10, 110);
      oldRows.forEach(function (r) {
        if (!r[0]) return;
        const img1 = String(r[9] || '').trim();
        const cleanHttp = imgUrl_(img1);
        sh.appendRow([
          r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8],
          cleanHttp ? '=IMAGE("' + cleanHttp + '")' : '',
          img1, r[10] || '', r[11] || '', r[12] || '', r[13] || new Date()
        ]);
        if (cleanHttp) sh.setRowHeight(sh.getLastRow(), 90);
      });
    }
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

// If admin manually deleted a row directly inside Google Sheet ("Products" tab), detect that missing ID so all devices also remove it!
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

  // Any ID that was previously in Products sheet (knownIds) but is now missing from Products sheet was manually deleted by admin in Google Sheet!
  const newlyDeleted = [];
  knownIds.forEach(function (kid) {
    if (!presentMap[kid]) {
      newlyDeleted.push(kid);
    }
  });

  if (newlyDeleted.length > 0) {
    const mergedDeleted = setDeletedProductIds_(storedDeleted.concat(newlyDeleted));
    const remainingKnown = knownIds.filter(function (k) { return !presentMap[k] ? false : true; });
    setKnownSyncedIds_(remainingKnown);

    // Also remove those manually deleted products from Stock tab so Stock tab stays clean
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

  // Update known synced IDs whenever Products sheet has rows
  if (presentIds.length > 0) {
    setKnownSyncedIds_(getKnownSyncedIds_().concat(presentIds));
  }
  return out;
}

function saveProductMaster_(token, prod) {
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

    // Ensure pid is removed from deleted list & added to known list
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
    const img1 = resolveMediaUrl_(rawImgs[0], pid + '_img1');
    const img2 = resolveMediaUrl_(rawImgs[1], pid + '_img2');
    const img3 = resolveMediaUrl_(rawImgs[2], pid + '_img3');
    const videoUrl = resolveMediaUrl_(prod.video, pid + '_vid');
    const now = new Date();

    const cleanHttpPreview = imgUrl_(img1);
    const previewFormula = cleanHttpPreview ? '=IMAGE("' + cleanHttpPreview + '")' : '';

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
      if (previewFormula) sh.setRowHeight(updatedRow, 90);
    } else {
      sh.appendRow(rowData);
      if (previewFormula) sh.setRowHeight(sh.getLastRow(), 90);
    }

    // Sync each size into Stock sheet and remove deleted sizes for this product from Stock sheet
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
      upsertStockRow_(stockSh, pid, pname, sizeStock[sz], img1, false, pcat, sz, 0);
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
    for (let c = 17; c <= 19; c++) sh.setColumnWidth(c, 110);
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
    sh.setColumnWidth(6, 105);
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
    const cleanImg = imgUrl_(enq.image);
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
      '',
      'New Enquiry'
    ]);
    const rowNum = sh.getLastRow();
    if (cleanImg) {
      sh.getRange(rowNum, 14).setFormula('=IMAGE("' + cleanImg + '")');
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

function upsertStockRow_(sh, productId, productName, newAvailStock, imageUrl, onlyIfMissing, category, size, soldDelta) {
  const pid = safe_(productId, 30);
  const pname = safe_(productName || '', 120);
  const pcat = safe_(category || '', 80);
  const psize = safe_(size || 'Free Size (Adjustable Dori)', 60);
  const availQty = Math.max(0, parseInt(newAvailStock, 10) || 0);
  const deltaSold = Math.max(0, parseInt(soldDelta, 10) || 0);
  const cleanImg = imgUrl_(imageUrl);
  const imgFormula = cleanImg ? '=IMAGE("' + cleanImg + '")' : '';
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
  sh.appendRow([dateStr, pid, pcat, pname, psize, '', initTotal, availQty, initSold, now]);
  const newRowNum = sh.getLastRow();
  if (imgFormula) {
    sh.getRange(newRowNum, 6).setFormula(imgFormula);
    sh.setRowHeight(newRowNum, 90);
  }
  return availQty;
}

function syncCatalog_(productsList) {
  if (!Array.isArray(productsList) || productsList.length === 0) {
    return { ok: true, stock: readStockMap_(), sizeStock: readSizeStockMap_(), products: readProductsMaster_(), deletedIds: getAllDeletedIds_() };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = stockSheet_();
    const delSet = {};
    getAllDeletedIds_().forEach(function (id) { delSet[id] = true; });
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
        0
      );
    });
    return { ok: true, stock: readStockMap_(), sizeStock: readSizeStockMap_(), products: readProductsMaster_(), deletedIds: getAllDeletedIds_() };
  } finally {
    lock.releaseLock();
  }
}

function setStock_(token, productId, stock, productName, imageUrl, category, size) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const pid = safe_(productId, 30);
  if (!pid) return { ok: false, error: 'bad_product' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = stockSheet_();
    upsertStockRow_(sh, pid, productName, stock, imageUrl, false, category || '', size || 'Free Size (Adjustable Dori)', 0);
    return { ok: true, stock: readStockMap_(), sizeStock: readSizeStockMap_() };
  } finally {
    lock.releaseLock();
  }
}

function deductStockFromSheet_(items) {
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
      soldQty
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
  return /^https?:\/\/[^\s"'<>]{1,480}$/i.test(u) ? u : '';
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

  const items = o.items.map(function (i) {
    return {
      id: safe_(i.id, 20),
      category: safe_(i.category || '', 80),
      name: safe_(i.name, 120),
      size: safe_(i.size, 60),
      qty: Math.max(1, Math.min(500, Number(i.qty) || 1)),
      price: Math.max(0, Math.min(1000000, Number(i.price) || 0)),
      note: safe_(i.note, 300),
      image: imgUrl_(i.image),
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

    const imgs = items.map(function (i) { return i.image; }).filter(Boolean);
    const imgCells = [];
    for (let k = 0; k < MAX_IMG_COLS; k++) {
      imgCells.push(imgs[k] ? '=IMAGE("' + imgs[k] + '")' : '');
    }

    const cleanItemsForJson = items.map(function (i) {
      return { id: i.id, category: i.category, name: i.name, size: i.size, qty: i.qty, price: i.price, note: i.note, image: i.image };
    });

    sh.appendRow([
      new Date(Number(o.timestamp) || Date.now()), orderId, safe_(o.date, 40),
      safe_(c.name, 100), "'" + mobile, safe_(c.address, 300), safe_(c.city, 80), "'" + pin,
      productIdsCol, categoriesCol, productNamesCol, sizesCol, quantitiesCol, customNotesCol,
      total, JSON.stringify(cleanItemsForJson)
    ].concat(imgCells, [imgs.join('\n'), 'Pending', new Date(), '']));
    if (imgs.length) sh.setRowHeight(sh.getLastRow(), 100);

    const stockRes = deductStockFromSheet_(items);
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
    deletedIds: getAllDeletedIds_(),
    autoDeliverEnabled: isAutoDeliverEnabled_()
  };
}

function adminLogout_(token) {
  if (token) CacheService.getScriptCache().remove('tok_' + token);
  return { ok: true };
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
    const ids = sh.getRange(2, 2, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === orderId) {
        const now = new Date();
        sh.getRange(i + 2, STATUS_COL, 1, 3).setValues([[status, now, reason]]);
        return { ok: true, status: status, cancelReason: reason, statusUpdated: now.getTime() };
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
    const st = r[20];
    const upd = r[21] instanceof Date ? r[21].getTime() : 0;
    if (st === 'Shipped' && upd > 0 && upd <= cutoff) {
      r[20] = 'Delivered';
      r[21] = now;
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
        status: STATUSES.indexOf(r[20]) >= 0 ? r[20] : 'Pending',
        updated: r[21] instanceof Date ? r[21].getTime() : 0,
        cancelReason: String(r[22] || '')
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
    try { items = JSON.parse(r[15] || '[]'); } catch (e) {}
    const ts = r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0;
    return {
      orderId: r[1], timestamp: ts, date: String(r[2]), total: Number(r[14]) || 0,
      customer: { name: r[3], mobile: String(r[4]).replace(/^'/, ''), address: r[5], city: r[6],
                  pincode: String(r[7]).replace(/^'/, '') },
      items: items,
      status: STATUSES.indexOf(r[20]) >= 0 ? r[20] : 'Pending',
      statusUpdated: r[21] instanceof Date ? r[21].getTime() : 0,
      cancelReason: String(r[22] || '')
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

function setup() {
  sheet_();
  stockSheet_();
  enquirySheet_();
  productsSheet_();
  getOrCreateMediaFolder_();
}
