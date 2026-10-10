import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';

const cfg = window.TAXIMELA_CONFIG;
const firebaseApp = initializeApp(cfg.firebase);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp, cfg.functionsRegion || 'asia-south1');
const estimateFareFn = httpsCallable(functions, 'estimateFare');
const createRazorpayOrderFn = httpsCallable(functions, 'createRazorpayOrder');
const verifyRazorpayPaymentFn = httpsCallable(functions, 'verifyRazorpayPayment');

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
const AIRPORT_COORDS = {
  'Devi Ahilya Bai Holkar Airport':[22.7225,75.8011], 'Raja Bhoj Airport':[23.2875,77.3374], 'Sardar Vallabhbhai Patel Airport':[23.0772,72.6347]
};
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
  return [...new Set([...(names.length?names:[]),...Object.keys(CITY_COORDS)])].sort((a,b)=>a.localeCompare(b));
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
function initHome(){
  setupNav();
  /* tabs, radios, Add City, car cards: ui.js me (Firebase se independent) */
  $('#homeSubmit')?.addEventListener('click',async()=>{
    const mode=$('.tm-tab.active')?.dataset.homeMode||'outstation';
    const service=$('.tm-radio[data-home-service].active')?.dataset.homeService||'local';
    const phone=$('#homePhone')?.value.replace(/\D/g,'')||'';
    const out=$('#homeDistance');
    const go=params=>{if(phone)params.set('phone',phone);location.href=`book.html?${params.toString()}`;};
    if(phone && phone.length!==10){out.textContent='Mobile number 10 digits ka hona chahiye.';out.classList.add('error');return;}
    out.classList.remove('error');
    if(mode==='outstation'){
      const pickup=$('#homePickup')?.value.trim(),destination=$('#homeDestination')?.value.trim();
      if(!pickup||!destination){out.textContent='Pickup aur destination city select karein.';out.classList.add('error');return;}
      if(pickup.toLowerCase()===destination.toLowerCase()){out.textContent='Pickup aur destination same nahi ho sakte.';out.classList.add('error');return;}
      const values=[$('#homePickup')?.value,...$$('#homeExtraCities input').map(i=>i.value),$('#homeDestination')?.value].filter(Boolean);
      const points=values.map(getCoord).filter(Boolean);
      if(points.length!==values.length){out.textContent='Selected city list se city choose karein.';out.classList.add('error');return;}
      out.textContent='Google Maps se driving distance calculate ho rahi hai…';
      const btn=$('#homeSubmit');btn.disabled=true;
      try{let distance=await googleDrivingDistance(points);const roundtrip=$('.tm-radio[data-home-trip].active')?.dataset.homeTrip==='roundtrip';if(roundtrip)distance=Math.round(distance*1.8*10)/10;const params=new URLSearchParams({mode:'outstation',pickup,destination,distanceKm:String(distance),trip:roundtrip?'roundtrip':'oneway'});go(params);}catch(e){console.error(e);out.textContent=e.message||'Distance calculate nahi ho paaya.';out.classList.add('error');}finally{btn.disabled=false;}
      return;
    }
    if(service==='local'){
      const city=$('#homeLocalCity')?.value.trim(),pkg=$('#homePackage')?.value||'20';
      if(!city){out.textContent='Local rental ke liye city select karein.';out.classList.add('error');return;}
      if(!getCoord(city)){out.textContent='List se valid city select karein.';out.classList.add('error');return;}
      const params=new URLSearchParams({mode:'local',localCity:city,package:pkg});go(params);return;
    }
    const city=$('#homeAirportCity')?.value.trim(),direction=$('#homeAirportDirection')?.value||'',airport=$('#homeAirport')?.value||'';
    if(!city||!direction||!airport){out.textContent='Airport city, direction aur airport select karein.';out.classList.add('error');return;}
    const cityPoint=getCoord(city),airportPoint=getCoord(airport);
    if(!cityPoint||!airportPoint){out.textContent='Selected airport/city ke coordinates available nahi hain.';out.classList.add('error');return;}
    out.textContent='Google Maps se driving distance calculate ho rahi hai…';
    const btn=$('#homeSubmit');btn.disabled=true;
    try{const distance=await googleDrivingDistance([cityPoint,airportPoint]);const params=new URLSearchParams({mode:'airport',airportCity:city,airportDirection:direction,airport,distanceKm:String(distance)});go(params);}catch(e){console.error(e);out.textContent=e.message||'Distance calculate nahi ho paaya.';out.classList.add('error');}finally{btn.disabled=false;}
  });
  renderHomeServiceFields();
  loadServiceCities().finally(populateHomeCityList);
}

function toast(msg){const el=$('#toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),4000)}
function msg(text){const el=$('#formMsg');if(!el)return;el.textContent=text;el.classList.remove('hidden');}
function hideMsg(){ $('#formMsg')?.classList.add('hidden'); }
function setLoading(btn,on,text='Working…'){if(!btn)return;btn.disabled=on;btn.textContent=on?text:btn.dataset.defaultText||'Continue';}
function cityOptions(){
  const names=serviceCities.map(x=>String(x.name||x.city||x.cityName||'')).filter(Boolean);
  const cities=[...new Set([...(names.length?names:[]),...Object.keys(CITY_COORDS)])].sort((a,b)=>a.localeCompare(b));
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
  if(mode==='outstation') return [$('#pickup')?.value,$('#destination')?.value].map(getCoord).filter(Boolean);
  if(mode==='airport'){const city=$('#airportCity')?.value, airport=$('#airport')?.value;return [getCoord(city),getCoord(airport)].filter(Boolean);}
  return [];
}
function activeMode(){return $('.tab.active')?.dataset.mode||'outstation';}
function tripType(){return activeMode();}
function selectedTrip(){return $('.radio.active')?.dataset.trip||'oneway';}
function validateBasics(){
  const mode=activeMode();
  if(mode==='outstation' && (!$('#pickup').value||!$('#destination').value)) throw new Error('Please select pickup city and destination city.');
  if(mode==='local' && !$('#localCity').value) throw new Error('Please select the city for local rental.');
  if(mode==='airport' && (!$('#airportCity').value||!$('#airport').value||!$('#airportDirection').value)) throw new Error('Please select city, airport and transfer direction.');
  if(mode==='outstation' && $('#pickup').value===$('#destination').value) throw new Error('Pickup and destination cannot be the same.');
}
function payloadForEstimate(){
  const mode=activeMode();
  const points=routePointsForMode(mode);
  if(mode==='outstation' && points.length<2) throw new Error('Route coordinates are unavailable for the selected cities.');
  if(mode==='airport' && points.length<2) throw new Error('Airport/city coordinates are unavailable.');
  if(mode==='local' && ![20,40,80,120].includes(num($('#package')?.value))) throw new Error('Please select a local package.');
  const dt=$('#pickupDateTime').value||new Date().toISOString().slice(0,16); const ret=$('#returnDateTime').value||'';
  return {tripType:mode,category:$('#category').value,tollMode:$('#toll').value,packageKm:num($('#package')?.value),extraHours:num($('#extraHours')?.value),pet:$('#pet').checked,pickupDateTime:new Date(dt).toISOString(),returnDateTime:ret?new Date(ret).toISOString():null,routePoints:points,distanceMultiplier:mode==='outstation'&&selectedTrip()==='roundtrip'?1.8:1,isOneWay:mode==='outstation'?selectedTrip()==='oneway':true};
}
function fallbackFare(){ throw new Error('Live fare service is unavailable. Please try again after the Firebase function is deployed.'); }
function renderFare(r){currentFare=r;$('#fareBox')?.classList.remove('hidden');$('#fareAmount').textContent=money(r.totalFare);$('#fareDistance').textContent=`${Number(r.distanceKm||0).toFixed(0)} km · ${r.mode||''}`;$('#fareAdvance').textContent=money(r.advance);$('#fareLabel').textContent=`${$('#category').value} · ${selectedTrip()==='roundtrip'?'Round Trip':activeMode()}`;$('#customerBlock')?.classList.remove('hidden');$('#paymentBlock')?.classList.add('hidden');}
async function estimate(){hideMsg();$('#estimateBtn').disabled=true;$('#estimateBtn').textContent='Calculating…';try{validateBasics();const p=payloadForEstimate();try{const result=await estimateFareFn(p);renderFare(result.data);toast('Fare estimate ready. Enter your details to continue.');}catch(fnErr){console.warn('estimateFare unavailable',fnErr);if(activeMode()!=='local')throw fnErr;const category=$('#category').value;const packageKm=num($('#package').value);const pkg=LOCAL_PACKAGE_RATES[category]?.[packageKm];if(!pkg)throw new Error('This local package is not available for the selected cab.');const extraHours=Math.max(0,num($('#extraHours').value));const extraHoursFare=extraHours*300;const petCharge=$('#pet').checked?750:0;const baseFare=pkg+extraHoursFare;const commissionPercent=num(pricing.commissionPercent);const totalFare=baseFare+petCharge;const advance=(baseFare*commissionPercent/100)+petCharge;renderFare({distanceKm:packageKm,baseFare,extraHoursFare,petCharge,nightCharge:0,totalFare,advance,commissionPercent,mode:`${packageKm} km package`});toast('Local package fare calculated.');}}catch(e){console.error('estimateFare',e);msg(e?.message||'Could not calculate the fare. Please try again.');}finally{$('#estimateBtn').disabled=false;$('#estimateBtn').textContent='Check Price & Book Cab';}}

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
  send.addEventListener('click',async()=>{try{const phone=$('#customerPhone').value.replace(/\D/g,'');if(phone.length!==10)throw new Error('Enter a valid 10-digit mobile number.');if(!recaptcha){recaptcha=new RecaptchaVerifier(auth,'recaptcha-container',{size:'normal'});await recaptcha.render();}const confirmationResult=await signInWithPhoneNumber(auth,`+91${phone}`,recaptcha);confirmation=confirmationResult;$('#otp').classList.remove('hidden');$('#verifyOtpBtn').disabled=false;$('#authStatus').textContent='OTP sent. Enter the 6-digit OTP.';send.disabled=true;}catch(e){console.error(e);$('#authStatus').textContent=e.message||'Could not send OTP.';try{recaptcha?.clear();recaptcha=null;}catch{}}});
  $('#verifyOtpBtn')?.addEventListener('click',async()=>{try{if(!confirmation)throw new Error('Send OTP first.');await confirmation.confirm($('#otp').value.trim());$('#authStatus').textContent='Phone verified ✓';$('#authStatus').style.color='#16833b';$('#paymentBlock').classList.remove('hidden');$('#payBtn').disabled=false;}catch(e){$('#authStatus').textContent='Invalid OTP. Please try again.';}});
}
async function createOrder(amount){const result=await createRazorpayOrderFn({amountPaise:Math.round(amount*100),amount:Math.round(amount*100)});return result.data;}
async function pay(){
  if(!currentFare) return msg('Calculate the fare first.'); if(!auth.currentUser) return msg('Please verify your phone number first.');
  const key=cfg.razorpayKeyId;if(!key||key.startsWith('REPLACE'))return msg('Razorpay Key ID is not configured in config.js.');
  $('#payBtn').disabled=true;$('#paymentStatus').textContent='Creating secure payment order…';
  try{const order=await createOrder(currentFare.advance);const orderId=order.orderId||order.id;const amountPaise=Number(order.amount||Math.round(currentFare.advance*100));const rzp=new Razorpay({key:order.keyId||key,amount:amountPaise,currency:'INR',order_id:orderId,name:'Taxi Mela',description:`${$('#pickup')?.value||$('#localCity')?.value||$('#airportCity')?.value||''} to ${$('#destination')?.value||$('#airport')?.value||''}`,prefill:{name:$('#customerName').value,contact:$('#customerPhone').value,email:$('#customerEmail').value},theme:{color:'#ffcc00'},handler:async response=>{try{const verified=await verifyRazorpayPaymentFn({orderId:response.razorpay_order_id||response.orderId,paymentId:response.razorpay_payment_id||response.paymentId,signature:response.razorpay_signature||response.signature});if(verified.data?.verified!==true)throw new Error('Payment verification failed.');await createBooking(response.razorpay_payment_id||response.paymentId);}catch(e){console.error(e);$('#paymentStatus').textContent=e.message||'Payment verification failed.';$('#payBtn').disabled=false;}}});rzp.on('payment.failed',e=>{$('#paymentStatus').textContent=e.error?.description||'Payment failed.';$('#payBtn').disabled=false});rzp.open();}catch(e){console.error(e);$('#paymentStatus').textContent=e.message||'Could not start payment.';$('#payBtn').disabled=false;}
}
async function createBooking(paymentId){
  const mode=activeMode();const now=new Date();const bookingId=`TM${String(now.getTime()).slice(-10)}`;const name=$('#customerName').value.trim()||'Customer';const phone=$('#customerPhone').value.replace(/\D/g,'');const from=mode==='outstation'?$('#pickup').value:(mode==='local'?$('#localCity').value:$('#airportCity').value);const to=mode==='outstation'?$('#destination').value:mode==='local'?from:$('#airport').value;
  const pickupDt=$('#pickupDateTime').value?new Date($('#pickupDateTime').value):now;const returnDt=$('#returnDateTime').value?new Date($('#returnDateTime').value):null;const paymentMethod='Razorpay';
  try{
    const ride=await addDoc(collection(db,'rides'),{id:bookingId,customer:name,customerPhone:phone,driver:'Not Assigned',from,to,amount:currentFare.totalFare,baseFare:currentFare.baseFare,hasPet:$('#pet').checked,status:'Ongoing',date:pickupDt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),paymentMethod,advancePaid:currentFare.advance,couponCode:$('#couponCode').value.trim().toUpperCase(),couponDiscount:0,razorpayPaymentId:paymentId,createdAt:serverTimestamp()});
    const pts=routePointsForMode(mode);const active=await addDoc(collection(db,'activeRides'),{id:bookingId,customer:name,customerPhone:phone,driver:null,pickup:from,pickupLat:pts[0]?.lat??null,pickupLng:pts[0]?.lng??null,destination:to,pickupAddress:from,distance:`${Math.round(currentFare.distanceKm||0)} km`,fare:currentFare.totalFare,baseFare:currentFare.baseFare,hasPet:$('#pet').checked,platformFee:currentFare.totalFare*(num(pricing.commissionPercent)/100),paymentStatus:'Paid',rideStatus:'Searching Driver',liveLocation:'—',paymentMethod,cabType:$('#category').value,extraPerKm:0,tollIncluded:$('#toll').value==='tollIncl',tollRate:num(pricing.rates?.[$('#category').value]?.[$('#toll').value]),isLocal:mode!=='outstation',bookingType:mode,isOneWay:selectedTrip()==='oneway',totalDistance:Math.round(currentFare.distanceKm||0),pickupDate:`${pickupDt.getDate()}/${pickupDt.getMonth()+1}/${pickupDt.getFullYear()}`,pickupTime:pickupDt.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}),returnDate:returnDt?`${returnDt.getDate()}/${returnDt.getMonth()+1}/${returnDt.getFullYear()}`:null,returnTime:returnDt?returnDt.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):null,nightCharge:num(currentFare.nightCharge),requestedVehicle:$('#category').value,assignedVehicle:null,matchType:'auto',customerApproval:'Not Required',razorpayPaymentId:paymentId,createdAt:serverTimestamp()});
    currentBooking={docId:active.id,bookingId};showStatus(active.id,bookingId,from,to,$('#category').value,currentFare.totalFare);toast('Booking confirmed successfully.');
  }catch(e){console.error(e);$('#paymentStatus').textContent=`Payment verified, but booking creation failed: ${e.message}`;$('#payBtn').disabled=false;}
}
function showStatus(docId,bookingId,from,to,cab,total){$('#statusCard').classList.remove('hidden');$('#bookingIdText').textContent=bookingId;$('#routeText').textContent=`${from} → ${to}`;$('#cabText').textContent=cab;$('#totalText').textContent=money(total);listenStatus(docId);$('#statusCard').scrollIntoView({behavior:'smooth',block:'center'});}
function normalizeStatus(s){if(s==='Driver Arriving'||s==='Driver Accepted')return 'Driver Arriving';if(s==='On the way'||s==='Trip Started'||s==='Started')return 'On the way';if(s==='Completed'||s==='Awaiting Confirmation')return 'Completed';if(s==='Cancelled')return 'Cancelled';return 'Searching Driver';}
function listenStatus(docId){onSnapshot(doc(db,'activeRides',docId),snap=>{if(!snap.exists())return;const d=snap.data();const s=normalizeStatus(d.rideStatus||'Searching Driver');$('#statusPill').textContent=d.rideStatus||'Searching Driver';$('#statusTitle').textContent=s==='Cancelled'?'Booking cancelled':s==='Completed'?'Trip completed':'Your booking is live';$$('[data-status-step]').forEach(el=>el.classList.toggle('active',el.dataset.statusStep===s));if(d.driver)$('#cabText').textContent=`${d.driver} · ${d.assignedVehicle||$('#category').value}`;});}
async function initBook(){
  setupModes();setupNav();initAuth();syncCabCategories();
  // Attach the primary booking actions immediately so slow mobile network/Firebase loading
  // cannot leave the visible buttons without click handlers.
  $('#estimateBtn')?.addEventListener('click',estimate);
  $('#payBtn')?.addEventListener('click',pay);
  const params=new URLSearchParams(location.search);
  const mode=params.get('mode'),category=params.get('category'),pickup=params.get('pickup'),destination=params.get('destination'),phone=params.get('phone');
  if(mode && ['outstation','local','airport'].includes(mode)){const tab=$(`.tab[data-mode="${mode}"]`);tab?.click();}
  const _init=await Promise.allSettled([loadPricing(),loadServiceCities()]);if(_init[0].status==='rejected'){console.warn('pricing',_init[0].reason);msg(_init[0].reason?.message||'Pricing load nahi ho paaya.');}cityOptions();syncCabCategories();
  if(category && $('#category') && [...$('#category').options].some(o=>o.value===category))$('#category').value=category;
  if(pickup&&$('#pickup'))$('#pickup').value=pickup;
  if(destination&&$('#destination'))$('#destination').value=destination;
  if(params.get('localCity')&&$('#localCity'))$('#localCity').value=params.get('localCity');
  if(params.get('airportCity')&&$('#airportCity'))$('#airportCity').value=params.get('airportCity');
  if(params.get('airportDirection')&&$('#airportDirection'))$('#airportDirection').value=params.get('airportDirection');
  if(params.get('airport')&&$('#airport'))$('#airport').value=params.get('airport');
  if(params.get('package')&&$('#package'))$('#package').value=params.get('package');
  if(phone&&$('#customerPhone'))$('#customerPhone').value=phone;
  if(params.get('trip')==='roundtrip')$('.radio[data-trip="roundtrip"]')?.click();
  if($('#pickupDateTime'))$('#pickupDateTime').value=new Date(Date.now()+3600000).toISOString().slice(0,16);
  if($('#returnDateTime'))$('#returnDateTime').value=new Date(Date.now()+86400000).toISOString().slice(0,16);
}
function initGeneric(){setupNav();}
if($('#estimateBtn'))initBook();else if($('#homeSubmit'))initHome();else initGeneric();
window.__tmAppReady=true;
