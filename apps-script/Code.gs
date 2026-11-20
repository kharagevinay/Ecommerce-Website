/**
 * Jewellery by Riddhi - Google Sheet order backend (Google Apps Script)
 *
 * Kaam:
 *  1) Website se aaya har order Google Sheet me ek row ban jata hai (saare devices ka data ek jagah).
 *  2) Admin ka username/password yahin (server par) check hota hai - website ki JS file me nahi.
 *  3) Sirf sahi login ke baad hi orders website ke admin panel me aate hain.
 */

// ====== SIRF YE 2 LINES BADLEIN ======
const ADMIN_USERNAME = 'riddhi@admin';
const ADMIN_PASSWORD = 'Admin@2026';   // <-- deploy karne se pehle zaroor badal dein
// =====================================

const SHEET_NAME = 'Orders';
const HEADERS = ['Timestamp', 'Order ID', 'Date', 'Name', 'Mobile', 'Address', 'City', 'Pincode',
                 'Items', 'Total (INR)', 'Items JSON', 'Image 1', 'Image 2', 'Image 3', 'Image Links', 'Status', 'Status Updated'];
const READ_COLS = 17;                // Status Updated tak (purani sheets ke saath bhi chalta hai)
const STATUS_COL = 16;               // Sheet ka "Status" column (P)
const STATUSES = ['Pending', 'Confirmed', 'Custom Making', 'Partial Stock Ready', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const MAX_IMG_COLS = 3;
const TOKEN_TTL_SEC = 6 * 60 * 60;   // admin login 6 ghante chalta hai (Google cache ki max limit)
const MAX_FAILS = 5;                 // itni galat koshish ke baad lock
const LOCK_SEC = 10 * 60;            // 10 minute lock

function doGet() {
  return json_({ ok: true, service: 'Jewellery by Riddhi orders' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'newOrder':    return json_(addOrder_(body.order));
      case 'adminLogin':  return json_(adminLogin_(body.username, body.password));
      case 'getOrders':   return json_(getOrders_(body.token));
      case 'adminLogout': return json_(adminLogout_(body.token));
      case 'updateStatus': return json_(updateStatus_(body.token, body.orderId, body.status));
      case 'orderStatus': return json_(orderStatus_(body.orders));
      default:            return json_({ ok: false, error: 'bad_request' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  }
}

// ---------- helpers ----------
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Status column me dropdown (Sheet me seedha bhi status badal sakte hain)
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
    // purani sheet: nayi columns ke headers jod do
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    statusValidation_(sh);
  }
  return sh;
}

// Sheet me likhte waqt "=SUM(...)" jaisa text formula na ban jaye
function safe_(v, max) {
  let t = String(v == null ? '' : v).replace(/\r/g, '').slice(0, max || 300);
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return t;
}

// Sirf https image link, quotes/spaces ke bina (formula me safe rahe)
function imgUrl_(u) {
  u = String(u || '');
  return /^https:\/\/[^\s"'<>]{1,480}$/.test(u) ? u : '';
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
  if (!c.name || mobile.length < 10 || mobile.length > 13 || pin.length !== 6 || !c.address || !c.city) {
    return { ok: false, error: 'invalid_customer' };
  }

  const items = o.items.map(function (i) {
    return {
      id: safe_(i.id, 20), name: safe_(i.name, 120), size: safe_(i.size, 60),
      qty: Math.max(1, Math.min(500, Number(i.qty) || 1)),
      price: Math.max(0, Math.min(1000000, Number(i.price) || 0)),
      note: safe_(i.note, 300),
      image: imgUrl_(i.image)
    };
  });
  // total hum khud nikalte hain, website ke bheje total par bharosa nahi
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
        if (ids[r][0] === orderId) return { ok: true, duplicate: true };   // retry se double entry nahi
      }
    }
    const itemsText = items.map(function (i) {
      return i.name + ' (' + i.id + ') x' + i.qty + ' [' + i.size + ']' + (i.note ? ' note: ' + i.note : '');
    }).join('\n');

    const imgs = items.map(function (i) { return i.image; }).filter(Boolean);
    const imgCells = [];
    for (let k = 0; k < MAX_IMG_COLS; k++) {
      imgCells.push(imgs[k] ? '=IMAGE("' + imgs[k] + '")' : '');   // Sheet me asli photo dikhti hai
    }

    sh.appendRow([
      new Date(Number(o.timestamp) || Date.now()), orderId, safe_(o.date, 40),
      safe_(c.name, 100), "'" + mobile, safe_(c.address, 300), safe_(c.city, 80), "'" + pin,
      itemsText, total, JSON.stringify(items)
    ].concat(imgCells, [imgs.join('\n'), 'Pending', new Date()]));
    if (imgs.length) sh.setRowHeight(sh.getLastRow(), 100);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
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
  return { ok: true, token: token, orders: readOrders_() };
}

function validToken_(token) {
  return !!token && CacheService.getScriptCache().get('tok_' + token) === '1';
}

function getOrders_(token) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  return { ok: true, orders: readOrders_() };
}

function adminLogout_(token) {
  if (token) CacheService.getScriptCache().remove('tok_' + token);
  return { ok: true };
}

// Admin: order ka status badalna
function updateStatus_(token, orderId, status) {
  if (!validToken_(token)) return { ok: false, error: 'auth' };
  if (STATUSES.indexOf(status) < 0) return { ok: false, error: 'bad_status' };
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
        sh.getRange(i + 2, STATUS_COL, 1, 2).setValues([[status, now]]);
        return { ok: true, status: status, statusUpdated: now.getTime() };
      }
    }
    return { ok: false, error: 'not_found' };
  } finally {
    lock.releaseLock();
  }
}

// Customer: apne orders ka status (orderId + mobile dono match hone chahiye, koi personal data wapas nahi jata)
function orderStatus_(list) {
  if (!Array.isArray(list)) return { ok: false, error: 'bad_request' };
  const sh = sheet_();
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return { ok: true, statuses: out };
  const rows = sh.getRange(2, 1, last - 1, Math.min(READ_COLS, sh.getLastColumn())).getValues();
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
        updated: r[16] instanceof Date ? r[16].getTime() : 0
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
      statusUpdated: r[16] instanceof Date ? r[16].getTime() : 0
    };
  }).reverse();   // naya order sabse upar
}

/**
 * Optional: Apps Script editor me ye function ek baar chalakar permissions de dein (Run > setup).
 */
function setup() {
  sheet_();
}
