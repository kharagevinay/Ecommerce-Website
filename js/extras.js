// ==========================================
// EXTRAS (naye features ki settings) - data.js ko chhue bina
//  * ACTUAL_PRICES : product id -> asli (MRP) price. Offer price data.js ke "price" me hi rehta hai.
//    (Agar data.js me kisi product me "actualPrice" likha ho to wahi use hota hai.)
//  * FESTIVE_OFFERS, INDIAN_CITIES
// ==========================================
const ACTUAL_PRICES = { "CHK-01": 899, "CHK-02": 1099, "NCK-01": 999, "MNG-01": 799, "CMB-01": 2199, "NTH-01": 549, "EAR-01": 449, "BUG-01": 399, "SGR-01": 699, "BBY-01": 799, "RKH-01": 299, "ARM-01": 899, "INV-01": 599, "MND-01": 999, "BNG-01": 699, "RNG-01": 349 };
if (typeof PRODUCTS !== "undefined") {
  PRODUCTS.forEach(p => { if (!p.actualPrice && ACTUAL_PRICES[p.id]) p.actualPrice = ACTUAL_PRICES[p.id]; });
}

// ==========================================
// FESTIVE OFFER TEXTS  (home page ribbon + offer cards) - yahan se badlein
// {maxOff} = sabse zyada discount % (products se khud nikalta hai)
// ==========================================
const FESTIVE_OFFERS = [
  "✨ FESTIVE OFFER: Up to {maxOff}% OFF on handmade jewellery",
  "🔥 Limited pieces only - grab yours before they're gone",
  "💍 Special offer price on Combo Sets & Bridal pieces",
  "📲 Order easily on WhatsApp - we confirm every order personally"
];

// ==========================================
// INDIAN CITIES (city autocomplete suggestions)
// ==========================================
const INDIAN_CITIES = [
  "Pune","Mumbai","Thane","Navi Mumbai","Nashik","Nagpur","Aurangabad","Chhatrapati Sambhajinagar","Kolhapur","Solapur","Satara","Sangli","Ahmednagar","Latur","Jalgaon","Amravati","Akola","Nanded","Dhule","Ratnagiri","Panvel","Kalyan","Dombivli","Vasai","Virar","Bhiwandi","Pimpri-Chinchwad","Baramati","Karad","Ichalkaranji","Malegaon","Chandrapur","Parbhani","Beed","Wardha","Yavatmal","Osmanabad","Ulhasnagar","Mira Bhayandar","Lonavala","Alibag",
  "Delhi","New Delhi","Gurgaon","Noida","Ghaziabad","Faridabad","Greater Noida","Chandigarh","Mohali","Panchkula","Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Shimla","Dehradun","Haridwar","Rishikesh","Haldwani","Jammu","Srinagar","Leh",
  "Jaipur","Jodhpur","Udaipur","Kota","Ajmer","Bikaner","Alwar","Bhilwara","Sikar","Pali",
  "Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Gandhinagar","Junagadh","Anand","Nadiad","Bharuch","Navsari","Vapi","Morbi","Mehsana","Bhuj",
  "Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Dewas","Satna","Ratlam","Rewa",
  "Lucknow","Kanpur","Varanasi","Agra","Prayagraj","Meerut","Bareilly","Aligarh","Moradabad","Gorakhpur","Saharanpur","Mathura","Jhansi","Firozabad","Ayodhya",
  "Patna","Gaya","Bhagalpur","Muzaffarpur","Darbhanga","Purnia","Ranchi","Jamshedpur","Dhanbad","Bokaro","Raipur","Bilaspur","Bhilai","Durg","Korba",
  "Kolkata","Howrah","Durgapur","Asansol","Siliguri","Kharagpur","Bhubaneswar","Cuttack","Rourkela","Puri","Sambalpur","Guwahati","Dibrugarh","Silchar","Jorhat","Shillong","Imphal","Agartala","Aizawl","Kohima","Itanagar","Gangtok",
  "Hyderabad","Secunderabad","Warangal","Nizamabad","Karimnagar","Khammam","Vijayawada","Visakhapatnam","Guntur","Tirupati","Nellore","Kurnool","Rajahmundry","Kakinada","Anantapur",
  "Bengaluru","Mysuru","Mangaluru","Hubballi","Dharwad","Belagavi","Kalaburagi","Ballari","Davanagere","Shivamogga","Udupi","Tumakuru",
  "Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Erode","Vellore","Thoothukudi","Tiruppur","Thanjavur","Hosur","Kanyakumari","Puducherry",
  "Kochi","Thiruvananthapuram","Kozhikode","Thrissur","Kollam","Kannur","Alappuzha","Palakkad","Kottayam","Malappuram",
  "Panaji","Margao","Vasco da Gama","Mapusa","Silvassa","Daman","Diu"
];

// Website ka asli https link (WhatsApp message me logo ka link isi se banta hai). Khaali chhodne par current page ka link use hota hai.
// Example: const SITE_BASE_URL = "https://www.jewelleryByriddhi.com";
const SITE_BASE_URL = "";
