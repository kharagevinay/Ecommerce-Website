// ==========================================
// ADMIN & GOOGLE SHEET SETTINGS  (sirf yahin badalna hai)
// ==========================================
// 1) Google Apps Script "Web app" URL yahan paste karein (apps-script/Code.gs deploy karne ke baad).
//    Jab tak ye khaali hai, orders sirf is device ke localStorage me save honge.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxkeC1iC84DeFyXHFk8HWmvBt5vMAvuvpEcmlyj2YpB8CM5T7XtLhodvifDhxKQ68tW/exec";

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


const CATEGORIES = [
  { name: "Choker", image: "assets/Categories/Choker-Category.jpeg" },
  { name: "Necklaces", image: "assets/Categories/Necklaces-Category.jpeg" },
  { name: "Mangalsutra", image: "assets/Categories/Mangalsutra-Category.jpeg" },
  { name: "Combo Set", image: "assets/Categories/Combo-Category.png" },
  { name: "Nath", image: "assets/Categories/Nath-Category.jpeg" },
  { name: "Earrings", image: "assets/Categories/Earrings-Category.jpeg" },
  { name: "Bugadi", image: "assets/Categories/Bugadi-Category.jpeg" },
  { name: "Sugar-Ball Jewelry", image: "assets/Categories/Sugar-Ball-Jewellery-Category.png" },
  { name: "Baby Girl Jewellery Set", image: "assets/Categories/Baby-Girl-Jewellery-Set-Category.png" },
  { name: "Rakhi", image: "assets/Categories/Rakhi-Category.jpeg" },
  { name: "Armcuffs", image: "assets/Categories/Armcuff-Category.png" },
  { name: "Invisible Necklaces", image: "assets/Categories/Comming-Soon.png" },
  { name: "Mundavali", image: "assets/Categories/Comming-Soon.png" },
  { name: "Bangles", image: "assets/Categories/Comming-Soon.png" },
  { name: "Ring", image: "assets/Categories/Comming-Soon.png" }
];

const SAMPLE_VIDEO = "https://assets.mixkit.co/videos/preview/mixkit-woman-wearing-gold-jewelry-close-up-41163-large.mp4";


const PRODUCTS = [
  {
    id: "CHK-01",
    category: "Choker",
    name: "Royal Red Floral Handmade Choker",
    price: 499,
    actualPrice: 699,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "assets/Categories/Choker/CHK-01/Choker-1.jpeg",
      "assets/Categories/Choker/CHK-01/Choker-2.jpeg",
      "assets/Categories/Choker/CHK-01/Choker-3.jpeg"
    ],
    mediaType: "video",
    video: "assets/Categories/Choker/CHK-01/Choker-4.mp4",
    desc: "Handcrafted floral red choker with golden beads and adjustable soft dori."
  },
  {
    id: "CHK-02",
    category: "Choker",
    name: "Royal Red Floral Handmade Choker",
    price: 399,
    actualPrice: 599,
    availableStock: 1,
    isNewArrival: true,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handcrafted floral red choker with golden beads and adjustable soft dori."
  },
  {
    id: "NCK-01",
    category: "Necklaces",
    name: "Leaf Design Green Handmade Necklace",
    price: 599,
    actualPrice: 799,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Delicate handmade leaf pattern necklace ideal for festive wear."
  },
  {
    id: "MNG-01",
    category: "Mangalsutra",
    name: "Traditional Floral Mangalsutra",
    price: 450,
    actualPrice: 599,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Classic black beads handmade mangalsutra with festive floral centerpiece."
  },
  {
    id: "CMB-01",
    category: "Combo Set",
    name: "Complete Wedding Jewellery Combo",
    price: 1299,
    actualPrice: 1699,
    availableStock: 1,
    isNewArrival: true,
    images: [
      "assets/Categories/Combo Set/CMB-01/Combo-Set-1.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Includes handcrafted Choker, Necklace, Earrings, and Mangalsutra."
  },
  {
    id: "NTH-01",
    category: "Nath",
    name: "Peshwai Moti Handmade Nath",
    price: 299,
    actualPrice: 399,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Traditional Maharashtrian pearl nath with comfortable clip fitting."
  },
  {
    id: "EAR-01",
    category: "Earrings",
    name: "Handcrafted Red Festive Studs",
    price: 250,
    actualPrice: 349,
    availableStock: 2,
    isNewArrival: false,
 images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Lightweight handmade floral earrings for festive & party wear."
  },
  {
    id: "BUG-01",
    category: "Bugadi",
    name: "Traditional Pearl Ear Cuff Bugadi",
    price: 220,
    actualPrice: 299,
    availableStock: 2,
    isNewArrival: false,
  images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Press-fit traditional Maharashtrian Bugadi pair."
  },
  {
    id: "SGR-01",
    category: "Sugar-Ball Jewelry",
    name: "Haldi Special Sugar-Ball Set",
    price: 399,
    actualPrice: 549,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Traditional white sugar-ball (Sakhar) jewellery set for festive occasions."
  },
  {
    id: "BBY-01",
    category: "Baby Girl Jewellery Set",
    name: "Little Princess Traditional Set",
    price: 450,
    actualPrice: 599,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Soft and lightweight handmade necklace & earrings for baby girls."
  },
  {
    id: "RKH-01",
    category: "Rakhi",
    name: "Handmade Kundan & Pearl Rakhi",
    price: 150,
    actualPrice: 220,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handcrafted festive rakhi made with soft thread and pearl accents."
  },
  {
    id: "ARM-01",
    category: "Armcuffs",
    name: "Traditional Vanki Bajuband Armcuff",
    price: 499,
    actualPrice: 699,
    availableStock: 2,
    isNewArrival: false,
   images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Adjustable handmade traditional bajuband for festive & bridal attire."
  },
  {
    id: "INV-01",
    category: "Invisible Necklaces",
    name: "Single Stone Invisible Wire Necklace",
    price: 350,
    actualPrice: 499,
    availableStock: 2,
    isNewArrival: true,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Minimalist transparent wire necklace with delicate pendant."
  },
  {
    id: "MND-01",
    category: "Mundavali",
    name: "Bridal Pearl & Gold Bead Mundavali",
    price: 550,
    actualPrice: 749,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handmade wedding forehead ornament crafted with pearls and beads."
  },
  {
    id: "BNG-01",
    category: "Bangles",
    name: "Silk Thread & Kundan Bangle Pair",
    price: 399,
    actualPrice: 549,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Handcrafted silk thread bangles with festive detailing."
  },
  {
    id: "RNG-01",
    category: "Ring",
    name: "Adjustable Floral Statement Ring",
    price: 180,
    actualPrice: 249,
    availableStock: 2,
    isNewArrival: false,
    images: [
      "assets/Categories/Comming-Soon.png"
    ],
    video: SAMPLE_VIDEO,
    desc: "Adjustable free-size handmade floral ring."
  }
];
