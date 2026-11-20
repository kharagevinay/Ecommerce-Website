// ==========================================
// ADMIN & GOOGLE SHEET SETTINGS  (sirf yahin badalna hai)
// ==========================================
// 1) Google Apps Script "Web app" URL yahan paste karein (apps-script/Code.gs deploy karne ke baad).
//    Jab tak ye khaali hai, orders sirf is device ke localStorage me save honge.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzTQzoFEuRFtQpkQSc-ZxmATTDpAc7GXJAqvCMHyVdxKZ7YblVT6ctM6C_D10S1WMt1/exec";

// 2) Admin login (sirf tab use hota hai jab APPS_SCRIPT_URL khaali ho -- local testing mode).
//    URL set hone par username/password Google Apps Script (Code.gs) me check hota hai, is file me nahi.
//    Local mode ka hash banane ke liye browser console me chalayein:  makeAdminHash("username","password")
const ADMIN_USERNAME = "riddhi_admin";
const ADMIN_LOCAL_HASH = "2dcf8808c2c4f7c31879ae82c690838fb1ea44a0629e93366dbdb3e94eccb226";

const WHATSAPP_NUMBER = "918412981213";
const BRAND_PHONE_DISPLAY = "+91 84129 81213";
const INSTAGRAM_HANDLE = "@jewellery_by_riddhi";
const INSTAGRAM_URL = "https://www.instagram.com/jewellery_by_riddhi/";

const CATEGORIES = [
  { name: "Choker", image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=500&q=80" },
  { name: "Necklaces", image: "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=500&q=80" },
  { name: "Mangalsutra", image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=500&q=80" },
  { name: "Combo Set", image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=500&q=80" },
  { name: "Nath", image: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=500&q=80" },
  { name: "Earrings", image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=500&q=80" },
  { name: "Bugadi", image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=500&q=80" },
  { name: "Sugar-Ball Jewelry", image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=500&q=80" },
  { name: "Baby Girl Jewellery Set", image: "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=500&q=80" },
  { name: "Rakhi", image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=500&q=80" },
  { name: "Armcuffs", image: "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=500&q=80" },
  { name: "Invisible Necklaces", image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=500&q=80" },
  { name: "Mundavali", image: "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=500&q=80" },
  { name: "Bangles", image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=500&q=80" },
  { name: "Ring", image: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=500&q=80" }
];

const SAMPLE_VIDEO = "https://assets.mixkit.co/videos/preview/mixkit-woman-wearing-gold-jewelry-close-up-41163-large.mp4";

const PRODUCTS = [
  {
    id: "CHK-01",
    category: "Choker",
    name: "Royal Red Floral Handmade Choker",
    price: 499,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handcrafted floral red choker with golden beads and adjustable soft dori."
  },
  {
    id: "CHK-02",
    category: "Choker",
    name: "Emerald Green Pearl Choker Set",
    price: 650,
    availableStock: 1,
    isNewArrival: true,
    images: [
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Emerald green stones paired with white pearls and matching earrings."
  },
  {
    id: "NCK-01",
    category: "Necklaces",
    name: "Leaf Design Green Handmade Necklace",
    price: 599,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Delicate handmade leaf pattern necklace ideal for festive wear."
  },
  {
    id: "MNG-01",
    category: "Mangalsutra",
    name: "Traditional Floral Mangalsutra",
    price: 450,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Classic black beads handmade mangalsutra with festive floral centerpiece."
  },
  {
    id: "CMB-01",
    category: "Combo Set",
    name: "Complete Wedding Jewellery Combo",
    price: 1299,
    availableStock: 1,
    isNewArrival: true,
    images: [
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Includes handcrafted Choker, Necklace, Earrings, and Mangalsutra."
  },
  {
    id: "NTH-01",
    category: "Nath",
    name: "Peshwai Moti Handmade Nath",
    price: 299,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Traditional Maharashtrian pearl nath with comfortable clip fitting."
  },
  {
    id: "EAR-01",
    category: "Earrings",
    name: "Handcrafted Red Festive Studs",
    price: 250,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Lightweight handmade floral earrings for festive & party wear."
  },
  {
    id: "BUG-01",
    category: "Bugadi",
    name: "Traditional Pearl Ear Cuff Bugadi",
    price: 220,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Press-fit traditional Maharashtrian Bugadi pair."
  },
  {
    id: "SGR-01",
    category: "Sugar-Ball Jewelry",
    name: "Haldi Special Sugar-Ball Set",
    price: 399,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Traditional white sugar-ball (Sakhar) jewellery set for festive occasions."
  },
  {
    id: "BBY-01",
    category: "Baby Girl Jewellery Set",
    name: "Little Princess Traditional Set",
    price: 450,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Soft and lightweight handmade necklace & earrings for baby girls."
  },
  {
    id: "RKH-01",
    category: "Rakhi",
    name: "Handmade Kundan & Pearl Rakhi",
    price: 150,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handcrafted festive rakhi made with soft thread and pearl accents."
  },
  {
    id: "ARM-01",
    category: "Armcuffs",
    name: "Traditional Vanki Bajuband Armcuff",
    price: 499,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Adjustable handmade traditional bajuband for festive & bridal attire."
  },
  {
    id: "INV-01",
    category: "Invisible Necklaces",
    name: "Single Stone Invisible Wire Necklace",
    price: 350,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Minimalist transparent wire necklace with delicate pendant."
  },
  {
    id: "MND-01",
    category: "Mundavali",
    name: "Bridal Pearl & Gold Bead Mundavali",
    price: 550,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handmade wedding forehead ornament crafted with pearls and beads."
  },
  {
    id: "BNG-01",
    category: "Bangles",
    name: "Silk Thread & Kundan Bangle Pair",
    price: 399,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1601121141799-c0ea464627f1?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handcrafted silk thread bangles with festive detailing."
  },
  {
    id: "RNG-01",
    category: "Ring",
    name: "Adjustable Floral Statement Ring",
    price: 180,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=700&q=80"
    ],
    video: SAMPLE_VIDEO,
    desc: "Adjustable free-size handmade floral ring."
  }
];
