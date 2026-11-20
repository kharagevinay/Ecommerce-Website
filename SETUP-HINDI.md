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

## E. Naye features (is update me add hue)
- **Prices:** `js/extras.js` ke `ACTUAL_PRICES` me har product ka asli/MRP price hai, aur `js/data.js` ka `price` offer price hai (data.js ab bilkul original hai). Discount % khud banta hai. Maine MRP andaaze se daale hain -- apne asli rate se badal lein.
- **Offers ribbon/cards:** ribbon ka text `data.js` ke `FESTIVE_OFFERS` me hai. Offer cards products ke data se khud bante hain.
- **Add to Cart:** sirf cart me jodta hai, order place nahi karta. Details tabhi maangi jaati hain jab "Order Now" / "Order All" dabaaya jaye. Phir order review popup aata hai (Edit Details / Yes, Confirm & Send / No, Cancel).
- **Cart se hatana:** trash icon ya quantity 0 karne par "Do you want to remove this product from cart? Yes / No" poochta hai.
- **Live stock:** order confirm hote hi stock kam hota hai, 0 hone par "Available Soon" + Call/WhatsApp Enquiry dikhta hai.
  - Ye stock **customer ke apne browser (localStorage)** me ghatta hai. Alag phone/browser par stock alag dikhega. Asli stock `data.js` ke `availableStock` se hi chalta hai -- use hamesha wahi update karein.
  - Admin panel me **Reset Stock** button is device ka stock wapas original kar deta hai (testing ke baad use karein).
- **Custom order:** 3-4+ pieces ke liye admin order status me **Custom Making** ya **Partial Stock Ready** chun sakta hai; customer ko My Orders me dikhega.
  - Iske liye `apps-script/Code.gs` dobara paste karke **Deploy -> Manage deployments -> Edit -> New version -> Deploy** karein (nahi to Sheet in 2 status ko reject karegi).
- **My Orders filters:** All Orders, Not Yet Shipped, Last 30 Days, Last 3 Months, Year-wise.

## F. Admin login / logout
- Login ke baad sidebar menu me **All Orders (Admin)**, **Customers & Orders (Admin)** aur **Admin Logout** button dikhte hain.
- Admin login ab browser band karne par bhi bana rehta hai; **Admin Logout** dabane par hi logout hota hai.
- Google Sheet mode me server ka login token 6 ghante chalta hai (Google ki limit). Uske baad ek baar dobara login karna padega. Isse badalne ke liye `Code.gs` naya deploy karein (New version).
