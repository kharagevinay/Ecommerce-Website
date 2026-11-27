# Admin Login + Google Sheet Setup (Jewellery by Riddhi)

## Default Admin login (PEHLE BADAL LEIN)
- Username: `riddhi_admin`
- Password: `Riddhi@Admin2026`

## A. Google Sheet + Apps Script (saare devices ka data ek jagah)
1. Google Drive me nayi **Google Sheet** banayein (naam: "Riddhi Orders").
2. Menu: **Extensions → Apps Script**.
3. Purana code hata kar `apps-script/Code.gs` ka poora code paste karein.
4. Upar ki 2 lines me apna **ADMIN_USERNAME** aur **ADMIN_PASSWORD** likhein. Save (Ctrl+S).
5. **Deploy → New deployment → type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy dabayein, permissions Allow karein.
6. Jo **Web app URL** mile (…/exec), use copy karein.
7. `js/data.js` kholein, upar `const APPS_SCRIPT_URL = "";` me URL paste karein:
   `const APPS_SCRIPT_URL = "https://script.google.com/macros/s/XXXX/exec";`
8. Website files hosting par dobara upload karein.

Ab har order (kisi bhi phone se) Sheet ke **Orders** tab me row ban kar aayega, saath me ordered product ki photo (Image 1-3 columns) aur saare image links (Image Links column).

> Pehle se bani Sheet ho to Code.gs naya paste karke **New version** deploy karein; nayi columns khud jud jayengi.

> Code.gs me baad me kuch badlein to: Deploy → **Manage deployments → Edit → New version → Deploy**.

## B. Admin kaise use karein
- Customers ko Admin link kahin nahi dikhta. Admin 2 tareeko se login khol sakta hai:
  1. Site ka link `.../index.html#admin` kholein, ya
  2. Top-left logo/naam par jaldi-jaldi **5 baar tap** karein.
- Phir username/password dalein.
- Login ke baad customers + orders dikhte hain: search, Refresh, CSV download, WhatsApp chat button, Logout.
- Bina login ke koi customer data nahi dikhta.
- 5 galat koshish ke baad kuch der ke liye lock ho jata hai. Login 2 ghante tak chalta hai.

## C. Bina Google Sheet (sirf testing)
`APPS_SCRIPT_URL` khaali ho to admin panel sirf usi device ka data dikhata hai aur login `data.js` ke
`ADMIN_USERNAME` / `ADMIN_LOCAL_HASH` se check hota hai. Ye sirf testing ke liye hai; asli security
Google Sheet mode me hoti hai. Naya local password banane ke liye browser console me chalayein:
`makeAdminHash("username","password")` aur result `ADMIN_LOCAL_HASH` me daalein.

## D. Order Status (Pending / Confirmed / Packed / Shipped / Delivered / Cancelled)
- Admin login ke baad **All Orders** ya **Customers & Orders** me har order par status dropdown hota hai. Badalte hi Sheet ke **Status** column me save ho jata hai.
- "Customer ko batayein" button se customer ko WhatsApp par status bhej sakte hain.
- Sheet me seedha **Status** column ka dropdown badalne se bhi status update hota hai.
- Customer ko **My Orders** me status badge + progress tracker dikhta hai. Wo "Refresh Order Status" dabane par ya My Orders kholne par update hota hai.
- Isko chalane ke liye naya `Code.gs` paste karke **Deploy -> Manage deployments -> Edit -> New version -> Deploy** karein.


## E. Live GitHub Website se Direct `assets/Categories/` Folder & Files Create Karna (GitHub API)
1. GitHub par login karke **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** kholein.
2. Token ka naam dein (e.g. `Riddhi-Store-Sync`), **Repository access** me **Only select repositories** chunein aur apna `jewellery_by_riddhi_site` repo select karein.
3. **Permissions → Repository permissions → Contents** ko **Read and write** par set karke **Generate token** dabayein aur token copy karein.
4. Live website ke Admin Panel (`admin-products.html` ya `admin-categories.html`) me upar **Connect GitHub Repo** button par click karein:
   - **GitHub Username / Owner**, **Repository Name**, **Branch** (`main`), aur **Token** daal kar **Verify & Save** dabayein.
5. Ab jab bhi aap live site se Category ya Product Add/Edit/Delete karenge, aapke GitHub repo ke `assets/Categories/<Category>/<ProductID>/` folder me images/videos aur `js/data.js` automatically commit ho jayenge!
