// ==========================================
// ADMIN & GOOGLE SHEET SETTINGS  (sirf yahin badalna hai)
// ==========================================
// 1) Google Apps Script "Web app" URL yahan paste karein (apps-script/Code.gs deploy karne ke baad).
//    Jab tak ye khaali hai, orders sirf is device ke localStorage me save honge.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwY9F1GySF3Op2mAGkw2sxqqW1Xdf0lwEroUxpEGfL5YJuiENnGgRQSkS2UVrEhhYx5/exec";

// 2) Admin login (sirf tab use hota hai jab APPS_SCRIPT_URL khaali ho -- local testing mode).
//    URL set hone par username/password Google Apps Script (Code.gs) me check hota hai, is file me nahi.
//    Local mode ka hash banane ke liye browser console me chalayein:  makeAdminHash("username","password")
const ADMIN_USERNAME = "riddhi_admin";
const ADMIN_LOCAL_HASH = "2dcf8808c2c4f7c31879ae82c690838fb1ea44a0629e93366dbdb3e94eccb226";

const WHATSAPP_NUMBER = "918412981213";
const BRAND_PHONE_DISPLAY = "+91 84129 81213";
const INSTAGRAM_HANDLE = "@jewellery_by_riddhi";
const INSTAGRAM_URL = "https://www.instagram.com/jewellery_by_riddhi/";

const INDIAN_CITIES = [
  "Pune", "Pimpri-Chinchwad", "Mumbai", "Thane", "Navi Mumbai", "Nashik", "Nagpur",
  "Chhatrapati Sambhajinagar (Aurangabad)", "Solapur", "Kolhapur", "Sangli", "Satara",
  "Ahmednagar", "Jalgaon", "Akola", "Amravati", "Latur", "Dhule", "Nanded", "Ratnagiri",
  "Sindhudurg", "Alibag", "Lonavala", "Baramati", "Karad", "Ichalkaranji", "Panvel",
  "Kalyan-Dombivli", "Vasai-Virar", "Delhi", "New Delhi", "Bengaluru", "Hyderabad",
  "Chennai", "Kolkata", "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Jaipur", "Udaipur",
  "Jodhpur", "Indore", "Bhopal", "Gwalior", "Jabalpur", "Lucknow", "Kanpur", "Varanasi",
  "Agra", "Prayagraj", "Noida", "Ghaziabad", "Gurugram", "Faridabad", "Chandigarh",
  "Ludhiana", "Amritsar", "Dehradun", "Haridwar", "Patna", "Ranchi", "Bhubaneswar",
  "Cuttack", "Raipur", "Goa (Panaji)", "Margao", "Kochi", "Thiruvananthapuram",
  "Kozhikode", "Coimbatore", "Madurai", "Visakhapatnam", "Vijayawada", "Mysuru", "Hubballi",
  "Belagavi"
];


const CATEGORIES = [];

const SAMPLE_VIDEO = "https://assets.mixkit.co/videos/preview/mixkit-woman-wearing-gold-jewelry-close-up-41163-large.mp4";


const PRODUCTS = [];


// Ensure every product has per-size stock mapping (sizes & sizeStock)
PRODUCTS.forEach(p => {
  if (!Array.isArray(p.sizes) || p.sizes.length === 0) {
    p.sizes = ["Free Size (Adjustable Dori)"];
  }
  if (!p.sizeStock || typeof p.sizeStock !== "object") {
    p.sizeStock = {};
    p.sizes.forEach((sz, i) => {
      p.sizeStock[sz] = i === 0 ? (Math.max(0, parseInt(p.availableStock, 10) || 0)) : 0;
    });
  }
  p.availableStock = Object.values(p.sizeStock).reduce((sum, v) => sum + (Math.max(0, parseInt(v, 10) || 0)), 0);
});
