// Major Indian cities with coordinates + timezone, for the birth-place picker.
// Kundli math needs latitude/longitude/timezone; bundling them keeps the form
// working offline with no geocoding API. Add geocoding for arbitrary places later.
//
// All Indian cities share the Asia/Kolkata timezone (IST, UTC+5:30).

export interface City {
  name: string;
  state: string;
  lat: number;
  lon: number;
  tz: string;
}

export const CITIES: City[] = [
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' },
  { name: 'Delhi', state: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lon: 77.5946, tz: 'Asia/Kolkata' },
  { name: 'Hyderabad', state: 'Telangana', lat: 17.385, lon: 78.4867, tz: 'Asia/Kolkata' },
  { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lon: 72.5714, tz: 'Asia/Kolkata' },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707, tz: 'Asia/Kolkata' },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639, tz: 'Asia/Kolkata' },
  { name: 'Surat', state: 'Gujarat', lat: 21.1702, lon: 72.8311, tz: 'Asia/Kolkata' },
  { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lon: 73.8567, tz: 'Asia/Kolkata' },
  { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873, tz: 'Asia/Kolkata' },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462, tz: 'Asia/Kolkata' },
  { name: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lon: 80.3319, tz: 'Asia/Kolkata' },
  { name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lon: 79.0882, tz: 'Asia/Kolkata' },
  { name: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lon: 75.8577, tz: 'Asia/Kolkata' },
  { name: 'Thane', state: 'Maharashtra', lat: 19.2183, lon: 72.9781, tz: 'Asia/Kolkata' },
  { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lon: 77.4126, tz: 'Asia/Kolkata' },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lon: 83.2185, tz: 'Asia/Kolkata' },
  { name: 'Patna', state: 'Bihar', lat: 25.5941, lon: 85.1376, tz: 'Asia/Kolkata' },
  { name: 'Vadodara', state: 'Gujarat', lat: 22.3072, lon: 73.1812, tz: 'Asia/Kolkata' },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lon: 77.4538, tz: 'Asia/Kolkata' },
  { name: 'Ludhiana', state: 'Punjab', lat: 30.901, lon: 75.8573, tz: 'Asia/Kolkata' },
  { name: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lon: 78.0081, tz: 'Asia/Kolkata' },
  { name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lon: 73.7898, tz: 'Asia/Kolkata' },
  { name: 'Faridabad', state: 'Haryana', lat: 28.4089, lon: 77.3178, tz: 'Asia/Kolkata' },
  { name: 'Meerut', state: 'Uttar Pradesh', lat: 28.9845, lon: 77.7064, tz: 'Asia/Kolkata' },
  { name: 'Rajkot', state: 'Gujarat', lat: 22.3039, lon: 70.8022, tz: 'Asia/Kolkata' },
  { name: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lon: 82.9739, tz: 'Asia/Kolkata' },
  { name: 'Srinagar', state: 'Jammu & Kashmir', lat: 34.0837, lon: 74.7973, tz: 'Asia/Kolkata' },
  { name: 'Amritsar', state: 'Punjab', lat: 31.634, lon: 74.8723, tz: 'Asia/Kolkata' },
  { name: 'Allahabad (Prayagraj)', state: 'Uttar Pradesh', lat: 25.4358, lon: 81.8463, tz: 'Asia/Kolkata' },
  { name: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lon: 85.3096, tz: 'Asia/Kolkata' },
  { name: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lon: 76.9558, tz: 'Asia/Kolkata' },
  { name: 'Jabalpur', state: 'Madhya Pradesh', lat: 23.1815, lon: 79.9864, tz: 'Asia/Kolkata' },
  { name: 'Gwalior', state: 'Madhya Pradesh', lat: 26.2183, lon: 78.1828, tz: 'Asia/Kolkata' },
  { name: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lon: 80.648, tz: 'Asia/Kolkata' },
  { name: 'Jodhpur', state: 'Rajasthan', lat: 26.2389, lon: 73.0243, tz: 'Asia/Kolkata' },
  { name: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lon: 78.1198, tz: 'Asia/Kolkata' },
  { name: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lon: 81.6296, tz: 'Asia/Kolkata' },
  { name: 'Kochi', state: 'Kerala', lat: 9.9312, lon: 76.2673, tz: 'Asia/Kolkata' },
  { name: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lon: 76.7794, tz: 'Asia/Kolkata' },
  { name: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lon: 76.9366, tz: 'Asia/Kolkata' },
  { name: 'Guwahati', state: 'Assam', lat: 26.1445, lon: 91.7362, tz: 'Asia/Kolkata' },
  { name: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lon: 78.0322, tz: 'Asia/Kolkata' },
  { name: 'Mysuru', state: 'Karnataka', lat: 12.2958, lon: 76.6394, tz: 'Asia/Kolkata' },
  { name: 'Jalandhar', state: 'Punjab', lat: 31.326, lon: 75.5762, tz: 'Asia/Kolkata' },
  { name: 'Tiruchirappalli', state: 'Tamil Nadu', lat: 10.7905, lon: 78.7047, tz: 'Asia/Kolkata' },
  { name: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lon: 85.8245, tz: 'Asia/Kolkata' },
  { name: 'Salem', state: 'Tamil Nadu', lat: 11.6643, lon: 78.146, tz: 'Asia/Kolkata' },
  { name: 'Guntur', state: 'Andhra Pradesh', lat: 16.3067, lon: 80.4365, tz: 'Asia/Kolkata' },
  { name: 'Aurangabad', state: 'Maharashtra', lat: 19.8762, lon: 75.3433, tz: 'Asia/Kolkata' },
  { name: 'Jamshedpur', state: 'Jharkhand', lat: 22.8046, lon: 86.2029, tz: 'Asia/Kolkata' },
  { name: 'Amravati', state: 'Maharashtra', lat: 20.9374, lon: 77.7796, tz: 'Asia/Kolkata' },
  { name: 'Warangal', state: 'Telangana', lat: 17.9689, lon: 79.5941, tz: 'Asia/Kolkata' },
  { name: 'Bhiwandi', state: 'Maharashtra', lat: 19.2813, lon: 73.0483, tz: 'Asia/Kolkata' },
  { name: 'Nanded', state: 'Maharashtra', lat: 19.1383, lon: 77.321, tz: 'Asia/Kolkata' },
  { name: 'Kolhapur', state: 'Maharashtra', lat: 16.705, lon: 74.2433, tz: 'Asia/Kolkata' },
  { name: 'Ajmer', state: 'Rajasthan', lat: 26.4499, lon: 74.6399, tz: 'Asia/Kolkata' },
  { name: 'Gulbarga', state: 'Karnataka', lat: 17.3297, lon: 76.8343, tz: 'Asia/Kolkata' },
  { name: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lon: 73.7125, tz: 'Asia/Kolkata' },
  { name: 'Mangaluru', state: 'Karnataka', lat: 12.9141, lon: 74.856, tz: 'Asia/Kolkata' },
  { name: 'Siliguri', state: 'West Bengal', lat: 26.7271, lon: 88.3953, tz: 'Asia/Kolkata' },
  { name: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lon: 77.391, tz: 'Asia/Kolkata' },
  { name: 'Gurugram', state: 'Haryana', lat: 28.4595, lon: 77.0266, tz: 'Asia/Kolkata' },
  { name: 'Shimla', state: 'Himachal Pradesh', lat: 31.1048, lon: 77.1734, tz: 'Asia/Kolkata' },
  { name: 'Panaji', state: 'Goa', lat: 15.4909, lon: 73.8278, tz: 'Asia/Kolkata' },
];
