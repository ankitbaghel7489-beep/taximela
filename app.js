import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';

const cfg = window.TAXIMELA_CONFIG;
const firebaseApp = initializeApp(cfg.firebase);
const db = getFirestore(firebaseApp);

const functionsAsia = getFunctions(firebaseApp, 'asia-south1');
const functionsUs = getFunctions(firebaseApp, 'us-central1');
const estimateFareFn = httpsCallable(functionsAsia, 'estimateFare');
const createRazorpayOrderFn = httpsCallable(functionsUs, 'createRazorpayOrder');
const createWebsiteBookingFn = httpsCallable(functionsAsia, 'createWebsiteBooking');
const previewCouponFn = httpsCallable(functionsAsia, 'previewWebsiteCoupon');
const bookingStatusFn = httpsCallable(functionsAsia, 'getWebsiteBookingStatus');
let payState = {couponCode:'',discount:0,docId:null,paid:0};
let lastPayload = null, carFares = {}, carPayloads = {}, statusTimer = null;

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

/* ── Address-based distance (pickup address -> drop address) ── */
let addrState = {pickup:null, drop:null}; // {lat,lng,address}
let addrFareActive = false;
let addrTimer = null;

function refreshAddrFare(){
  clearTimeout(addrTimer);
  addrTimer = setTimeout(async()=>{
    if(!currentFare) return;
    if((addrState.pickup && addrState.drop) || addrFareActive) await estimate(true);
  }, 300);
}

function bindAddressInput(id, key){
  const el = $(id); if(!el || el.dataset.tmAddr) return;
  el.dataset.tmAddr = '1';
  loadGoogleMaps().then(maps=>{
    if(!maps.places) return;
    const ac = new maps.places.Autocomplete(el, {componentRestrictions:{country:'in'}, fields:['geometry','formatted_address','name']});
    ac.addListener('place_changed', ()=>{
      const p = ac.getPlace();
      const loc = p && p.geometry && p.geometry.location;
      if(!loc) return;
      const address = p.formatted_address || el.value;
      el.value = address;
      addrState[key] = {lat: loc.lat(), lng: loc.lng(), address};
      refreshAddrFare();
    });
  }).catch(e=>console.warn('address autocomplete', e));
  el.addEventListener('input', ()=>{
    const s = addrState[key];
    if(s && el.value !== s.address){
      addrState[key] = null;
      if(addrFareActive) refreshAddrFare();
    }
  });
}

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
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
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
  if(p.phone)set('#customerPhone',p.phone);
  $('#toll-wrap')?.classList.toggle('hidden',p.mode!=='outstation');
  $('#returnWrap')?.classList.toggle('hidden',!(p.mode==='outstation'&&p.trip==='roundtrip'));
  $('#extraHoursWrap')?.classList.toggle('hidden',p.mode!=='local');
  syncCabCategories();
  const route=p.mode==='outstation'?[p.pickup,...(window.__tmExtraCities||[]),p.destination].join(' → '):p.mode==='local'?`${p.localCity} · ${p.package} km local rental`:`${p.airportCity} · ${p.airportDirection} · ${p.airport}`;
  const sum=$('#homeBookSummary');if(sum)sum.textContent=`${route}${p.mode==='outstation'?(p.trip==='roundtrip'?' · Round trip':' · One way'):''}`;
  ['#fareBox','#customerBlock','#paymentBlock','#carList'].forEach(i=>$(i)?.classList.add('hidden'));hideMsg();
  sec.classList.remove('hidden');sec.scrollIntoView({behavior:'smooth',block:'start'});
  await estimate();
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
    if(!validPhone(phone)) return fail('Please enter your real 10-digit mobile number.');
    out.classList.remove('error');out.textContent='';
    window.__tmExtraCities=[];
    if(mode==='outstation'){
      const pickup=$('#homePickup')?.value.trim(),destination=$('#homeDestination')?.value.trim();
      if(!pickup||!destination) return fail('Please select pickup and destination cities.');
      if(pickup.toLowerCase()===destination.toLowerCase()) return fail('Pickup and destination cannot be the same.');
      const extras=$$('#homeExtraCities input').map(i=>i.value.trim()).filter(Boolean);
      const values=[pickup,...extras,destination];
      if(values.map(getCoord).filter(Boolean).length!==values.length) return fail('Please choose each city from the suggestions.');
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
  ['#homePickup','#homeDestination','#homeLocalCity'].forEach(i=>bindPlaceInput($(i),'city'));
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
function getCoord(name){const _pc=placeCache[String(name||'').trim().toLowerCase()];if(_pc)return {lat:_pc.lat,lng:_pc.lng,name};if(CITY_COORDS[name])return {lat:CITY_COORDS[name][0],lng:CITY_COORDS[name][1],name};if(AIRPORT_COORDS[name])return {lat:AIRPORT_COORDS[name][0],lng:AIRPORT_COORDS[name][1],name};const found=serviceCities.find(x=>String(x.name||x.city||x.cityName||'').toLowerCase()===String(name||'').toLowerCase());if(found?.lat!=null&&found?.lng!=null)return {lat:Number(found.lat),lng:Number(found.lng),name};return null;}
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
  if(mode==='outstation'){const ex=$$('#bookExtraCities input').map(i=>i.value.trim());if(ex.some(v=>!v)) throw new Error('Please fill or remove the extra city.');if(ex.some(v=>!getCoord(v))) throw new Error('Please choose each city from the suggestions.');if(ex.length&&selectedTrip()==='roundtrip') throw new Error('Round Trip is available only for 2 cities.');}
}
function payloadForEstimate(){
  const mode=activeMode();
  const points=routePointsForMode(mode);
  let routePts=points;
  addrFareActive=false;
  if(mode==='outstation'&&addrState.pickup&&addrState.drop&&points.length===2){
    routePts=[
      {lat:addrState.pickup.lat,lng:addrState.pickup.lng,name:$('#pickup').value.trim(),address:addrState.pickup.address},
      {lat:addrState.drop.lat,lng:addrState.drop.lng,name:$('#destination').value.trim(),address:addrState.drop.address}
    ];
    addrFareActive=true;
  }
  if(mode==='outstation' && points.length<2) throw new Error('Route coordinates are unavailable for the selected cities.');
  if(mode==='airport' && points.length<2) throw new Error('Airport/city coordinates are unavailable.');
  if(mode==='local' && ![20,40,80,120].includes(num($('#package')?.value))) throw new Error('Please select a local package.');
  const dt=$('#pickupDateTime').value||localDT(new Date()); const ret=(mode==='outstation'&&selectedTrip()==='roundtrip')?($('#returnDateTime').value||''):'';
  return {tripType:mode,category:$('#category').value,tollMode:$('#toll').value,packageKm:num($('#package')?.value),extraHours:num($('#extraHours')?.value),pet:$('#pet').checked,pickupDateTime:new Date(dt).toISOString(),returnDateTime:ret?new Date(ret).toISOString():null,routePoints:routePts,distanceMultiplier:mode==='outstation'&&selectedTrip()==='roundtrip'?1.8:1,isOneWay:mode==='outstation'?selectedTrip()==='oneway':true};
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
function renderFare(r,silent){currentFare=r;if(!silent)setTimeout(()=>$('#fareBox')?.scrollIntoView({behavior:'smooth',block:'center'}),150);$('#fareBox')?.classList.remove('hidden');$('#fareAmount').textContent=money(r.totalFare);$('#fareDistance').textContent=`${Number(r.distanceKm||0).toFixed(0)} km · ${r.mode||''}`;$('#fareAdvance').textContent=money(r.advance);const _prevPct=Number($('#advSlider')?.value);initAdvanceSlider(r);if(silent&&_prevPct>=Number($('#advSlider')?.min)){const _s=$('#advSlider');_s.value=_prevPct;if(_s.oninput)_s.oninput();}$('#fareLabel').textContent=`${$('#category').value} · ${selectedTrip()==='roundtrip'?'Round Trip':activeMode()}`;$('#customerBlock')?.classList.add('hidden');const pb=$('#paymentBlock');if(pb){const pbtn=$('#payBtn');[$('#customerName')?.closest('.field'),$('#couponCode')?.closest('.field')].forEach(f=>{if(f){if(!pb.contains(f))pb.insertBefore(f,pbtn);f.classList.remove('hidden');}});pb.classList.remove('hidden');let wn=$('#waNote');if(!wn){wn=document.createElement('div');wn.id='waNote';wn.style.cssText='margin:10px 0;padding:12px 14px;border-radius:12px;background:#e8f7ee;border:1px solid #bfe6cd;color:#14532d;font-size:13px;line-height:1.5';}const ph=($('#customerPhone')?.value||'').replace(/\D/g,'');wn.innerHTML='<b>Note:</b> Your ride details and driver details will be sent on <b>WhatsApp</b> to <b>+91 '+escapeHtml(ph)+'</b>. Please check that this WhatsApp number is correct before paying.';pb.insertBefore(wn,pbtn);}if($('#payBtn'))$('#payBtn').disabled=false;}
const CAR_INFO = {Hatchback:{seats:'4+1 seater',sim:'Swift, WagonR or Similar',img:'assets/hatchback-v2.png',label:'HATCHBACK (AC)'},Sedan:{seats:'4+1 seater',sim:'Dzire, Etios or Similar',img:'assets/sedan-v2.png',label:'SEDAN (AC)'},Ertiga:{seats:'6+1 seater',sim:'Ertiga, Carens or Similar',img:'assets/ertiga-v2.png',label:'SUV - ERTIGA (AC)'},Innova:{seats:'6+1 seater',sim:'Innova or Similar',img:'assets/innova-v2.png',label:'INNOVA (AC)'},'Innova Crysta':{seats:'7+1 seater',sim:'Innova Crysta or Similar',img:'assets/crysta-v2.png',label:'INNOVA CRYSTA (AC)'}};
function validPhone(v){
  v=String(v||'').replace(/\D/g,'');
  if(!/^[6-9]\d{9}$/.test(v))return false;
  if(Math.max(...[...new Set(v)].map(d=>v.split(d).length-1))>=6)return false;
  if(['9876543210','9123456789','8123456789','7123456789','6123456789','9012345678','8901234567'].includes(v))return false;
  return true;
}
function allowedCats(){return activeMode()==='outstation'?CAB_CATEGORIES:CAB_CATEGORIES.filter(c=>c!=='Innova Crysta');}
function payAnchor(){const nf=$('#customerName')?.closest('.field');const pb=$('#paymentBlock');return (nf&&pb&&pb.contains(nf))?nf:$('#payBtn');}
function injectCarStyles(){
  if($('#tmCarStyles'))return;
  const s=document.createElement('style');s.id='tmCarStyles';
  s.textContent='.tm-cars{margin:16px 0 8px}.tm-cars h4{margin:0 0 4px}.tm-cars .tm-cars-sub{font-size:12px;color:#777;margin:0 0 12px}.tm-car-grid{display:grid;grid-template-columns:1fr;gap:14px}@media(min-width:900px){.tm-car-grid{grid-template-columns:1fr 1fr}}.tm-car-opt{display:block;width:100%;text-align:center;padding:16px 14px;border:2px solid #eee;border-radius:16px;background:#fff;cursor:pointer;font:inherit;color:#111}.tm-car-opt.sel{border-color:#ffcc00;background:#fffbea}.tm-car-opt img{max-width:78%;max-height:120px;object-fit:contain;margin:0 auto 6px;display:block}.tm-car-price{font-size:26px;font-weight:900;color:#111}.tm-car-kind{font-size:12px;font-weight:800;color:#1b8fa8;margin-top:2px}.tm-car-sim{font-size:14px;margin:4px 0 10px;color:#333}.tm-car-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:5px 0;border-top:1px solid #f0f0f0;text-align:left}.tm-car-row span{color:#555}.tm-car-row b.ok{color:#16833b}.tm-car-btn{display:block;margin-top:12px;padding:12px;border-radius:999px;background:#ffcc00;font-weight:900;font-size:14px}.tm-car-opt.sel .tm-car-btn{background:#111;color:#ffcc00}';
  document.head.appendChild(s);
}
function ensureCarList(){
  let el=$('#carList');if(el)return el;
  el=document.createElement('div');el.id='carList';el.className='hidden';
  const anchor=$('#fareBox');
  if(anchor&&anchor.parentElement)anchor.parentElement.insertBefore(el,anchor);
  return el;
}
function hideCars(){
  currentFare=null;lastPayload=null;carFares={};carPayloads={};
  ['#carList','#fareBox','#paymentBlock'].forEach(s=>$(s)?.classList.add('hidden'));
}
function renderCarList(){
  injectCarStyles();
  const el=ensureCarList();if(!el)return;
  const cats=Object.keys(carFares);
  el.className='tm-cars';
  el.innerHTML='<h4>Choose your cab</h4><p class="tm-cars-sub">Tap a cab to continue. The final fare updates with your exact pickup &amp; drop address.</p><div class="tm-car-grid">'+cats.map(c=>{const r=carFares[c];const ci=CAR_INFO[c]||{};const out=activeMode()==='outstation';const tollOk=/toll included/i.test(r.mode||'');return `<button type="button" class="tm-car-opt" data-car="${escapeHtml(c)}"><img src="${ci.img||''}" alt="${escapeHtml(c)}"><div class="tm-car-price">${money(r.totalFare)}</div><div class="tm-car-kind">${escapeHtml(ci.label||c)} (${escapeHtml(ci.seats||'')})</div><div class="tm-car-sim">${escapeHtml(ci.sim||'')}</div><div class="tm-car-row"><span>Distance</span><b>${Math.round(r.distanceKm||0)} km</b></div>${out?`<div class="tm-car-row"><span>Toll, State Tax</span><b class="${tollOk?'ok':''}">${tollOk?'Included':'Excluded'}</b></div>`:(activeMode()==='local'?`<div class="tm-car-row"><span>Toll, State Tax</span><b>Excluded</b></div>`:'')}<div class="tm-car-row"><span>Parking</span><b>Paid by customer</b></div><div class="tm-car-row"><span>Advance to pay now</span><b>${money(r.advance)}</b></div><span class="tm-car-btn">Book Now</span></button>`;}).join('')+'</div>';
  $$('.tm-car-opt',el).forEach(b=>b.addEventListener('click',()=>selectCar(b.dataset.car)));
  setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'start'}),100);
}
function selectCar(cat){
  const r=carFares[cat];if(!r)return;
  const sel=$('#category');if(sel)sel.value=cat;
  lastPayload=carPayloads[cat];
  $$('.tm-car-opt').forEach(b=>b.classList.toggle('sel',b.dataset.car===cat));
  renderFare(r);
}
async function fareForCategory(p){
  try{return (await estimateFareFn(p)).data;}
  catch(fnErr){
    console.warn('estimateFare unavailable',fnErr);
    if(p.tripType!=='local')throw fnErr;
    const pkg=LOCAL_PACKAGE_RATES[p.category]?.[p.packageKm];
    if(!pkg)throw new Error('This local package is not available for the selected cab.');
    const extraHoursFare=Math.max(0,num(p.extraHours))*300;
    const petCharge=p.pet?750:0;
    const baseFare=pkg+extraHoursFare;
    const commissionPercent=num(pricing.commissionPercent);
    return {distanceKm:p.packageKm,baseFare,extraHoursFare,petCharge,nightCharge:0,totalFare:baseFare+petCharge,advance:(baseFare*commissionPercent/100)+petCharge,commissionPercent,mode:`${p.packageKm} km package`};
  }
}
async function estimate(opts){
  const silent=opts===true;hideMsg();
  const btn=$('#estimateBtn');
  const phone=($('#customerPhone')?.value||'').replace(/\D/g,'');
  if(!validPhone(phone)){msg('Please enter your real 10-digit mobile number to see the cars and fares.');$('#customerPhone')?.focus();return;}
  if(btn&&!btn.dataset.tmLabel)btn.dataset.tmLabel=btn.textContent;
  if(!silent&&btn){btn.disabled=true;btn.textContent='Calculating…';}
  try{
    validateBasics();
    const base=payloadForEstimate();
    if(silent){
      const cat=$('#category').value;const p={...base,category:cat};
      const r=await fareForCategory(p);
      lastPayload=p;carFares[cat]=r;carPayloads[cat]=p;renderFare(r,true);
    }else{
      const cats=allowedCats();
      const results=await Promise.allSettled(cats.map(c=>fareForCategory({...base,category:c})));
      carFares={};carPayloads={};
      results.forEach((x,i)=>{if(x.status==='fulfilled'){carFares[cats[i]]=x.value;carPayloads[cats[i]]={...base,category:cats[i]};}});
      if(!Object.keys(carFares).length){const bad=results.find(x=>x.status==='rejected');throw bad?bad.reason:new Error('No cabs are available for this trip.');}
      currentFare=null;lastPayload=null;
      ['#fareBox','#paymentBlock'].forEach(s=>$(s)?.classList.add('hidden'));
      renderCarList();
    }
  }catch(e){console.error('estimateFare',e);msg(e?.message||'Could not calculate the fare. Please try again.');}
  finally{if(!silent&&btn){btn.disabled=false;btn.textContent=btn.dataset.tmLabel||'See Cars & Fares';}}
}

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
function initAuth(){/* OTP removed: the advance payment itself is the proof */}
async function resolveCoupon(advance){
  const code=($('#couponCode')?.value||'').trim().toUpperCase();
  if(!code) return {code:'',discount:0,docId:null};
  const r=(await previewCouponFn({code,advance})).data;
  if(!r||!r.valid) throw new Error('Invalid coupon code. Please correct it or clear the field.');
  return {code:r.code,discount:Number(r.discount)||0,docId:r.docId||null};
}
async function createOrder(amount){const result=await createRazorpayOrderFn({amountPaise:Math.round(amount*100),amount:Math.round(amount*100)});return result.data;}
function bookingEndpoints(){
  const mode=activeMode();
  const from=mode==='outstation'?$('#pickup').value:(mode==='local'?$('#localCity').value:$('#airportCity').value);
  const to=mode==='outstation'?$('#destination').value:mode==='local'?from:$('#airport').value;
  const addrTyped=($('#pickupAddress')?.value||'').trim();
  const fullAddr=addrTyped?(addrTyped.toLowerCase().includes(String(from).toLowerCase())?addrTyped:`${addrTyped}, ${from}`):from;
  return {mode,from,to,fullAddr,dropAddr:($('#dropAddress')?.value||'').trim()};
}
async function pay(){
  if(!currentFare||!lastPayload) return msg('Please choose a cab first.');
  const phone=($('#customerPhone')?.value||'').replace(/\D/g,'');
  if(!validPhone(phone)){$('#paymentStatus').textContent='Please enter your real 10-digit mobile number.';$('#customerPhone')?.focus();return;}
  try{validateBasics();}catch(e){return msg(e.message);}
  if((($('#pickupAddress')?.value)||'').trim().length<5){$('#paymentStatus').textContent='Please enter your exact pickup address before paying.';$('#pickupAddress')?.focus();return;}
  const _multi=$$('#bookExtraCities input').some(i=>i.value.trim());
  if(activeMode()==='outstation'&&!_multi){
    if(($('#dropAddress')?.value||'').trim()&&!addrState.drop){$('#paymentStatus').textContent='Please choose your drop address from the suggestions list.';$('#dropAddress')?.focus();return;}
    if(addrState.drop&&!addrState.pickup){$('#paymentStatus').textContent='Please choose your pickup address from the suggestions list so the exact distance can be calculated.';$('#pickupAddress')?.focus();return;}
    if(addrState.pickup&&addrState.drop&&!addrFareActive){$('#paymentStatus').textContent='Updating your fare… please try again in a moment.';refreshAddrFare();return;}
  }
  const key=cfg.razorpayKeyId;if(!key||key.startsWith('REPLACE'))return msg('Razorpay Key ID is not configured in config.js.');
  $('#payBtn').disabled=true;$('#paymentStatus').textContent='Creating secure payment order…';
  try{
    const cp=await resolveCoupon(currentFare.advance);
    const payable=Math.round((currentFare.advance-cp.discount)*100)/100;
    payState={couponCode:cp.code,discount:cp.discount,docId:cp.docId,paid:payable};
    if(cp.discount>0)$('#paymentStatus').textContent=`Coupon applied! You saved ${money(cp.discount)}. Creating secure payment order…`;
    const ep=bookingEndpoints();
    const cab=lastPayload.category;
    const custName=($('#customerName')?.value||'').trim();
    const info={phone,name:custName||'Customer',fareRequest:lastPayload,advancePercent:currentFare.advancePercent,couponCode:cp.code,from:ep.from,to:ep.to,pickupAddress:ep.fullAddr,dropAddress:ep.dropAddr};
    const order=await createOrder(payable);const orderId=order.orderId||order.id;const amountPaise=Number(order.amount||Math.round(payable*100));
    const rzp=new Razorpay({key:order.keyId||key,amount:amountPaise,currency:'INR',order_id:orderId,name:'Taximela',description:`${ep.from} to ${ep.to}`,prefill:{name:custName,contact:phone},theme:{color:'#ffcc00'},
      modal:{ondismiss:()=>{$('#payBtn').disabled=false;}},
      handler:async response=>{
        const paymentId=response.razorpay_payment_id||response.paymentId;
        $('#paymentStatus').textContent='Payment received. Confirming your booking…';
        try{
          const res=await createWebsiteBookingFn({...info,orderId:response.razorpay_order_id||orderId,paymentId,signature:response.razorpay_signature||response.signature});
          const b=res.data||{};
          showStatus({bookingId:b.bookingId,from:ep.from,to:ep.to,cab,total:b.totalFare??currentFare.totalFare,phone,paid:payState.paid,discount:payState.discount,advanceFull:currentFare.advance});
          toast('Booking confirmed successfully.');
        }catch(e){
          console.error(e);
          $('#paymentStatus').textContent=`Payment received (ID: ${paymentId}) but the booking could not be completed: ${e.message||'unknown error'}. Please contact support with this payment ID.`;
        }
      }});
    rzp.on('payment.failed',e=>{$('#paymentStatus').textContent=e.error?.description||'Payment failed.';$('#payBtn').disabled=false});
    rzp.open();
  }catch(e){console.error(e);$('#paymentStatus').textContent=e.message||'Could not start payment.';$('#payBtn').disabled=false;}
}
function showStatus(b){
  ['#carList','#fareBox','#paymentBlock'].forEach(s=>$(s)?.classList.add('hidden'));
  $('#statusCard').classList.remove('hidden');
  $('#bookingIdText').textContent=b.bookingId;$('#routeText').textContent=`${b.from} → ${b.to}`;$('#cabText').textContent=b.cab;$('#totalText').textContent=money(b.total);
  if(b.paid!=null&&$('#paidText')&&$('#dueText')){
    $('#paidText').textContent=money(b.paid)+(b.discount>0?` (coupon saved ${money(b.discount)})`:'');
    $('#dueText').textContent=money(Math.max(0,b.total-(b.advanceFull??(b.paid+(b.discount||0)))));
  }
  pollStatus(b.bookingId,b.phone);
  $('#statusCard').scrollIntoView({behavior:'smooth',block:'center'});
}
function normalizeStatus(s){if(s==='Driver Arriving'||s==='Driver Accepted')return 'Driver Arriving';if(s==='On the way'||s==='Trip Started'||s==='Started')return 'On the way';if(s==='Completed'||s==='Awaiting Confirmation')return 'Completed';if(s==='Cancelled')return 'Cancelled';return 'Searching Driver';}
function pollStatus(bookingId,phone){
  clearInterval(statusTimer);
  const tick=async()=>{
    try{
      const d=(await bookingStatusFn({bookingId,phone})).data||{};
      const s=normalizeStatus(d.rideStatus||'Searching Driver');
      $('#statusPill').textContent=d.rideStatus||'Searching Driver';
      $('#statusTitle').textContent=s==='Cancelled'?'Booking cancelled':s==='Completed'?'Trip completed':'Your booking is live';
      $$('[data-status-step]').forEach(el=>el.classList.toggle('active',el.dataset.statusStep===s));
      if(d.driver)$('#cabText').textContent=[d.driver,d.driverPhone?'+91 '+d.driverPhone:'',d.driverCarNumber].filter(Boolean).join(' · ');
      if(s==='Completed'||s==='Cancelled')clearInterval(statusTimer);
    }catch(e){console.warn('status',e);}
  };
  tick();statusTimer=setInterval(tick,20000);
}

const placeCache = {}; // lowercase place name -> {lat,lng,name} (filled from Google Places)
function bindPlaceInput(el, kind){
  if(!el||el.dataset.tmPlaces)return;
  el.dataset.tmPlaces='1';
  el.removeAttribute('list');el.setAttribute('autocomplete','off');
  loadGoogleMaps().then(maps=>{
    if(!maps.places)return;
    const acOpts={componentRestrictions:{country:'in'},fields:['geometry','name','formatted_address','types']};
    if(kind==='airport')acOpts.types=['airport'];
    const ac=new maps.places.Autocomplete(el,acOpts);
    ac.addListener('place_changed',()=>{
      const pl=ac.getPlace();const loc=pl&&pl.geometry&&pl.geometry.location;
      if(!loc)return;
      const isCity=(pl.types||[]).some(t=>['locality','administrative_area_level_1','administrative_area_level_2','airport'].includes(t));
      const nm=kind==='airport'||isCity?(pl.name||el.value):String(pl.formatted_address||pl.name||el.value).replace(/,\s*India$/,'');
      el.value=nm;
      placeCache[String(nm).trim().toLowerCase()]={lat:loc.lat(),lng:loc.lng(),name:nm};
      hideCars();
    });
  }).catch(e=>console.warn('places autocomplete',e));
}
function setupAirportUI(ids){
  const dirEl=$(ids.dir),airEl=$(ids.air),cityEl=$(ids.city);
  if(!dirEl||!airEl||!cityEl)return;
  const toInput=(el,ph)=>{
    if(el.tagName==='INPUT')return el;
    const inp=document.createElement('input');inp.id=el.id;inp.type='text';inp.placeholder=ph;inp.autocomplete='off';inp.className=el.className;
    el.replaceWith(inp);return inp;
  };
  const air=toInput(airEl,'Search airport');
  const city=toInput(cityEl,'Search city');
  air.placeholder='Search airport';
  bindPlaceInput(air,'airport');bindPlaceInput(city,'city');
  if(!dirEl.dataset.tmDir){
    dirEl.dataset.tmDir='1';
    const label=()=>{city.placeholder=dirEl.value==='From Airport'?'Drop city':'Pickup city';};
    dirEl.addEventListener('change',label);label();
  }
}
function setBookAirportFromParams(params){
  const d=$('#airportDirection'),a=$('#airport'),c=$('#airportCity');
  if(d&&params.get('airportDirection'))d.value=params.get('airportDirection');
  if(a&&params.get('airport')){a.value=params.get('airport');}
  a?._tmRefresh?.();
  if(c&&params.get('airportCity'))c.value=params.get('airportCity');
}
function syncReturn(){$('#dropAddressField')?.classList.toggle('hidden',activeMode()!=='outstation');const show=activeMode()==='outstation'&&selectedTrip()==='roundtrip';$('#returnWrap')?.classList.toggle('hidden',!show);}
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
    pb.insertBefore(f,payAnchor());
    const g=document.createElement('div');g.className='field';g.id='dropAddressField';
    g.innerHTML='<label>Drop address (optional — fare updates by exact distance)</label><input id="dropAddress" placeholder="Search drop location" autocomplete="off">';
    pb.insertBefore(g,payAnchor());
    bindAddressInput('#pickupAddress','pickup');bindAddressInput('#dropAddress','drop');
  }
  $('#couponCode')?.closest('.field')?.classList.add('hidden');
}
async function initBook(){
  setupModes();setupNav();syncCabCategories();$('#customerEmail')?.closest('.field')?.classList.add('hidden');enhanceBookingUI();
  // Attach the primary booking actions immediately so slow mobile network/Firebase loading
  // cannot leave the visible buttons without click handlers.
  $('#estimateBtn')?.addEventListener('click',estimate);
  $('#payBtn')?.addEventListener('click',pay);
  ['#pickup','#destination','#localCity','#airportCity','#airportDirection','#airport','#package','#toll','#pet','#extraHours','#pickupDateTime','#returnDateTime'].forEach(s=>$(s)?.addEventListener('change',hideCars));
  document.addEventListener('change',e=>{if(e.target&&e.target.closest&&e.target.closest('#bookExtraCities'))hideCars();});
  const params=new URLSearchParams(location.search);
  const mode=params.get('mode'),category=params.get('category'),pickup=params.get('pickup'),destination=params.get('destination'),phone=params.get('phone');
  if(mode && ['outstation','local','airport'].includes(mode)){const tab=$(`.tab[data-mode="${mode}"]`);tab?.click();}
  const _init=await Promise.allSettled([loadPricing(),loadServiceCities()]);if(_init[0].status==='rejected'){console.warn('pricing',_init[0].reason);msg(_init[0].reason?.message||'Pricing could not be loaded. Please try again.');}cityOptions();syncCabCategories();setupAirportUI({dir:'#airportDirection',air:'#airport',city:'#airportCity'});
  ['#pickup','#destination','#localCity'].forEach(i=>bindPlaceInput($(i),'city'));
  $('#category')?.closest('.field,.tm-field')?.classList.add('hidden');if($('#toll'))$('#toll').value='tollIncl';
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
document.addEventListener('focusin',e=>{const el=e.target;if(el&&el.matches&&el.matches('input[list="bookCities"],input[list="homeCities"]'))bindPlaceInput(el,'city');});
window.__tmAppReady=true;
