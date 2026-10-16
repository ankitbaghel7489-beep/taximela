import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';

const cfg = window.TAXIMELA_CONFIG;
const firebaseApp = initializeApp(cfg.firebase);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const functionsAsia = getFunctions(firebaseApp, 'asia-south1');
const functionsUs = getFunctions(firebaseApp, 'us-central1');
const estimateFareFn = httpsCallable(functionsAsia, 'estimateFare');
const createRazorpayOrderFn = httpsCallable(functionsUs, 'createRazorpayOrder');
const verifyRazorpayPaymentFn = httpsCallable(functionsUs, 'verifyRazorpayPayment');
const applyPromoCodeFn = httpsCallable(functionsUs, 'applyPromoCode');
let payState = {couponCode:'',discount:0,docId:null,paid:0};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const money = n => `₹${Math.round(Number(n)||0).toLocaleString('en-IN')}`;
const num = n => Number(n || 0);

const CAB_CATEGORIES = ['Hatchback','Sedan','Ertiga','Innova','Innova Crysta'];
const LOCAL_PACKAGE_RATES = {
  Hatchback:{20:1200,40:1400,80:2000,120:2600},
  Sedan:{20:1500,40:1800,80:2200,120:2800},
  Ertiga:{20:1800,40:2000,80:2500,120:3400},
  Innova:{20:2200,40:2600,80:2600,120:4800}
};
const CITY_COORDS = {
  Indore:[22.7196,75.8577],Bhopal:[23.2599,77.4126],Ujjain:[23.1765,75.7885],Dewas:[22.9676,76.0534],
  Ahmedabad:[23.0225,72.5714],Vadodara:[22.3072,73.1812],Surat:[21.1702,72.8311],Mumbai:[19.076,72.8777],
  Pune:[18.5204,73.8567],Delhi:[28.6139,77.209],Jaipur:[26.9124,75.7873],Kota:[25.2138,75.8648],Agra:[27.1767,78.0081],
  Gwalior:[26.2183,78.1828],Jabalpur:[23.1815,79.9864],Nagpur:[21.1458,79.0882],Nashik:[19.9975,73.7898],Udaipur:[24.5854,73.7125],
  Lucknow:[26.8467,80.9462],Chandigarh:[30.7333,76.7794],Amritsar:[31.634,74.8723],Haridwar:[29.9457,78.1642],
  Dehradun:[30.3165,78.0322],Hyderabad:[17.385,78.4867],Bengaluru:[12.9716,77.5946],Chennai:[13.0827,80.2707],Kolkata:[22.5726,88.3639]
};
const AIRPORTS = [["Delhi – Indira Gandhi International Airport", 28.5562, 77.1, "Delhi"], ["Noida – Noida International Airport (Jewar)", 28.1665, 77.6153, "Noida"], ["Ghaziabad – Hindon Airport", 28.7003, 77.4125, "Ghaziabad"], ["Mumbai – Chhatrapati Shivaji Maharaj International Airport", 19.0896, 72.8656, "Mumbai"], ["Navi Mumbai – Navi Mumbai International Airport", 18.9979, 73.0714, "Navi Mumbai"], ["Pune – Pune Airport", 18.5822, 73.9197, "Pune"], ["Nagpur – Dr. Babasaheb Ambedkar International Airport", 21.0922, 79.0472, "Nagpur"], ["Nashik – Ozar Airport", 20.1191, 73.9129, "Nashik"], ["Aurangabad – Chikalthana Airport", 19.8627, 75.3981, "Aurangabad"], ["Kolhapur – Kolhapur Airport", 16.6647, 74.2894, "Kolhapur"], ["Shirdi – Shirdi Airport", 19.6886, 74.3789, "Shirdi"], ["Nanded – Nanded Airport", 19.1833, 77.3167, "Nanded"], ["Solapur – Solapur Airport", 17.6281, 75.9348, "Solapur"], ["Jalgaon – Jalgaon Airport", 20.9627, 75.6259, "Jalgaon"], ["Sindhudurg – Sindhudurg Airport (Chipi)", 16.001, 73.526, "Sindhudurg"], ["Goa – Goa International Airport (Dabolim)", 15.3808, 73.8314, "Goa"], ["Goa – Manohar International Airport (Mopa)", 15.713, 73.864, "Goa"], ["Bengaluru – Kempegowda International Airport", 13.1986, 77.7066, "Bengaluru"], ["Mysuru – Mysuru Airport", 12.23, 76.6558, "Mysuru"], ["Mangaluru – Mangaluru International Airport", 12.9613, 74.8901, "Mangaluru"], ["Hubballi – Hubballi Airport", 15.3617, 75.0849, "Hubballi"], ["Belagavi – Belagavi Airport", 15.8593, 74.6183, "Belagavi"], ["Kalaburagi – Kalaburagi Airport", 17.3074, 76.9583, "Kalaburagi"], ["Shivamogga – Shivamogga Airport", 13.8578, 75.619, "Shivamogga"], ["Ballari – Vijayanagar Airport (Ballari)", 15.1762, 76.6347, "Ballari"], ["Chennai – Chennai International Airport", 12.9941, 80.1709, "Chennai"], ["Coimbatore – Coimbatore International Airport", 11.03, 77.0434, "Coimbatore"], ["Madurai – Madurai Airport", 9.8345, 78.0934, "Madurai"], ["Tiruchirappalli – Tiruchirappalli International Airport", 10.7654, 78.7097, "Tiruchirappalli"], ["Salem – Salem Airport", 11.7833, 78.0656, "Salem"], ["Thoothukudi – Tuticorin Airport", 8.7243, 78.0258, "Thoothukudi"], ["Puducherry – Puducherry Airport", 11.968, 79.812, "Puducherry"], ["Kochi – Cochin International Airport", 10.152, 76.4019, "Kochi"], ["Thiruvananthapuram – Trivandrum International Airport", 8.4821, 76.9201, "Thiruvananthapuram"], ["Kozhikode – Calicut International Airport", 11.1368, 75.9553, "Kozhikode"], ["Kannur – Kannur International Airport", 11.9186, 75.5472, "Kannur"], ["Hyderabad – Rajiv Gandhi International Airport", 17.2403, 78.4294, "Hyderabad"], ["Vijayawada – Vijayawada Airport", 16.5304, 80.7968, "Vijayawada"], ["Visakhapatnam – Visakhapatnam Airport", 17.7212, 83.2245, "Visakhapatnam"], ["Tirupati – Tirupati Airport", 13.6325, 79.5433, "Tirupati"], ["Rajahmundry – Rajahmundry Airport", 17.1104, 81.8182, "Rajahmundry"], ["Kadapa – Kadapa Airport", 14.51, 78.7728, "Kadapa"], ["Kurnool – Kurnool Airport (Orvakal)", 15.7113, 78.1706, "Kurnool"], ["Kolkata – Netaji Subhas Chandra Bose International Airport", 22.6547, 88.4467, "Kolkata"], ["Bagdogra – Bagdogra Airport", 26.6812, 88.3286, "Bagdogra"], ["Cooch Behar – Cooch Behar Airport", 26.3305, 89.4672, "Cooch Behar"], ["Durgapur – Kazi Nazrul Islam Airport (Andal)", 23.6225, 87.243, "Durgapur"], ["Bhubaneswar – Biju Patnaik International Airport", 20.2444, 85.8178, "Bhubaneswar"], ["Jharsuguda – Veer Surendra Sai Airport", 21.9135, 84.0504, "Jharsuguda"], ["Patna – Jay Prakash Narayan International Airport", 25.5913, 85.088, "Patna"], ["Gaya – Gaya Airport", 24.7443, 84.9512, "Gaya"], ["Darbhanga – Darbhanga Airport", 26.1947, 85.9174, "Darbhanga"], ["Ranchi – Birsa Munda Airport", 23.3143, 85.3217, "Ranchi"], ["Jamshedpur – Sonari Airport", 22.8132, 86.1693, "Jamshedpur"], ["Deoghar – Deoghar Airport", 24.4452, 86.7087, "Deoghar"], ["Raipur – Swami Vivekananda Airport", 21.1804, 81.7388, "Raipur"], ["Bilaspur – Bilaspur Airport (Chakarbhata)", 21.9885, 82.111, "Bilaspur"], ["Jagdalpur – Jagdalpur Airport", 19.0743, 82.0368, "Jagdalpur"], ["Indore – Devi Ahilya Bai Holkar Airport", 22.7225, 75.8011, "Indore"], ["Bhopal – Raja Bhoj Airport", 23.2875, 77.3374, "Bhopal"], ["Jabalpur – Jabalpur Airport (Dumna)", 23.1778, 80.052, "Jabalpur"], ["Gwalior – Rajmata Vijaya Raje Scindia Airport", 26.2933, 78.2278, "Gwalior"], ["Khajuraho – Khajuraho Airport", 24.8172, 79.9186, "Khajuraho"], ["Rewa – Rewa Airport", 24.5023, 81.1198, "Rewa"], ["Satna – Satna Airport", 24.562, 80.855, "Satna"], ["Jaipur – Jaipur International Airport", 26.8242, 75.8122, "Jaipur"], ["Jodhpur – Jodhpur Airport", 26.2511, 73.0489, "Jodhpur"], ["Udaipur – Maharana Pratap Airport", 24.6177, 73.8961, "Udaipur"], ["Jaisalmer – Jaisalmer Airport", 26.8887, 70.865, "Jaisalmer"], ["Bikaner – Bikaner Airport", 28.0706, 73.2072, "Bikaner"], ["Kota – Kota Airport", 25.16, 75.8456, "Kota"], ["Ajmer – Kishangarh Airport", 26.6011, 74.8142, "Ajmer"], ["Ahmedabad – Sardar Vallabhbhai Patel Airport", 23.0772, 72.6347, "Ahmedabad"], ["Surat – Surat Airport", 21.1141, 72.7418, "Surat"], ["Vadodara – Vadodara Airport", 22.3362, 73.2263, "Vadodara"], ["Rajkot – Rajkot Airport (Hirasar)", 22.3792, 71.045, "Rajkot"], ["Bhavnagar – Bhavnagar Airport", 21.7522, 72.1852, "Bhavnagar"], ["Bhuj – Bhuj Airport", 23.2878, 69.6702, "Bhuj"], ["Jamnagar – Jamnagar Airport", 22.4655, 70.0126, "Jamnagar"], ["Porbandar – Porbandar Airport", 21.6487, 69.6572, "Porbandar"], ["Diu – Diu Airport", 20.7131, 70.9211, "Diu"], ["Kandla – Kandla Airport", 23.1127, 70.1003, "Kandla"], ["Lucknow – Chaudhary Charan Singh International Airport", 26.7606, 80.8893, "Lucknow"], ["Varanasi – Lal Bahadur Shastri Airport", 25.4524, 82.8593, "Varanasi"], ["Ayodhya – Maharishi Valmiki International Airport", 26.4198, 82.1558, "Ayodhya"], ["Kanpur – Kanpur Airport (Chakeri)", 26.4041, 80.4102, "Kanpur"], ["Prayagraj – Prayagraj Airport", 25.4401, 81.7339, "Prayagraj"], ["Gorakhpur – Gorakhpur Airport", 26.7397, 83.4497, "Gorakhpur"], ["Kushinagar – Kushinagar International Airport", 26.7753, 83.8855, "Kushinagar"], ["Agra – Pandit Deen Dayal Upadhyay Airport (Kheria)", 27.1558, 77.9609, "Agra"], ["Dehradun – Jolly Grant Airport", 30.1897, 78.1803, "Dehradun"], ["Pantnagar – Pantnagar Airport", 29.0334, 79.4737, "Pantnagar"], ["Chandigarh – Shaheed Bhagat Singh International Airport", 30.6735, 76.7885, "Chandigarh"], ["Amritsar – Sri Guru Ram Dass Jee International Airport", 31.7096, 74.7973, "Amritsar"], ["Ludhiana – Sahnewal Airport", 30.8547, 75.9526, "Ludhiana"], ["Bathinda – Bathinda Airport", 30.2701, 74.7576, "Bathinda"], ["Jalandhar – Adampur Airport", 31.4338, 75.7588, "Jalandhar"], ["Hisar – Hisar Airport", 29.1794, 75.7553, "Hisar"], ["Shimla – Shimla Airport", 31.0818, 77.068, "Shimla"], ["Kullu – Kullu-Manali Airport (Bhuntar)", 31.8767, 77.1544, "Kullu"], ["Dharamshala – Kangra Airport (Gaggal)", 32.1651, 76.2634, "Dharamshala"], ["Srinagar – Srinagar International Airport", 33.9871, 74.7742, "Srinagar"], ["Jammu – Jammu Airport", 32.6891, 74.8374, "Jammu"], ["Leh – Kushok Bakula Rimpochee Airport", 34.1359, 77.5465, "Leh"], ["Guwahati – Lokpriya Gopinath Bordoloi International Airport", 26.1061, 91.5859, "Guwahati"], ["Dibrugarh – Dibrugarh Airport", 27.4839, 95.0169, "Dibrugarh"], ["Jorhat – Jorhat Airport", 26.7315, 94.1755, "Jorhat"], ["Silchar – Silchar Airport", 24.9129, 92.9787, "Silchar"], ["Tezpur – Tezpur Airport", 26.7091, 92.7847, "Tezpur"], ["Lakhimpur – Lilabari Airport", 27.2955, 94.0976, "Lakhimpur"], ["Imphal – Bir Tikendrajit International Airport", 24.76, 93.8967, "Imphal"], ["Agartala – Maharaja Bir Bikram Airport", 23.887, 91.2404, "Agartala"], ["Aizawl – Lengpui Airport", 23.8406, 92.6197, "Aizawl"], ["Dimapur – Dimapur Airport", 25.8839, 93.7711, "Dimapur"], ["Itanagar – Donyi Polo Airport", 27.0956, 93.656, "Itanagar"], ["Shillong – Shillong Airport (Umroi)", 25.7036, 91.9786, "Shillong"], ["Gangtok – Pakyong Airport", 27.2263, 88.586, "Gangtok"], ["Port Blair – Veer Savarkar International Airport", 11.6412, 92.7297, "Port Blair"], ["Agatti – Agatti Airport (Lakshadweep)", 10.8237, 72.176, "Agatti"]];
const AIRPORT_COORDS = {};
AIRPORTS.forEach(a=>{AIRPORT_COORDS[a[0]]=[a[1],a[2]];});
const NEARBY_CITY_KM = 150;
let pricing = {rates:{}, commissionPercent:15};
let serviceCities = [];
let currentFare = null;
let currentBooking = null;
let confirmation = null;
let recaptcha = null;
let mapsPromise = null;

function loadGoogleMaps(){
  if(window.google?.maps) return Promise.resolve(window.google.maps);
  if(mapsPromise) return mapsPromise;
  const key=cfg.googleMapsBrowserKey;
  if(!key || key.startsWith('REPLACE')) return Promise.reject(new Error('Google Maps browser API key is not configured in config.js.'));
  mapsPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-taximela-maps]');
    if(existing){existing.addEventListener('load',()=>resolve(window.google.maps),{once:true});existing.addEventListener('error',()=>reject(new Error('Google Maps could not be loaded.')),{once:true});return;}
    const script=document.createElement('script');
    script.dataset.taximelaMaps='1';
    script.async=true;script.defer=true;
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.onload=()=>resolve(window.google.maps);
    script.onerror=()=>reject(new Error('Google Maps could not be loaded. Check the API key and enabled APIs.'));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

async function googleDrivingDistance(points){
  if(points.length<2) throw new Error('Select pickup and destination first.');
  const maps=await loadGoogleMaps();
  const service=new maps.DistanceMatrixService();
  const origins=points.slice(0,-1).map(p=>({lat:p.lat,lng:p.lng}));
  const destination=points[points.length-1];
  // Calculate each leg separately so added intermediate cities are supported.
  let total=0;
  for(let i=0;i<points.length-1;i++){
    const result=await new Promise((resolve,reject)=>service.getDistanceMatrix({
      origins:[{lat:points[i].lat,lng:points[i].lng}],
      destinations:[{lat:points[i+1].lat,lng:points[i+1].lng}],
      travelMode:maps.TravelMode.DRIVING,
      unitSystem:maps.UnitSystem.METRIC,
      avoidHighways:false,avoidTolls:false
    },(r,status)=>status==='OK'?resolve(r):reject(new Error(`Google Maps distance error: ${status}`))));
    const element=result.rows?.[0]?.elements?.[0];
    if(!element || element.status!=='OK') throw new Error('Google Maps could not calculate this route.');
    total += Number(element.distance?.value||0)/1000;
  }
  return Math.round(total*10)/10;
}

function homeCities(){
  const names=serviceCities.map(x=>String(x.name||x.city||x.cityName||'')).filter(Boolean);
  return [...new Set(names)].sort((a,b)=>a.localeCompare(b));
}
function populateHomeCityList(){
  const list=$('#homeCities'); if(!list)return;
  list.innerHTML=homeCities().map(c=>`<option value=\"${escapeHtml(c)}\"></option>`).join('');
}
function homeRoutePoints(){
  const values=[$('#homePickup')?.value,...$$('#homeExtraCities input').map(i=>i.value),$('#homeDestination')?.value].filter(Boolean);
  return values.map(getCoord).filter(Boolean);
}
function renderHomeServiceFields(){
  const mode=$('.tm-tab.active')?.dataset.homeMode||'outstation';
  const localAirport=mode==='local';
  $('#homeOutstationFields')?.classList.toggle('hidden',localAirport);
  $('#homeLocalAirportFields')?.classList.toggle('hidden',!localAirport);
  const service=$('.tm-radio[data-home-service].active')?.dataset.homeService||'local';
  $('#homeLocalFields')?.classList.toggle('hidden',!localAirport||service!=='local');
  $('#homeAirportFields')?.classList.toggle('hidden',!localAirport||service!=='airport');
  $('#homeAddCity')?.classList.toggle('hidden',mode!=='outstation');
  $('#homeTrip')?.classList.toggle('hidden',mode!=='outstation');
  $('#homeDistance').textContent='';
}
function homeSetMode(mode){
  $$('.tm-tab[data-home-mode]').forEach(x=>x.classList.toggle('active',x.dataset.homeMode===mode));
  renderHomeServiceFields();
}
async function openInlineBooking(p){
  const sec=$('#homeBookSection');
  if(!sec){location.href='book.html?'+new URLSearchParams(p).toString();return;}
  const set=(id,v)=>{const e=$(id);if(e)e.value=v??'';};
  ['#pickup','#destination','#localCity','#airportCity','#airportDirection','#airport'].forEach(i=>set(i,''));
  $('#mirrorMode').dataset.mode=p.mode;$('#mirrorTrip').dataset.trip=p.trip||'oneway';
  if(p.mode==='outstation'){set('#pickup',p.pickup);set('#destination',p.destination);}
  if(p.mode==='local'){set('#localCity',p.localCity);set('#package',p.package||'20');}
  if(p.mode==='airport'){set('#airportCity',p.airportCity);set('#airportDirection',p.airportDirection);set('#airport',p.airport);}
  if(auth.currentUser)set('#customerPhone',(auth.currentUser.phoneNumber||'').replace('+91',''));else if(p.phone)set('#customerPhone',p.phone);
  $('#toll-wrap')?.classList.toggle('hidden',p.mode!=='outstation');
  $('#returnWrap')?.classList.toggle('hidden',!(p.mode==='outstation'&&p.trip==='roundtrip'));
  $('#extraHoursWrap')?.classList.toggle('hidden',p.mode!=='local');
  syncCabCategories();
  const route=p.mode==='outstation'?[p.pickup,...(window.__tmExtraCities||[]),p.destination].join(' → '):p.mode==='local'?`${p.localCity} · ${p.package} km local rental`:`${p.airportCity} · ${p.airportDirection} · ${p.airport}`;
  const sum=$('#homeBookSummary');if(sum)sum.textContent=`${route}${p.mode==='outstation'?(p.trip==='roundtrip'?' · Round trip':' · One way'):''}`;
  ['#fareBox','#customerBlock','#paymentBlock'].forEach(i=>$(i)?.classList.add('hidden'));hideMsg();
  sec.classList.remove('hidden');sec.scrollIntoView({behavior:'smooth',block:'start'});
  if(auth.currentUser){set('#customerPhone',String(auth.currentUser.phoneNumber||'').replace('+91',''));await estimate();}
  else{$('#customerBlock')?.classList.remove('hidden');const st=$('#authStatus');if(st){st.style.color='';st.textContent='Verify your mobile number with an OTP to see your fare.';}}
}
function initHome(){
  setupNav();
  /* tabs, radios, Add City, car cards: ui.js me (Firebase se independent) */
  $('#homeSubmit')?.addEventListener('click',()=>{
    const mode=$('.tm-tab.active')?.dataset.homeMode||'outstation';
    const service=$('.tm-radio[data-home-service].active')?.dataset.homeService||'local';
    const phone=$('#homePhone')?.value.replace(/\D/g,'')||'';
    const out=$('#homeDistance');
    const fail=t=>{out.textContent=t;out.classList.add('error');};
    if(phone.length!==10) return fail('Please enter a valid 10-digit mobile number. Your fare is shown after OTP verification.');
    out.classList.remove('error');out.textContent='';
    window.__tmExtraCities=[];
    if(mode==='outstation'){
      const pickup=$('#homePickup')?.value.trim(),destination=$('#homeDestination')?.value.trim();
      if(!pickup||!destination) return fail('Please select pickup and destination cities.');
      if(pickup.toLowerCase()===destination.toLowerCase()) return fail('Pickup and destination cannot be the same.');
      const extras=$$('#homeExtraCities input').map(i=>i.value.trim()).filter(Boolean);
      const values=[pickup,...extras,destination];
      if(values.map(getCoord).filter(Boolean).length!==values.length) return fail('Please choose each city from the list.');
      window.__tmExtraCities=extras;
      const roundtrip=$('.tm-radio[data-home-trip].active')?.dataset.homeTrip==='roundtrip'&&extras.length===0;
      return openInlineBooking({mode:'outstation',pickup,destination,trip:roundtrip?'roundtrip':'oneway',phone});
    }
    if(service==='local'){
      const city=$('#homeLocalCity')?.value.trim(),pkg=$('#homePackage')?.value||'20';
      if(!city) return fail('Please select a city for local rental.');
      if(!getCoord(city)) return fail('Please select a valid city from the list.');
      return openInlineBooking({mode:'local',localCity:city,package:pkg,phone});
    }
    const city=$('#homeAirportCity')?.value.trim(),direction=$('#homeAirportDirection')?.value||'',airport=$('#homeAirport')?.value||'';
    if(!city||!direction||!airport) return fail('Please select the city, transfer direction and airport.');
    if(!getCoord(city)||!getCoord(airport)) return fail('Location details for the selected city or airport are unavailable.');
    return openInlineBooking({mode:'airport',airportCity:city,airportDirection:direction,airport,phone});
  });
  renderHomeServiceFields();
  loadServiceCities().finally(()=>{populateHomeCityList();setupAirportUI({dir:'#homeAirportDirection',air:'#homeAirport',city:'#homeAirportCity'});});
}

function toast(msg){const el=$('#toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),4000)}
function msg(text){const el=$('#formMsg');if(!el)return;el.textContent=text;el.classList.remove('hidden');}
function hideMsg(){ $('#formMsg')?.classList.add('hidden'); }
function setLoading(btn,on,text='Working…'){if(!btn)return;btn.disabled=on;btn.textContent=on?text:btn.dataset.defaultText||'Continue';}
function cityOptions(){
  const names=serviceCities.map(x=>String(x.name||x.city||x.cityName||'')).filter(Boolean);
  const cities=[...new Set(names)].sort((a,b)=>a.localeCompare(b));
  const list=$('#bookCities');
  if(list) list.innerHTML=cities.map(c=>`<option value="${escapeHtml(c)}"></option>`).join('');
  $$('.city-select').forEach(sel=>{const placeholder=sel.dataset.placeholder||'Select city';const val=sel.value;sel.innerHTML=`<option value="">${placeholder}</option>`+cities.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');if(cities.includes(val))sel.value=val;});
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function loadPricing(){const s=await getDoc(doc(db,'settings','pricing'));if(!s.exists())throw new Error('Admin pricing is not configured yet. Please update Pricing Management in the Admin App.');const d=s.data();pricing={...d,rates:d.rates||{}};const missing=CAB_CATEGORIES.filter(c=>!pricing.rates[c]);if(missing.length)throw new Error(`Admin pricing is missing for: ${missing.join(', ')}`);}
async function loadServiceCities(){try{const s=await getDocs(query(collection(db,'serviceCities'),where('active','==',true)));serviceCities=s.docs.map(d=>({id:d.id,...d.data()}));}catch(e){console.warn('serviceCities',e)}}
function getCoord(name){if(CITY_COORDS[name])return {lat:CITY_COORDS[name][0],lng:CITY_COORDS[name][1],name};if(AIRPORT_COORDS[name])return {lat:AIRPORT_COORDS[name][0],lng:AIRPORT_COORDS[name][1],name};const found=serviceCities.find(x=>String(x.name||x.city||x.cityName||'').toLowerCase()===String(name||'').toLowerCase());if(found?.lat!=null&&found?.lng!=null)return {lat:Number(found.lat),lng:Number(found.lng),name};return null;}
function haversine(a,b){const R=6371,rad=x=>x*Math.PI/180;const dLat=rad(b.lat-a.lat),dLon=rad(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function approximateDistance(points){let km=0;for(let i=0;i<points.length-1;i++)km+=haversine(points[i],points[i+1]);return Math.max(1,Math.round(km*1.18));}
function routePointsForMode(mode){
  if(mode==='outstation'){const dom=$$('#bookExtraCities input').map(i=>i.value.trim()).filter(Boolean);const extras=dom.length?dom:(window.__tmExtraCities||[]);return [$('#pickup')?.value,...extras,$('#destination')?.value].map(getCoord).filter(Boolean);}
  if(mode==='airport'){const city=$('#airportCity')?.value, airport=$('#airport')?.value;return [getCoord(city),getCoord(airport)].filter(Boolean);}
  return [];
}
function activeMode(){return $('.tab.active')?.dataset.mode||'outstation';}
function tripType(){return activeMode();}
function selectedTrip(){return $('.radio.active')?.dataset.trip||'oneway';}
function localDT(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function validateBasics(){
  const mode=activeMode();
  const pdv=$('#pickupDateTime')?.value;
  if(pdv && new Date(pdv).getTime()<Date.now()-60000) throw new Error('Pickup date & time must be in the future.');
  const rdv=$('#returnDateTime')?.value;
  if(mode==='outstation' && selectedTrip()==='roundtrip' && !rdv) throw new Error('Please select the return date & time for a round trip.');
  if(mode==='outstation' && selectedTrip()==='roundtrip' && rdv && pdv && new Date(rdv)<=new Date(pdv)) throw new Error('Return date & time must be after pickup.');
  if(mode==='outstation' && (!$('#pickup').value||!$('#destination').value)) throw new Error('Please select pickup city and destination city.');
  if(mode==='local' && !$('#localCity').value) throw new Error('Please select the city for local rental.');
  if(mode==='airport' && (!$('#airportCity').value||!$('#airport').value||!$('#airportDirection').value)) throw new Error('Please select city, airport and transfer direction.');
  if(mode==='outstation' && $('#pickup').value===$('#destination').value) throw new Error('Pickup and destination cannot be the same.');
  if(mode==='outstation'){const ex=$$('#bookExtraCities input').map(i=>i.value.trim());if(ex.some(v=>!v)) throw new Error('Please fill or remove the extra city.');if(ex.some(v=>!getCoord(v))) throw new Error('Please choose each city from the list.');if(ex.length&&selectedTrip()==='roundtrip') throw new Error('Round Trip is available only for 2 cities.');}
}
function payloadForEstimate(){
  const mode=activeMode();
  const points=routePointsForMode(mode);
  if(mode==='outstation' && points.length<2) throw new Error('Route coordinates are unavailable for the selected cities.');
  if(mode==='airport' && points.length<2) throw new Error('Airport/city coordinates are unavailable.');
  if(mode==='local' && ![20,40,80,120].includes(num($('#package')?.value))) throw new Error('Please select a local package.');
  const dt=$('#pickupDateTime').value||localDT(new Date()); const ret=(mode==='outstation'&&selectedTrip()==='roundtrip')?($('#returnDateTime').value||''):'';
  return {tripType:mode,category:$('#category').value,tollMode:$('#toll').value,packageKm:num($('#package')?.value),extraHours:num($('#extraHours')?.value),pet:$('#pet').checked,pickupDateTime:new Date(dt).toISOString(),returnDateTime:ret?new Date(ret).toISOString():null,routePoints:points,distanceMultiplier:mode==='outstation'&&selectedTrip()==='roundtrip'?1.8:1,isOneWay:mode==='outstation'?selectedTrip()==='oneway':true};
}
function fallbackFare(){ throw new Error('Live fare service is unavailable. Please try again after the Firebase function is deployed.'); }
function initAdvanceSlider(r){
  const sl=$('#advSlider');if(!sl)return;
  const min=Math.min(100,Math.max(0,Math.round(num(r.commissionPercent??pricing.commissionPercent)*100)/100));
  const steps=Math.max(1,Math.ceil((100-min)/5));
  sl.disabled=min>=100;sl.min=min;sl.max=100;sl.step=min>=100?1:(100-min)/steps;sl.value=min;
  const apply=()=>{
    const pct=Number(sl.value);r.advancePercent=pct;
    r.advance=Math.round((num(r.baseFare)*pct/100+num(r.petCharge))*100)/100;
    $('#fareAdvance').textContent=money(r.advance);
    const b=$('#fareBalance');if(b)b.textContent=money(Math.max(0,num(r.totalFare)-r.advance));
    const l=$('#advPctLabel');if(l)l.textContent=Math.round(pct)+'%';
    const h=$('#advHint');if(h)h.textContent=`Minimum ${Math.round(min)}% required. Pay more now, less in cash!`;
  };
  sl.oninput=apply;apply();
}
function renderFare(r){currentFare=r;setTimeout(()=>$('#fareBox')?.scrollIntoView({behavior:'smooth',block:'center'}),150);$('#fareBox')?.classList.remove('hidden');$('#fareAmount').textContent=money(r.totalFare);$('#fareDistance').textContent=`${Number(r.distanceKm||0).toFixed(0)} km · ${r.mode||''}`;$('#fareAdvance').textContent=money(r.advance);initAdvanceSlider(r);$('#fareLabel').textContent=`${$('#category').value} · ${selectedTrip()==='roundtrip'?'Round Trip':activeMode()}`;if(auth.currentUser){$('#customerBlock')?.classList.add('hidden');const cf=$('#couponCode')?.closest('.field');const pb=$('#paymentBlock');if(cf&&pb&&!pb.contains(cf))pb.insertBefore(cf,$('#payBtn'));cf?.classList.remove('hidden');pb?.classList.remove('hidden');$('#payBtn').disabled=false;}else{$('#customerBlock')?.classList.remove('hidden');$('#paymentBlock')?.classList.add('hidden');}}
async function estimate(){hideMsg();if(!auth.currentUser){$('#customerBlock')?.classList.remove('hidden');msg('Please enter your mobile number and verify the OTP to see your fare.');$('#customerBlock')?.scrollIntoView({behavior:'smooth',block:'center'});return;}$('#estimateBtn').disabled=true;$('#estimateBtn').textContent='Calculating…';try{validateBasics();const p=payloadForEstimate();try{const result=await estimateFareFn(p);renderFare(result.data);toast('Fare estimate ready.');}catch(fnErr){console.warn('estimateFare unavailable',fnErr);if(activeMode()!=='local')throw fnErr;const category=$('#category').value;const packageKm=num($('#package').value);const pkg=LOCAL_PACKAGE_RATES[category]?.[packageKm];if(!pkg)throw new Error('This local package is not available for the selected cab.');const extraHours=Math.max(0,num($('#extraHours').value));const extraHoursFare=extraHours*300;const petCharge=$('#pet').checked?750:0;const baseFare=pkg+extraHoursFare;const commissionPercent=num(pricing.commissionPercent);const totalFare=baseFare+petCharge;const advance=(baseFare*commissionPercent/100)+petCharge;renderFare({distanceKm:packageKm,baseFare,extraHoursFare,petCharge,nightCharge:0,totalFare,advance,commissionPercent,mode:`${packageKm} km package`});toast('Local package fare calculated.');}}catch(e){console.error('estimateFare',e);msg(e?.message||'Could not calculate the fare. Please try again.');}finally{$('#estimateBtn').disabled=false;$('#estimateBtn').textContent='Check Price & Book Cab';}}

function syncCabCategories(){
  const select=$('#category'); if(!select) return;
  const mode=activeMode();
  const current=select.value;
  const allowed=(mode==='outstation')?CAB_CATEGORIES:CAB_CATEGORIES.filter(c=>c!=='Innova Crysta');
  select.innerHTML=allowed.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value=allowed.includes(current)?current:(allowed.includes('Sedan')?'Sedan':allowed[0]);
}

function setupModes(){/* Outstation/Local/Airport tabs aur One Way/Round Trip: ui.js me */}
function setupNav(){/* hamburger menu ab ui.js me hai */}
function initAuth(){
  const send=$('#sendOtpBtn'); if(!send)return;
  send.addEventListener('click',async()=>{try{const phone=$('#customerPhone').value.replace(/\D/g,'');if(!$('#customerName').value.trim())throw new Error('Please enter your name.');if(phone.length!==10)throw new Error('Enter a valid 10-digit mobile number.');if(!recaptcha){recaptcha=new RecaptchaVerifier(auth,'recaptcha-container',{size:'normal'});await recaptcha.render();}const confirmationResult=await signInWithPhoneNumber(auth,`+91${phone}`,recaptcha);confirmation=confirmationResult;$('#otp').classList.remove('hidden');$('#verifyOtpBtn').disabled=false;$('#authStatus').textContent='OTP sent. Enter the 6-digit OTP.';send.disabled=true;}catch(e){console.error(e);$('#authStatus').textContent=e.message||'Could not send OTP.';try{recaptcha?.clear();recaptcha=null;}catch{}}});
  $('#verifyOtpBtn')?.addEventListener('click',async()=>{try{if(!confirmation)throw new Error('Send OTP first.');await confirmation.confirm($('#otp').value.trim());$('#authStatus').textContent='Phone verified ✓';try{await ensureCustomerRecord($('#customerPhone').value.replace(/\D/g,''),$('#customerName').value.trim());await addBookingLead();}catch(_){}$('#customerPhone').readOnly=true;$('#authStatus').style.color='#16833b';hideMsg();if(currentFare){$('#paymentBlock').classList.remove('hidden');$('#payBtn').disabled=false;}else{await estimate();}}catch(e){$('#authStatus').textContent='Invalid OTP. Please try again.';}});
}
async function resolveCoupon(advance){
  const code=($('#couponCode')?.value||'').trim().toUpperCase();
  if(!code) return {code:'',discount:0,docId:null};
  const s=await getDocs(query(collection(db,'promoCodes'),where('active','==',true)));
  const hit=s.docs.find(d=>String(d.data().code||'').toUpperCase()===code);
  if(!hit) throw new Error('Invalid coupon code. Please correct it or clear the field.');
  const d=hit.data(),value=num(d.value);
  let discount=d.type==='Flat'?value:advance*(value/100);
  discount=Math.max(0,Math.min(discount,advance-1));
  return {code,discount:Math.round(discount*100)/100,docId:hit.id};
}
async function checkCustomerBlocked(phone){
  try{const s=await getDoc(doc(db,'customers',phone));if(s.exists()&&s.data().status==='Blocked')return s.data().statusReason||'Your account is blocked. Please contact support.';}catch(e){console.warn('customer check',e)}
  return '';
}
async function createOrder(amount){const result=await createRazorpayOrderFn({amountPaise:Math.round(amount*100),amount:Math.round(amount*100)});return result.data;}
async function pay(){
  if(!currentFare) return msg('Calculate the fare first.'); if(!auth.currentUser) return msg('Please verify your phone number first.');
  try{validateBasics();}catch(e){return msg(e.message);}
  if((($('#pickupAddress')?.value)||'').trim().length<5){$('#paymentStatus').textContent='Please enter your exact pickup address before paying.';$('#pickupAddress')?.focus();return;}
  const key=cfg.razorpayKeyId;if(!key||key.startsWith('REPLACE'))return msg('Razorpay Key ID is not configured in config.js.');
  $('#payBtn').disabled=true;$('#paymentStatus').textContent='Creating secure payment order…';
  try{
    const typedPhone=$('#customerPhone').value.replace(/\D/g,'');
    if(auth.currentUser.phoneNumber!=='+91'+typedPhone)throw new Error('Phone number changed after OTP. Please refresh and verify the number you want to book with.');
    const blockedMsg=await checkCustomerBlocked(typedPhone);if(blockedMsg)throw new Error(blockedMsg);
    const cp=await resolveCoupon(currentFare.advance);
    const payable=Math.round((currentFare.advance-cp.discount)*100)/100;
    payState={couponCode:cp.code,discount:cp.discount,docId:cp.docId,paid:payable};
    if(cp.discount>0)$('#paymentStatus').textContent=`Coupon applied! You saved ${money(cp.discount)}. Creating secure payment order…`;
    const order=await createOrder(payable);const orderId=order.orderId||order.id;const amountPaise=Number(order.amount||Math.round(payState.paid*100));const rzp=new Razorpay({key:order.keyId||key,amount:amountPaise,currency:'INR',order_id:orderId,name:'Taxi Mela',description:`${$('#pickup')?.value||$('#localCity')?.value||$('#airportCity')?.value||''} to ${$('#destination')?.value||$('#airport')?.value||''}`,prefill:{name:$('#customerName').value,contact:$('#customerPhone').value,email:$('#customerEmail').value},theme:{color:'#ffcc00'},handler:async response=>{try{const verified=await verifyRazorpayPaymentFn({orderId:response.razorpay_order_id||response.orderId,paymentId:response.razorpay_payment_id||response.paymentId,signature:response.razorpay_signature||response.signature});if(verified.data?.verified!==true)throw new Error('Payment verification failed.');await createBooking(response.razorpay_payment_id||response.paymentId);}catch(e){console.error(e);$('#paymentStatus').textContent=e.message||'Payment verification failed.';$('#payBtn').disabled=false;}}});rzp.on('payment.failed',e=>{$('#paymentStatus').textContent=e.error?.description||'Payment failed.';$('#payBtn').disabled=false});rzp.open();}catch(e){console.error(e);$('#paymentStatus').textContent=e.message||'Could not start payment.';$('#payBtn').disabled=false;}
}
async function ensureCustomerRecord(phone,name){
  // Same fields the Customer App writes, so the Admin app lists website customers too.
  try{
    const ref=doc(db,'customers',phone);
    const snap=await getDoc(ref);
    if(!snap.exists()){
      await setDoc(ref,{name,phone,whatsapp:phone,email:'',trips:0,cancelledRides:0,rating:0,lastBooking:'—',status:'Active',referralCount:0,createdAt:serverTimestamp(),source:'website'});
    }
  }catch(e){console.warn('customer record',e)}
}
async function addBookingLead(){
  try{
    const mode=activeMode();
    const from=mode==='outstation'?$('#pickup').value:(mode==='local'?$('#localCity').value:$('#airportCity').value);
    const to=mode==='outstation'?$('#destination').value:mode==='local'?from:$('#airport').value;
    const pd=$('#pickupDateTime')?.value?new Date($('#pickupDateTime').value):null;
    const when=pd?pd.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'';
    await addDoc(collection(db,'websiteLeads'),{type:'booking-interest',name:$('#customerName').value.trim(),phone:$('#customerPhone').value.replace(/\D/g,''),email:'',city:from,vehicleType:$('#category')?.value||'',tripSummary:`${from} → ${to} · ${mode}${when?' · '+when:''}`,message:'Verified by OTP on website (payment pending)',status:'New',source:'website',createdAt:serverTimestamp()});
  }catch(e){console.warn('lead',e)}
}
async function createBooking(paymentId){
  const mode=activeMode();const now=new Date();const bookingId=`TM${String(now.getTime()).slice(-10)}`;const name=$('#customerName').value.trim()||'Customer';const phone=$('#customerPhone').value.replace(/\D/g,'');const from=mode==='outstation'?$('#pickup').value:(mode==='local'?$('#localCity').value:$('#airportCity').value);const to=mode==='outstation'?$('#destination').value:mode==='local'?from:$('#airport').value;const addrTyped=($('#pickupAddress')?.value||'').trim();const fullAddr=addrTyped?`${addrTyped}, ${from}`:from;
  const pickupDt=$('#pickupDateTime').value?new Date($('#pickupDateTime').value):now;const returnDt=(mode==='outstation'&&selectedTrip()==='roundtrip'&&$('#returnDateTime').value)?new Date($('#returnDateTime').value):null;const paymentMethod='Razorpay';
  try{
    await ensureCustomerRecord(phone,name);
    const ride=await addDoc(collection(db,'rides'),{id:bookingId,customer:name,customerPhone:phone,driver:'Not Assigned',from,to,amount:currentFare.totalFare,baseFare:currentFare.baseFare,hasPet:$('#pet').checked,status:'Ongoing',date:pickupDt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),paymentMethod,advancePaid:payState.paid,couponCode:payState.couponCode,couponDiscount:payState.discount,razorpayPaymentId:paymentId,pickupAddress:fullAddr,cabType:$('#category').value,bookingType:mode,tripType:(mode==='outstation'?selectedTrip():mode),pickupDateTime:pickupDt.toISOString(),pickupDate:`${pickupDt.getDate()}/${pickupDt.getMonth()+1}/${pickupDt.getFullYear()}`,pickupTime:pickupDt.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}),returnDateTime:returnDt?returnDt.toISOString():null,tollMode:$('#toll').value,tollLabel:$('#toll').value==='tollIncl'?'Toll + State Tax Included':'Toll + State Tax Excluded',parkingPaidBy:'Customer',distanceKm:Math.round(currentFare.distanceKm||0),source:'website',requestedVehicle:$('#category').value,assignedVehicle:$('#category').value,matchType:'Exact',customerApproval:'Not Required',returnDate:returnDt?`${returnDt.getDate()}/${returnDt.getMonth()+1}/${returnDt.getFullYear()}`:null,returnTime:returnDt?returnDt.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):null,createdAt:serverTimestamp()});
    const pts=routePointsForMode(mode);const active=await addDoc(collection(db,'activeRides'),{id:bookingId,customer:name,customerPhone:phone,driver:null,pickup:from,pickupLat:pts[0]?.lat??null,pickupLng:pts[0]?.lng??null,destination:to,pickupAddress:fullAddr,distance:`${Math.round(currentFare.distanceKm||0)} km`,fare:currentFare.totalFare,baseFare:currentFare.baseFare,hasPet:$('#pet').checked,platformFee:currentFare.totalFare*(num(pricing.commissionPercent)/100),paymentStatus:'Paid',rideStatus:'Searching Driver',liveLocation:'—',paymentMethod,cabType:$('#category').value,extraPerKm:0,tollIncluded:$('#toll').value==='tollIncl',tollRate:num(pricing.rates?.[$('#category').value]?.[$('#toll').value]),parkingPaidBy:'Customer',source:'website',pickupDateTime:pickupDt.toISOString(),isLocal:mode!=='outstation',bookingType:mode,isOneWay:selectedTrip()==='oneway',totalDistance:Math.round(currentFare.distanceKm||0),pickupDate:`${pickupDt.getDate()}/${pickupDt.getMonth()+1}/${pickupDt.getFullYear()}`,pickupTime:pickupDt.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}),returnDate:returnDt?`${returnDt.getDate()}/${returnDt.getMonth()+1}/${returnDt.getFullYear()}`:null,returnTime:returnDt?returnDt.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):null,nightCharge:num(currentFare.nightCharge),requestedVehicle:$('#category').value,assignedVehicle:$('#category').value,matchType:'Exact',customerApproval:'Not Required',razorpayPaymentId:paymentId,createdAt:serverTimestamp()});
    if(payState.docId){try{await applyPromoCodeFn({promoDocId:payState.docId});}catch(e){console.warn('promo usage',e)}}
    currentBooking={docId:active.id,bookingId};showStatus(active.id,bookingId,from,to,$('#category').value,currentFare.totalFare);toast('Booking confirmed successfully.');
  }catch(e){console.error(e);$('#paymentStatus').textContent=`Payment verified, but booking creation failed: ${e.message}`;$('#payBtn').disabled=false;}
}
function showStatus(docId,bookingId,from,to,cab,total){$('#statusCard').classList.remove('hidden');$('#bookingIdText').textContent=bookingId;$('#routeText').textContent=`${from} → ${to}`;$('#cabText').textContent=cab;$('#totalText').textContent=money(total);listenStatus(docId);$('#statusCard').scrollIntoView({behavior:'smooth',block:'center'});}
function normalizeStatus(s){if(s==='Driver Arriving'||s==='Driver Accepted')return 'Driver Arriving';if(s==='On the way'||s==='Trip Started'||s==='Started')return 'On the way';if(s==='Completed'||s==='Awaiting Confirmation')return 'Completed';if(s==='Cancelled')return 'Cancelled';return 'Searching Driver';}
function listenStatus(docId){onSnapshot(doc(db,'activeRides',docId),snap=>{if(!snap.exists())return;const d=snap.data();const s=normalizeStatus(d.rideStatus||'Searching Driver');$('#statusPill').textContent=d.rideStatus||'Searching Driver';$('#statusTitle').textContent=s==='Cancelled'?'Booking cancelled':s==='Completed'?'Trip completed':'Your booking is live';$$('[data-status-step]').forEach(el=>el.classList.toggle('active',el.dataset.statusStep===s));if(d.driver)$('#cabText').textContent=`${d.driver} · ${d.assignedVehicle||$('#category').value}`;});}

function setupAirportUI(ids){
  const dirEl=$(ids.dir),airEl=$(ids.air);let cityEl=$(ids.city);
  if(!dirEl||!airEl||!cityEl||airEl.dataset.tmReady)return;
  airEl.dataset.tmReady='1';
  const fld=e=>e.closest('.field,.tm-field');
  if(cityEl.tagName!=='SELECT'){const sel=document.createElement('select');sel.id=cityEl.id;cityEl.replaceWith(sel);cityEl=sel;}
  const parent=fld(dirEl)?.parentElement;
  if(parent&&fld(airEl)&&fld(cityEl)&&fld(airEl).parentElement===parent&&fld(cityEl).parentElement===parent){parent.append(fld(dirEl),fld(airEl),fld(cityEl));}
  const sorted=[...AIRPORTS].sort((a,b)=>a[0].localeCompare(b[0]));
  airEl.innerHTML='<option value="">Select Airport</option>'+sorted.map(a=>`<option value="${escapeHtml(a[0])}">${escapeHtml(a[0])}</option>`).join('');
  const refresh=()=>{
    const keep=cityEl.value;const ap=AIRPORT_COORDS[airEl.value];
    const label=dirEl.value==='From Airport'?'Drop city':'Pickup city';
    if(!ap){cityEl.innerHTML='<option value="">Select airport first</option>';return;}
    const near=[...new Set(serviceCities.map(x=>String(x.name||x.city||x.cityName||'')).filter(Boolean))].map(n=>{const c=getCoord(n);return c?{n,d:haversine({lat:ap[0],lng:ap[1]},c)}:null;}).filter(x=>x&&x.d<=NEARBY_CITY_KM).sort((a,b)=>a.d-b.d);
    cityEl.innerHTML=near.length?`<option value="">Select ${label}</option>`+near.map(x=>`<option value="${escapeHtml(x.n)}">${escapeHtml(x.n)}</option>`).join(''):'<option value="">No service city near this airport</option>';
    if(near.some(x=>x.n===keep))cityEl.value=keep;
  };
  airEl.addEventListener('change',refresh);dirEl.addEventListener('change',refresh);
  refresh();
  airEl._tmRefresh=refresh;
}
function setBookAirportFromParams(params){
  const d=$('#airportDirection'),a=$('#airport'),c=$('#airportCity');
  if(d&&params.get('airportDirection'))d.value=params.get('airportDirection');
  if(a&&params.get('airport')){a.value=params.get('airport');}
  a?._tmRefresh?.();
  if(c&&params.get('airportCity'))c.value=params.get('airportCity');
}
function syncReturn(){const show=activeMode()==='outstation'&&selectedTrip()==='roundtrip';$('#returnWrap')?.classList.toggle('hidden',!show);}
function enhanceBookingUI(){
  const toll=$('#toll');
  if(toll){
    [...toll.options].forEach(o=>{o.textContent=o.value==='tollIncl'?'Toll + State Tax Included':'Toll + State Tax Excluded';});
    const wrap=$('#toll-wrap');
    if(wrap&&!$('#parkingHint')){const h=document.createElement('div');h.id='parkingHint';h.className='hint';h.textContent='Parking charges are always paid by the customer, whether toll & state tax is included or excluded.';wrap.appendChild(h);}
  }
  const pb=$('#paymentBlock');
  if(pb&&!$('#pickupAddress')){
    const f=document.createElement('div');f.className='field';f.id='pickupAddressField';
    f.innerHTML='<label>Exact pickup address</label><input id="pickupAddress" placeholder="House / street / landmark, area" autocomplete="off">';
    pb.insertBefore(f,$('#payBtn'));
  }
  $('#couponCode')?.closest('.field')?.classList.add('hidden');
}
async function initBook(){
  setupModes();setupNav();initAuth();syncCabCategories();signOut(auth).catch(()=>{});$('#customerEmail')?.closest('.field')?.classList.add('hidden');enhanceBookingUI();
  // Attach the primary booking actions immediately so slow mobile network/Firebase loading
  // cannot leave the visible buttons without click handlers.
  $('#estimateBtn')?.addEventListener('click',estimate);
  $('#payBtn')?.addEventListener('click',pay);
  const params=new URLSearchParams(location.search);
  const mode=params.get('mode'),category=params.get('category'),pickup=params.get('pickup'),destination=params.get('destination'),phone=params.get('phone');
  if(mode && ['outstation','local','airport'].includes(mode)){const tab=$(`.tab[data-mode="${mode}"]`);tab?.click();}
  const _init=await Promise.allSettled([loadPricing(),loadServiceCities()]);if(_init[0].status==='rejected'){console.warn('pricing',_init[0].reason);msg(_init[0].reason?.message||'Pricing could not be loaded. Please try again.');}cityOptions();syncCabCategories();setupAirportUI({dir:'#airportDirection',air:'#airport',city:'#airportCity'});
  if(category && $('#category') && [...$('#category').options].some(o=>o.value===category))$('#category').value=category;
  if(pickup&&$('#pickup'))$('#pickup').value=pickup;
  if(destination&&$('#destination'))$('#destination').value=destination;
  if(params.get('localCity')&&$('#localCity'))$('#localCity').value=params.get('localCity');
  setBookAirportFromParams(params);
  if(params.get('package')&&$('#package'))$('#package').value=params.get('package');
  if(phone&&$('#customerPhone'))$('#customerPhone').value=phone;
  if(params.get('trip')==='roundtrip')$('.radio[data-trip="roundtrip"]')?.click();
  if($('#pickupDateTime'))$('#pickupDateTime').value=localDT(new Date(Date.now()+3600000));$('#pickupDateTime').min=localDT(new Date());
  if($('#returnDateTime'))$('#returnDateTime').value=localDT(new Date(Date.now()+86400000));$('#returnDateTime').min=localDT(new Date());
  document.addEventListener('click',()=>setTimeout(syncReturn,0));syncReturn();
}
function initGeneric(){setupNav();}
if($('#homeSubmit'))initHome();
if($('#estimateBtn'))initBook();
if(!$('#homeSubmit')&&!$('#estimateBtn'))initGeneric();
window.__tmAppReady=true;
