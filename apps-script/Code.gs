/**
 * Jewellery by Riddhi - Google Sheet order & live stock backend (Google Apps Script)
 *
 * Kaam:
 *  1) Website se aaya har order "Orders" tab me row ban jata hai + product stock automatically deduct hota hai.
 *  2) Saare products ka catalog aur live stock "Stock" tab me (Date, Product ID, Product Name, Image, Available Stock, Last Updated) columns ke saath save rehta hai.
 *  3) Admin ka username/password server par check hota hai.
 *  4) Cancel Reason + Toggleable Auto-Delivered Timer (5 days after Shipped).
 */

// ====== SIRF YE 2 LINES BADLEIN ======
const ADMIN_USERNAME = 'Riddhi';
const ADMIN_PASSWORD = 'Riddhi@2026';   // <-- deploy karne se pehle zaroor badal dein
// =====================================

const SHEET_NAME = 'Orders';
const STOCK_SHEET_NAME = 'Stock';
const HEADERS = ['Timestamp', 'Order ID', 'Date', 'Name', 'Mobile', 'Address', 'City', 'Pincode',
                 'Items', 'Total (INR)', 'Items JSON', 'Image 1', 'Image 2', 'Image 3', 'Image Links',
                 'Status', 'Status Updated', 'Cancel Reason'];
const STOCK_HEADERS = ['Date', 'Product ID', 'Product Name', 'Image', 'Available Stock', 'Last Updated'];
const READ_COLS = 18;
const STATUS_COL = 16;               // Sheet ka "Status" column (P)
const CANCEL_REASON_COL = 18;        // Sheet ka "Cancel Reason" column (R)
const STATUSES = ['Pending', 'Confirmed', 'Custom Making / Partial Stock Ready', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const AUTO_DELIVER_DAYS = 5;
const MAX_IMG_COLS = 3;
const TOKEN_TTL_SEC = 2 * 60 * 60;   // admin login 2 ghante chalta hai
const MAX_FAILS = 5;
const LOCK_SEC = 10 * 60;

function doGet() {
  return json_({ ok: true, service: 'Jewellery by Riddhi orders & live stock', stock: readStockMap_() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'newOrder':          return json_(addOrder_(body.order));
      case 'getStock':          return json_({ ok: true, stock: readStockMap_() });
      case 'syncCatalog':       return json_(syncCatalog_(body.products));
      case 'setStock':          return json_(setStock_(body.token, body.productId, body.stock, body.productName, body.image));
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

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(9, 280);
    for (let c = 12; c <= 14; c++) sh.setColumnWidth(c, 110);
    statusValidation_(sh);
  } else if (sh.getLastColumn() < HEADERS.length) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    statusValidation_(sh);
  }
  return sh;
}

// ---------- LIVE GLOBAL STOCK SHEET ("Stock" tab) ----------
// Columns: Date | Product ID | Product Name | Image | Available Stock | Last Updated
function stockSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(STOCK_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(STOCK_SHEET_NAME);
    sh.appendRow(STOCK_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, STOCK_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
    sh.setColumnWidth(1, 150);
    sh.setColumnWidth(2, 110);
    sh.setColumnWidth(3, 240);
    sh.setColumnWidth(4, 110);
    sh.setColumnWidth(5, 130);
    sh.setColumnWidth(6, 170);
  } else {
    const firstHeader = String(sh.getRange(1, 1).getValue() || '').trim();
    if (firstHeader !== 'Date' || sh.getLastColumn() < STOCK_HEADERS.length) {
      // Agar purane 4 columns (Product ID, Product Name, Available Stock, Last Updated) hain toh unhe migrate karein
      const last = sh.getLastRow();
      const oldData = last >= 2 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
      sh.clear();
      sh.appendRow(STOCK_HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, STOCK_HEADERS.length).setFontWeight('bold').setBackground('#15321e').setFontColor('#ffffff');
      sh.setColumnWidth(1, 150);
      sh.setColumnWidth(2, 110);
      sh.setColumnWidth(3, 240);
      sh.setColumnWidth(4, 110);
      sh.setColumnWidth(5, 130);
      sh.setColumnWidth(6, 170);
      const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd MMM yyyy');
      oldData.forEach(function (r) {
        if (r[0]) {
          sh.appendRow([todayStr, r[0], r[1] || '', '', Math.max(0, parseInt(r[2], 10) || 0), r[3] || new Date()]);
        }
      });
    }
  }
  return sh;
}

function readStockMap_() {
  const sh = stockSheet_();
  const last = sh.getLastRow();
  const map = {};
  if (last < 2) return map;
  const rows = sh.getRange(2, 1, last - 1, 6).getValues();
  rows.forEach(function (r) {
    const pid = String(r[1] || '').trim();
    if (pid) {
      map[pid] = Math.max(0, parseInt(r[4], 10) || 0);
    }
  });
  return map;
}

function upsertStockRow_(sh, productId, productName, newStock, imageUrl, onlyIfMissing) {
  const pid = safe_(productId, 30);
  const pname = safe_(productName || '', 120);
  const qty = Math.max(0, parseInt(newStock, 10) || 0);
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
        if (onlyIfMissing) {
          if (pname) sh.getRange(rowNum, 3).setValue(pname);
          if (imgFormula) {
            sh.getRange(rowNum, 4).setFormula(imgFormula);
            sh.setRowHeight(rowNum, 90);
          }
          return Math.max(0, parseInt(sh.getRange(rowNum, 5).getValue(), 10) || 0);
        }
        if (pname) sh.getRange(rowNum, 3).setValue(pname);
        if (imgFormula) {
          sh.getRange(rowNum, 4).setFormula(imgFormula);
          sh.setRowHeight(rowNum, 90);
        }
        sh.getRange(rowNum, 5, 1, 2).setValues([[qty, now]]);
        return qty;
      }
    }
  }

  sh.appendRow([dateStr, pid, pname, '', qty, now]);
  const newRowNum = sh.getLastRow();
  if (imgFormula) {
    sh.getRange(newRowNum, 4).setFormula(imgFormula);
    sh.setRowHeight(newRowNum, 90);
  }
  return qty;
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
      upsertStockRow_(sh, p.id, p.name || '', p.availableStock, p.image || '', true);
    });
    return { ok: true, stock: readStockMap_() };
  } finally {
    lock.releaseLock();
  }
}

function setStock_(token, productId, stock, productName, imageUrl) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  const pid = safe_(productId, 30);
  if (!pid) return { ok: false, error: 'bad_product' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = stockSheet_();
    upsertStockRow_(sh, pid, productName, stock, imageUrl, false);
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
    const baseStock = Object.prototype.hasOwnProperty.call(currentMap, pid)
      ? currentMap[pid]
      : Math.max(0, parseInt(it.currentStock, 10) || 0);
    const updated = Math.max(0, baseStock - (Math.max(1, parseInt(it.qty, 10) || 1)));
    currentMap[pid] = updated;
    upsertStockRow_(sh, pid, it.name, updated, it.image, false);
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
      id: safe_(i.id, 20), name: safe_(i.name, 120), size: safe_(i.size, 60),
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
    const itemsText = items.map(function (i) {
      return i.name + ' (' + i.id + ') x' + i.qty + ' [' + i.size + ']' + (i.note ? ' note: ' + i.note : '');
    }).join('\n');

    const imgs = items.map(function (i) { return i.image; }).filter(Boolean);
    const imgCells = [];
    for (let k = 0; k < MAX_IMG_COLS; k++) {
      imgCells.push(imgs[k] ? '=IMAGE("' + imgs[k] + '")' : '');
    }

    const cleanItemsForJson = items.map(function (i) {
      return { id: i.id, name: i.name, size: i.size, qty: i.qty, price: i.price, note: i.note, image: i.image };
    });

    sh.appendRow([
      new Date(Number(o.timestamp) || Date.now()), orderId, safe_(o.date, 40),
      safe_(c.name, 100), "'" + mobile, safe_(c.address, 300), safe_(c.city, 80), "'" + pin,
      itemsText, total, JSON.stringify(cleanItemsForJson)
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
    const st = r[15];
    const upd = r[16] instanceof Date ? r[16].getTime() : 0;
    if (st === 'Shipped' && upd > 0 && upd <= cutoff) {
      r[15] = 'Delivered';
      r[16] = now;
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
        status: STATUSES.indexOf(r[15]) >= 0 ? r[15] : 'Pending',
        updated: r[16] instanceof Date ? r[16].getTime() : 0,
        cancelReason: String(r[17] || '')
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
    try { items = JSON.parse(r[10] || '[]'); } catch (e) {}
    const ts = r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0;
    return {
      orderId: r[1], timestamp: ts, date: String(r[2]), total: Number(r[9]) || 0,
      customer: { name: r[3], mobile: String(r[4]).replace(/^'/, ''), address: r[5], city: r[6],
                  pincode: String(r[7]).replace(/^'/, '') },
      items: items,
      status: STATUSES.indexOf(r[15]) >= 0 ? r[15] : 'Pending',
      statusUpdated: r[16] instanceof Date ? r[16].getTime() : 0,
      cancelReason: String(r[17] || '')
    };
  }).reverse();
}

function setup() {
  sheet_();
  stockSheet_();
}
