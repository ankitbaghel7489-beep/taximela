import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';

const cfg = window.TAXIMELA_CONFIG;
const STATIC = window.TAXIMELA_STATIC;
const app = initializeApp(cfg.firebase);
const db = getFirestore(app);
const functions = getFunctions(app, cfg.functionsRegion || 'asia-south1');
const estimateFareFn = httpsCallable(functions, 'estimateFare');

const DEFAULT_RATES = {
  Hatchback: { tollExcl: 16, tollIncl: 19, localRate: 28 },
  Sedan: { tollExcl: 17, tollIncl: 22, localRate: 28 },
  Ertiga: { tollExcl: 22, tollIncl: 26, localRate: 32 },
  Innova: { tollExcl: 35, tollIncl: 40, localRate: 38 },
  'Innova Crysta': { tollExcl: 40, tollIncl: 45, localRate: 42 }
};
let pricing = { rates: DEFAULT_RATES, commissionPercent: 15, supportNumber:'', supportEmail:'', supportWhatsapp:'', officeAddress:'' };
let serviceCities = [];
let vehicleCompatibility = {};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const money = n => `₹${Math.round(Number(n)||0).toLocaleString('en-IN')}`;
const num = n => Number(n || 0);

function showToast(message) {
  const t = $('#toast'); if (!t) return;
  t.textContent = message; t.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(()=>t.classList.remove('show'), 3800);
}

async function loadPricing() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'pricing'));
    if (snap.exists()) pricing = { ...pricing, ...snap.data(), rates: { ...DEFAULT_RATES, ...(snap.data().rates || {}) } };
  } catch (e) { console.warn('Pricing read failed; using last bundled fallback rates.', e); }
  document.dispatchEvent(new CustomEvent('pricing-ready', { detail: pricing }));
  renderRates();
}
async function loadServiceCities() {
  try {
    const q = query(collection(db, 'serviceCities'), where('active','==',true));
    const snap = await getDocs(q); serviceCities = snap.docs.map(d=>({id:d.id,...d.data()}));
  } catch (e) { console.warn('serviceCities read failed', e); }
}
async function loadCompatibility() {
  try {
    const snap = await getDoc(doc(db,'settings','vehicleCompatibility'));
    if (snap.exists()) vehicleCompatibility = snap.data();
  } catch (e) { console.warn('vehicleCompatibility read failed', e); }
}

function renderRates() {
  $$('[data-rate-category]').forEach(el=>{
    const c=el.dataset.rateCategory, r=pricing.rates?.[c] || DEFAULT_RATES[c];
    if (!r) return;
    const excl=el.querySelector('[data-rate="tollExcl"]'); if(excl) excl.textContent=money(r.tollExcl)+'/km';
    const incl=el.querySelector('[data-rate="tollIncl"]'); if(incl) incl.textContent=money(r.tollIncl)+'/km';
    const local=el.querySelector('[data-rate="localRate"]'); if(local) local.textContent=money(r.localRate)+'/km';
  });
  $$('[data-support-number]').forEach(a=>{ a.textContent=pricing.supportNumber || 'Support number'; if(pricing.supportNumber) a.href=`tel:${pricing.supportNumber}`; });
  $$('[data-support-email]').forEach(a=>{ a.textContent=pricing.supportEmail || 'support@taximela.in'; if(pricing.supportEmail) a.href=`mailto:${pricing.supportEmail}`; });
  $$('[data-support-whatsapp]').forEach(a=>{ a.textContent=pricing.supportWhatsapp || 'WhatsApp support'; if(pricing.supportWhatsapp) a.href=`https://wa.me/${String(pricing.supportWhatsapp).replace(/\D/g,'')}`; });
  $$('[data-office-address]').forEach(el=>el.textContent=pricing.officeAddress || 'Office address will appear here.');
}

function setupNav() {
  const btn=$('.menu-btn'), nav=$('.navlinks');
  if(btn && nav) btn.addEventListener('click',()=>nav.classList.toggle('open'));
}

function initGooglePlaces() {
  if (!cfg.googleMapsBrowserKey || cfg.googleMapsBrowserKey.startsWith('REPLACE')) return;
  if (customElements.get('gmp-place-autocomplete')) return loadPlacesScript();
  loadPlacesScript();
}
function loadPlacesScript() {
  if (window.google?.maps?.importLibrary) return setupAutocompleteElements();
  const s=document.createElement('script');
  s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.googleMapsBrowserKey)}&v=weekly&libraries=places`;
  s.async=true; s.defer=true; s.onload=setupAutocompleteElements; s.onerror=()=>console.warn('Google Maps JS failed to load');
  document.head.appendChild(s);
}
async function setupAutocompleteElements() {
  if (!window.google?.maps?.places?.PlaceAutocompleteElement) return;
  $$('gmp-place-autocomplete').forEach(el=>{
    if (el.dataset.bound) return;
    el.dataset.bound='1';
    el.includedRegionCodes=['in'];
    el.addEventListener('gmp-select', async ev=>{
      try {
        const place = ev.placePrediction.toPlace();
        await place.fetchFields({fields:['displayName','formattedAddress','location']});
        el.dataset.placeJson=JSON.stringify({name:place.displayName, address:place.formattedAddress, lat:place.location?.lat(), lng:place.location?.lng()});
        el.dispatchEvent(new CustomEvent('taximela-place-selected',{bubbles:true,detail:JSON.parse(el.dataset.placeJson)}));
      } catch(e){ console.warn('Place selection failed',e); }
    });
  });
}

function getSelectedPlace(el){ try{return JSON.parse(el?.dataset.placeJson||'null')}catch{return null} }
function initHomePickup(){
  const pickup=$('#home-pickup');
  const btn=$('#home-fare-btn');
  if(!pickup || !btn) return;
  const updateLink=()=>{
    const place=getSelectedPlace(pickup);
    if(!place) { btn.href='book.html'; return; }
    const params=new URLSearchParams({
      pickupName:place.name||'',
      pickupAddress:place.address||'',
      pickupLat:String(place.lat ?? ''),
      pickupLng:String(place.lng ?? '')
    });
    btn.href=`book.html?${params.toString()}`;
  };
  pickup.addEventListener('taximela-place-selected', updateLink);
}

function applyPickupFromQuery(){
  const pickup=$('#booking-form .route-point');
  if(!pickup) return;
  const q=new URLSearchParams(location.search);
  const name=q.get('pickupName');
  const lat=q.get('pickupLat');
  const lng=q.get('pickupLng');
  if(!name || lat===null || lng===null) return;
  const place={name,address:q.get('pickupAddress')||name,lat:Number(lat),lng:Number(lng)};
  pickup.dataset.placeJson=JSON.stringify(place);
  try { pickup.value=name; } catch(e) {}
}

function serviceCityMatch(place){
  if(!place || !serviceCities.length) return true; // graceful if rules are not readable yet
  const needle=(place.name||place.address||'').toLowerCase();
  return serviceCities.some(c => needle.includes(String(c.name||c.city||c.title||'').toLowerCase()) || (c.name && String(c.name).toLowerCase()===needle));
}

function localFare(category, distanceKm, packageKm, extraHours) {
  const r=pricing.rates?.[category] || DEFAULT_RATES[category];
  let base=0, mode='';
  if (packageKm && STATIC.localPackages[category]?.[packageKm]) { base=STATIC.localPackages[category][packageKm]; mode=`${packageKm} km package`; }
  else if (distanceKm <= 20) {
    const fixed=STATIC.localFixed[category];
    if (fixed == null) return {error:'No fixed short-trip price is configured for Innova Crysta. Please contact us for a quote.'};
    base=fixed; mode='short-trip fixed';
  } else { base=distanceKm*r.localRate; mode='custom distance'; }
  const extra=num(extraHours)*STATIC.extraHours;
  return {base, extra, mode};
}
function nightCharge(start, end) {
  if(!start||!end) return 0;
  const diff=new Date(end)-new Date(start); if(diff<=0) return 0;
  const nights=Math.ceil(diff/(24*60*60*1000));
  return STATIC.nightFirst + Math.max(0,nights-1)*STATIC.nightAdditional;
}
function localEstimate(data) {
  let baseResult;
  if(data.tripType==='local') baseResult=localFare(data.category,num(data.distanceKm),num(data.packageKm),num(data.extraHours));
  if(baseResult?.error) return baseResult;
  const pet=data.pet?STATIC.petCharge:0, night=nightCharge(data.pickupDateTime,data.returnDateTime);
  const baseFare=(baseResult?.base||0)+(baseResult?.extra||0);
  return { distanceKm:num(data.distanceKm), baseFare, baseComponent:baseResult?.base||0, extraHoursFare:baseResult?.extra||0, petCharge:pet, nightCharge:night, totalFare:baseFare+pet+night, advance:(baseFare*(num(pricing.commissionPercent)/100))+pet, mode:baseResult?.mode };
}

function renderFare(result) {
  const box=$('#fare-result'); if(!box) return;
  if(result?.error){box.innerHTML=`<div class="alert">${result.error}</div>`;return;}
  box.innerHTML=`
    <h3>Fare estimate</h3>
    <div class="fare-lines">
      <div class="fare-line"><span>${result.mode || 'Trip fare'}</span><strong>${money(result.baseFare)}</strong></div>
      ${num(result.extraHoursFare)?`<div class="fare-line"><span>Extra hours</span><strong>${money(result.extraHoursFare)}</strong></div>`:''}
      ${num(result.nightCharge)?`<div class="fare-line"><span>Night halt</span><strong>${money(result.nightCharge)}</strong></div>`:''}
      ${num(result.petCharge)?`<div class="fare-line"><span>Pet charge</span><strong>${money(result.petCharge)}</strong></div>`:''}
      <div class="fare-line"><span>Distance</span><strong>${num(result.distanceKm).toFixed(1)} km</strong></div>
    </div>
    <div class="fare-total"><span>Total</span><span>${money(result.totalFare)}</span></div>
    <div class="advance"><b>Advance at booking: ${money(result.advance)}</b><br><span class="small" style="color:#ccc">Remaining balance is settled later. No GST/tax line is added.</span></div>`;
}

function collectBookingForm() {
  const form=$('#booking-form'); if(!form) return null;
  const fd=new FormData(form); const type=fd.get('tripType');
  const places=$$('.route-point',form).map(el=>getSelectedPlace(el)).filter(Boolean);
  return { tripType:type, category:fd.get('category'), tollMode:fd.get('tollMode')||'tollExcl', packageKm:num(fd.get('packageKm')), distanceKm:0, extraHours:num(fd.get('extraHours')), pet:fd.get('pet')==='on', pickupDateTime:fd.get('pickupDateTime'), returnDateTime:fd.get('returnDateTime'), places, name:fd.get('name'), phone:fd.get('phone'), email:fd.get('email'), message:fd.get('message') };
}

async function estimateBooking(data) {
  const box=$('#fare-result'); if(box) box.innerHTML='<div class="small">Calculating your route fare…</div>';
  try {
    const payload={...data}; delete payload.name; delete payload.phone; delete payload.email; delete payload.message; delete payload.distanceKm;
    if(['outstation','local','airport'].includes(data.tripType)) {
      if(data.places.length<2) throw new Error('Select pickup and destination to calculate the fare.');
      if(data.tripType==='outstation' && !serviceCityMatch(data.places[0])) throw new Error('This pickup city is not currently serviceable. Please choose an active service city.');
      payload.routePoints=data.places.map(p=>({lat:p.lat,lng:p.lng,name:p.name,address:p.address}));
    }
    const res=await estimateFareFn(payload);
    renderFare(res.data);
    return res.data;
  } catch(e) {
    console.warn('Server estimate failed.',e);
    if(box) box.innerHTML=`<div class="alert">${e.message || 'Could not calculate the fare right now. Please try again.'}</div>`;
    return null;
  }
}

function initBooking() {
  const form=$('#booking-form'); if(!form) return;
  const typeTabs=$$('.tab[data-trip]');
  const routeFields=$('#route-fields'), localFields=$('#local-fields'), tollToggle=$('#toll-toggle'), addBtn=$('#add-destination'), routeList=$('#route-list');
  const routeHelp=$('#route-help');

  const setType=t=>{
    form.querySelector('[name=tripType]').value=t;
    typeTabs.forEach(b=>b.classList.toggle('active',b.dataset.trip===t));
    routeFields.classList.toggle('hidden',false);
    localFields.classList.toggle('hidden',t!=='local');
    tollToggle?.classList.toggle('hidden',t==='local');
    addBtn?.classList.toggle('hidden',t!=='outstation');
    // Local rental and airport transfer use one pickup + one destination.
    // Multi-city is reserved for outstation.
    if(t!=='outstation' && routeList){
      [...routeList.querySelectorAll('.route-row')].slice(1).forEach(row=>row.remove());
    }
    if(routeHelp){
      routeHelp.innerHTML = t==='local'
        ? 'Select pickup and destination. The actual road distance is calculated automatically; choose a rental package if required.'
        : t==='airport'
          ? 'Select your pickup location and airport destination. The actual road distance is calculated automatically before the fare is shown.'
          : 'Select pickup and destination to calculate the fare automatically. Add more cities for a multi-city route.';
    }
    const pkg=form.querySelector('[name=packageKm]'); if(pkg) pkg.disabled=t!=='local';
    const extra=form.querySelector('[name=extraHours]'); if(extra) extra.disabled=t!=='local';
  };
  typeTabs.forEach(b=>b.addEventListener('click',()=>setType(b.dataset.trip)));
  setType('outstation');

  $$('.toll-choice').forEach(b=>b.addEventListener('click',()=>{
    $$('.toll-choice').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    form.querySelector('[name=tollMode]').value=b.dataset.toll;
    estimateBooking(collectBookingForm());
  }));

  function addDestination(){
    const row=document.createElement('div'); row.className='route-row';
    row.innerHTML=`<div class="field"><label>Destination</label><gmp-place-autocomplete class="route-point" placeholder="Search city / town / village"></gmp-place-autocomplete></div><button class="icon-btn remove-route" type="button" aria-label="Remove destination">×</button>`;
    routeList.appendChild(row); initGooglePlaces();
    row.querySelector('.remove-route').addEventListener('click',()=>{row.remove(); estimateBooking(collectBookingForm());});
  }
  addBtn?.addEventListener('click',addDestination);

  form.addEventListener('input',()=>{
    clearTimeout(form.estimateTimer);
    form.estimateTimer=setTimeout(()=>estimateBooking(collectBookingForm()),500);
  });
  form.addEventListener('change',()=>estimateBooking(collectBookingForm()));
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const data=collectBookingForm();
    const fare=await estimateBooking(data); if(!fare) return;
    try {
      await addDoc(collection(db,'websiteLeads'),{type:'booking-interest',createdAt:new Date(),name:data.name||'',phone:data.phone||'',email:data.email||'',message:data.message||'',tripType:data.tripType,category:data.category,fareEstimate:fare,totalFare:fare.totalFare,advance:fare.advance});
      showToast('Booking enquiry received. Our team will contact you.');
      form.reset();
      // Restore the default route UI after reset.
      setType('outstation');
    } catch(e){ showToast('Fare calculated, but the enquiry could not be saved. Please try again.'); }
  });
  document.addEventListener('taximela-place-selected',()=>estimateBooking(collectBookingForm()));
  initGooglePlaces();
  initHomePickup();
  setTimeout(applyPickupFromQuery, 700);
}

async function submitLead(form, type) {
  const fd=new FormData(form); const data=Object.fromEntries(fd.entries());
  try { await addDoc(collection(db,'websiteLeads'),{...data,type,createdAt:new Date()}); showToast('Thanks — your enquiry has been received.'); form.reset(); }
  catch(e){ console.error(e); showToast('Could not submit right now. Please try again.'); }
}
function initLeadForms(){
  $$('form[data-lead-form]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();submitLead(form,form.dataset.leadForm);}));
}

function renderVehicleCompatibility(){
  const el=$('#compatibility-note'); if(!el || !vehicleCompatibility) return;
  const text=vehicleCompatibility.note || vehicleCompatibility.description || vehicleCompatibility.fallback || '';
  if(text) el.textContent=text;
  const selected=$('#category')?.value;
  const suggestions=vehicleCompatibility.suggestions || vehicleCompatibility.fallbackCategories || vehicleCompatibility.categories;
  if(suggestions && selected && suggestions[selected]) {
    const list=Array.isArray(suggestions[selected]) ? suggestions[selected] : [suggestions[selected]];
    el.textContent = `Admin suggestion: ${list.join(', ')}`;
  }
}

function initPage(){
  setupNav(); loadPricing(); loadServiceCities(); loadCompatibility().then(renderVehicleCompatibility); initBooking(); initLeadForms(); initGooglePlaces();
  document.addEventListener('pricing-ready',()=>{
    const select=$('#category'); if(select) select.dispatchEvent(new Event('change'));
    const c=$('#category')?.value; const rates=pricing.rates?.[c]; if(rates){const ex=$('[data-live-out-excl]'); const inc=$('[data-live-out-incl]'); if(ex)ex.textContent=money(rates.tollExcl)+'/km'; if(inc)inc.textContent=money(rates.tollIncl)+'/km';}
  });
}

window.TaxiMela={pricing, localEstimate, nightCharge, estimateBooking};
initPage();
