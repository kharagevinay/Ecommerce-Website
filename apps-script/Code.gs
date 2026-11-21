/**
 * Jewellery by Riddhi - Google Sheet Orders, Stock & Enquiry Backend (Google Apps Script)
 *
 * Tabs managed automatically:
 *  1) "Orders"  -> Timestamp, Order ID, Date, Name, Mobile, Address, City, Pincode, Product ID, Category, Product Name, Size, Quantity, Customization Note, Total (INR), Items JSON, Image 1, Image 2, Image 3, Image Links, Status, Status Updated, Cancel Reason
 *  2) "Stock"   -> Date, Product ID, Category, Product Name, Size, Image, Total Quantity, Available Quantity, Sale Hui Quantity, Last Updated
 *  3) "Enquiry" -> Timestamp, Enquiry ID, Date, Customer Name, Mobile, Product ID, Category, Product Name, Size, Available Stock, Requested Quantity, Extra Needed Qty, Customization Note, Image, Status
 */

// ====== SIRF YE 2 LINES BADLEIN ======
const ADMIN_USERNAME = 'Riddhi';
const ADMIN_PASSWORD = 'Riddhi@2026';   // <-- deploy karne se pehle zaroor badal dein
// =====================================

const SHEET_NAME = 'Orders';
const STOCK_SHEET_NAME = 'Stock';
const ENQUIRY_SHEET_NAME = 'Enquiry';

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

const READ_COLS = 23;
const STATUS_COL = 21;               // Orders sheet "Status" column (U)
const CANCEL_REASON_COL = 23;        // Orders sheet "Cancel Reason" column (W)
const STATUSES = ['Pending', 'Confirmed', 'Custom Making / Partial Stock Ready', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const ENQUIRY_STATUSES = ['New Enquiry', 'Contacted', 'Confirmed', 'Completed', 'Closed'];
const AUTO_DELIVER_DAYS = 5;
const MAX_IMG_COLS = 3;
const TOKEN_TTL_SEC = 2 * 60 * 60;   // admin login 2 ghante chalta hai
const MAX_FAILS = 5;
const LOCK_SEC = 10 * 60;

function doGet() {
  return json_({ ok: true, service: 'Jewellery by Riddhi orders, stock & enquiry', stock: readStockMap_() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'newOrder':          return json_(addOrder_(body.order));
      case 'newEnquiry':        return json_(addEnquiry_(body.enquiry));
      case 'getStock':          return json_({ ok: true, stock: readStockMap_() });
      case 'syncCatalog':       return json_(syncCatalog_(body.products));
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
    return json_({ ok: false, error: 'server_error' });
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
  } else {
    const col9 = String(sh.getRange(1, 9).getValue() || '').trim();
    if (col9 !== 'Product ID' || sh.getLastColumn() < HEADERS.length) {
      // Purane 18-column Orders sheet ko naye 23-column structure me safely migrate karein
      const last = sh.getLastRow();
      const oldRows = last >= 2 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
      sh.clear();
      sh.appendRow(HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
      sh.setColumnWidth(11, 220);
      for (let c = 17; c <= 19; c++) sh.setColumnWidth(c, 110);
      statusValidation_(sh);

      oldRows.forEach(function (r) {
        if (!r[1]) return;
        let items = [];
        try { items = JSON.parse(r[10] || '[]'); } catch (e) {}
        const pids = items.map(function (i) { return i.id || ''; }).filter(Boolean).join('\n');
        const cats = items.map(function (i) { return i.category || ''; }).filter(Boolean).join('\n');
        const pnames = items.map(function (i) { return i.name || ''; }).filter(Boolean).join('\n') || String(r[8] || '');
        const sizes = items.map(function (i) { return i.size || ''; }).filter(Boolean).join('\n');
        const qtys = items.map(function (i) { return i.qty || 1; }).join('\n');
        const notes = items.map(function (i) { return i.note || '-'; }).join('\n');
        const imgs = items.map(function (i) { return imgUrl_(i.image); }).filter(Boolean);
        const imgCells = [];
        for (let k = 0; k < MAX_IMG_COLS; k++) {
          imgCells.push(imgs[k] ? '=IMAGE("' + imgs[k] + '")' : '');
        }
        sh.appendRow([
          r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7],
          pids, cats, pnames, sizes, qtys, notes,
          r[9], r[10] || '[]'
        ].concat(imgCells, [r[14] || imgs.join('\n'), r[15] || 'Pending', r[16] || new Date(), r[17] || '']));
        if (imgs.length) sh.setRowHeight(sh.getLastRow(), 100);
      });
    }
  }
  return sh;
}

// ---------- LIVE GLOBAL STOCK SHEET ("Stock" tab) ----------
// Columns: Date | Product ID | Category | Product Name | Size | Image | Total Quantity | Available Quantity | Sale Hui Quantity | Last Updated
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
  } else {
    const col3 = String(sh.getRange(1, 3).getValue() || '').trim();
    if (col3 !== 'Category' || sh.getLastColumn() < STOCK_HEADERS.length) {
      const last = sh.getLastRow();
      const oldData = last >= 2 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
      sh.clear();
      sh.appendRow(STOCK_HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, STOCK_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
      sh.setColumnWidth(6, 105);
      const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd MMM yyyy');
      oldData.forEach(function (r) {
        // Purane 6-col format: [Date, Product ID, Product Name, Image, Available Stock, Last Updated]
        if (r[1]) {
          const avail = Math.max(0, parseInt(r[4], 10) || 0);
          sh.appendRow([r[0] || todayStr, r[1], '', r[2] || '', 'Free Size (Adjustable Dori)', '', avail, avail, 0, r[5] || new Date()]);
        }
      });
    }
  }
  return sh;
}

// ---------- ENQUIRY SHEET ("Enquiry" tab) ----------
// Columns: Timestamp | Enquiry ID | Date | Customer Name | Mobile | Product ID | Category | Product Name | Size | Available Stock | Requested Quantity | Extra Needed Qty | Customization Note | Image | Status
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
      map[pid] = Math.max(0, parseInt(r[7], 10) || 0);
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
    const ids = sh.getRange(2, 2, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === pid) {
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
          // Ensure Total = Available + Sold consistency
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
        // Agar admin ne manually stock badhaya hai (deltaSold === 0), toh Total Quantity = Available + Sold
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
    return { ok: true, stock: readStockMap_() };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = stockSheet_();
    productsList.slice(0, 200).forEach(function (p) {
      if (!p || !p.id) return;
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
    return { ok: true, stock: readStockMap_() };
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
    return { ok: true, stock: readStockMap_() };
  } finally {
    lock.releaseLock();
  }
}

function deductStockFromSheet_(items) {
  const sh = stockSheet_();
  const currentMap = readStockMap_();
  items.forEach(function (it) {
    const pid = String(it.id || '').trim();
    if (!pid) return;
    const soldQty = Math.max(1, parseInt(it.qty, 10) || 1);
    const baseStock = Object.prototype.hasOwnProperty.call(currentMap, pid)
      ? currentMap[pid]
      : Math.max(0, parseInt(it.currentStock, 10) || 0);
    const updatedAvail = Math.max(0, baseStock - soldQty);
    currentMap[pid] = updatedAvail;
    upsertStockRow_(
      sh,
      pid,
      it.name,
      updatedAvail,
      it.image,
      false,
      it.category || '',
      it.size || 'Free Size (Adjustable Dori)',
      soldQty
    );
  });
  return currentMap;
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
        if (ids[r][0] === orderId) return { ok: true, duplicate: true, stock: readStockMap_() };
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

    const updatedStockMap = deductStockFromSheet_(items);
    return { ok: true, stock: updatedStockMap };
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
  return { ok: true, token: token, orders: readOrders_(), stock: readStockMap_(), autoDeliverEnabled: isAutoDeliverEnabled_() };
}

function validToken_(token) {
  return !!token && CacheService.getScriptCache().get('tok_' + token) === '1';
}

function getOrders_(token) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  return { ok: true, orders: readOrders_(), stock: readStockMap_(), autoDeliverEnabled: isAutoDeliverEnabled_() };
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

function setup() {
  sheet_();
  stockSheet_();
  enquirySheet_();
}
