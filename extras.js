/* Taxi Mela website - Firebase-connected extras (same project as the apps).
   Contact details + policies + Driver Partner registration. Reads the same
   Firestore docs the Admin app edits. Existing booking code stays in app.js. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

const cfg = window.TAXIMELA_CONFIG;
const app = initializeApp(cfg.firebase);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function settings() {
  try { const s = await getDoc(doc(db, 'settings', 'pricing')); return s.exists() ? s.data() : {}; }
  catch (e) { console.warn('settings/pricing', e); return {}; }
}

/* ---------- Contact page: live support details from Admin > App Settings ---------- */
async function initContact() {
  const cards = $$('.cards .feature');
  if (cards.length < 4) return;
  const d = await settings();
  const digits = v => String(v || '').replace(/\D/g, '');
  const set = (i, html) => { const p = cards[i].querySelector('p'); if (p && html) p.innerHTML = html; };
  const num = d.supportNumber, wa = d.supportWhatsapp, mail = d.supportEmail, addr = d.officeAddress;
  if (num) set(0, `<a href="tel:+91${digits(num).slice(-10)}">${esc(num)}</a>`);
  if (wa) set(1, `<a href="https://wa.me/91${digits(wa).slice(-10)}" target="_blank" rel="noopener">${esc(wa)}</a>`);
  if (mail) set(2, `<a href="mailto:${esc(mail)}">${esc(mail)}</a>`);
  if (addr) set(3, esc(addr));
}

/* ---------- Policies: show the admin-uploaded PDF exactly as designed ---------- */
const POLICY = {
  terms: ['Terms & Conditions', 'termsAndConditionsUrl'],
  privacy: ['Privacy Policy', 'privacyPolicyUrl'],
  refund: ['Refund & Cancellation Policy', 'refundPolicyUrl'],
  driver: ['Driver Partner Agreement', 'driverAgreementUrl']
};
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script')); document.head.appendChild(s); });
}
async function initPolicy() {
  const box = $('#policyViewer'); if (!box) return;
  const key = new URLSearchParams(location.search).get('type') || 'privacy';
  const [title, field] = POLICY[key] || POLICY.privacy;
  const t = $('#policyTitle'); if (t) t.textContent = title;
  document.title = `${title} — Taxi Mela`;
  const d = await settings();
  const url = d[field];
  if (!url) { box.innerHTML = '<p class="small">This document is not available yet. Please check back soon.</p>'; return; }
  const link = $('#policyOpen'); if (link) { link.href = url; link.classList.remove('hidden'); }
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument(url).promise;
    box.innerHTML = '';
    const width = Math.min(box.clientWidth || 800, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const vp = page.getViewport({ scale: scale * dpr });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      c.style.cssText = `width:${width}px;max-width:100%;height:auto;display:block;margin:0 auto 14px;border:1px solid #e7e8ec;border-radius:10px;box-shadow:0 8px 24px rgba(20,25,30,.06)`;
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    console.warn('pdf render', e);
    box.innerHTML = `<p class="small">The document could not be displayed here. <a href="${esc(url)}" target="_blank" rel="noopener"><b>Open the PDF</b></a>.</p>`;
  }
}

/* ---------- Driver Partner registration (same data the Driver app writes) ---------- */
const CAR_TYPES = ['Hatchback', 'Sedan', 'Ertiga', 'Innova', 'Innova Crysta'];
const FUELS = ['Petrol', 'Diesel', 'CNG', 'Electric'];
const WORK_LOCATIONS = [
  'Anantpur, Kurnool, Kadapa, Chittoor, Nellore, Prakasam, Guntur, Andhra Pradesh',
  'Visakhapatnam, Kakinada, Rajahmundry, Vizianagaram, Srikakulam, Andhra Pradesh',
  'Itanagar, Arunachal Pradesh',
  'Guwahati, Silchar, Dibrugarh, Nagaon, Assam',
  'Patna, Gaya, Bhagalpur, Muzaffarpur, Biharsharif, Bihar',
  'Chandigarh, Chandigarh',
  'Raipur, Bhilai Nagar, Korba, Bilaspur, Durg, Chhattisgarh',
  'Silvassa, Dadar and Nagar Haveli',
  'Daman, Diu, Daman and Diu',
  'Delhi, Delhi',
  'Lucknow, Kanpur, Ghaziabad, Agra, Meerut, Uttar Pradesh',
  'Dehradun, Hardwar, Haldwani and Kathgodam, Rudrapur, Uttarakhand',
  'Faridabad, Gurgaon, Rohtak, Hisar, Panipat, Haryana',
  'Ludhiana, Amritsar, Jalandhar, Patiala, Bathinda, Punjab',
  'Mumbai, Pune, Nagpur, Nashik, Aurangabad, Maharashtra',
  'Jaipur, Jodhpur, Udaipur, Kota, Ajmer, Rajasthan',
  'Bangalore, Mysore, Mangalore, Hubli, Karnataka',
  'Chennai, Coimbatore, Madurai, Tiruchirappalli, Tamil Nadu',
  'Kolkata, Howrah, Durgapur, Siliguri, West Bengal',
  'Bhopal, Indore, Jabalpur, Gwalior, Madhya Pradesh'
];

function compress(file, max = 1600, q = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Could not read the photo.')), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Please choose a valid photo.')); };
    img.src = url;
  });
}
async function uploadPhoto(file, phone, type) {
  const blob = await compress(file);
  const r = sref(storage, `driver_documents/${phone}/${type}_${Date.now()}.jpg`);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(r);
}

function initDriver() {
  const form = $('#drvForm'); if (!form) return;
  const status = (id, t, ok) => { const e = $(id); if (e) { e.textContent = t; e.style.color = ok ? '#16833b' : ''; } };
  let confirmation = null, recaptcha = null;

  $('#drvCarType').innerHTML = CAR_TYPES.map(c => `<option>${c}</option>`).join('');
  $('#drvDrvCarType').innerHTML = CAR_TYPES.map(c => `<option>${c}</option>`).join('');
  $('#drvFuel').innerHTML = FUELS.map(c => `<option>${c}</option>`).join('');
  $('#drvLocations').innerHTML = WORK_LOCATIONS.map((l, i) => `<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:6px 0"><input type="checkbox" value="${esc(l)}" style="margin-top:3px"> <span>${esc(l)}</span></label>`).join('');
  $$('#drvLocations input').forEach(cb => cb.addEventListener('change', () => {
    if ($$('#drvLocations input:checked').length > 5) { cb.checked = false; status('#drvMsg', 'You can choose up to 5 work locations.'); }
  }));
  $$('[data-agreement]').forEach(a => a.href = 'policies.html?type=driver');

  $('#drvSendOtp').addEventListener('click', async () => {
    try {
      const phone = $('#drvPhone').value.replace(/\D/g, '');
      if (phone.length !== 10) throw new Error('Enter a valid 10-digit mobile number.');
      if (!recaptcha) { recaptcha = new RecaptchaVerifier(auth, 'drvRecaptcha', { size: 'normal' }); await recaptcha.render(); }
      confirmation = await signInWithPhoneNumber(auth, `+91${phone}`, recaptcha);
      $('#drvOtp').classList.remove('hidden'); $('#drvVerifyOtp').disabled = false; $('#drvSendOtp').disabled = true;
      status('#drvAuthStatus', 'OTP sent. Enter the 6-digit OTP.');
    } catch (e) {
      console.error(e); status('#drvAuthStatus', e.message || 'Could not send OTP.');
      try { recaptcha?.clear(); recaptcha = null; } catch { }
    }
  });

  $('#drvVerifyOtp').addEventListener('click', async () => {
    try {
      if (!confirmation) throw new Error('Send OTP first.');
      await confirmation.confirm($('#drvOtp').value.trim());
      $('#drvPhone').readOnly = true;
      status('#drvAuthStatus', 'Phone verified ✓', true);
      const phone = $('#drvPhone').value.replace(/\D/g, '');
      const ex = await getDoc(doc(db, 'drivers', phone));
      if (ex.exists() && ex.data().agreedToPartnerAgreement && ex.data().status) {
        $('#drvExisting').classList.remove('hidden');
        $('#drvExisting').textContent = `This number is already registered as a Taxi Mela driver partner (status: ${ex.data().status}). Please log in to the Taxi Mela Driver app with this number.`;
        return;
      }
      $('#drvDetails').classList.remove('hidden');
      $('#drvDetails').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { console.error(e); status('#drvAuthStatus', 'Invalid OTP. Please try again.'); }
  });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = $('#drvSubmit'); const msg = t => status('#drvMsg', t);
    try {
      if (!auth.currentUser) throw new Error('Please verify your phone number first.');
      const phone = auth.currentUser.phoneNumber.replace('+91', '');
      const v = id => $(id).value.trim();
      const req = [['#drvOwner', 'owner name'], ['#drvAgency', 'agency name'], ['#drvPan', 'PAN'], ['#drvCarName', 'car name'], ['#drvCarNumber', 'car number'], ['#drvDrvName', 'driver name'], ['#drvDrvPhone', 'driver mobile / WhatsApp'], ['#drvAadhaar', 'Aadhaar number'], ['#drvLicence', 'driving licence number']];
      for (const [id, label] of req) if (!v(id)) throw new Error(`Please enter ${label}.`);
      if (v('#drvAadhaar').replace(/\D/g, '').length < 12) throw new Error('Please enter a valid 12-digit Aadhaar number.');
      const files = {};
      for (const [id, key, label] of [['#fAadhaar', 'aadhaar', 'Aadhaar card'], ['#fLicence', 'licence', 'driving licence'], ['#fLive', 'live', 'selfie'], ['#fRc', 'rc', 'RC'], ['#fInsurance', 'insurance', 'insurance'], ['#fPermit', 'permit', 'permit'], ['#fCarOwner', 'car_with_owner', 'car-with-owner']]) {
        const f = $(id).files[0]; if (!f) throw new Error(`Please add the ${label} photo.`);
        files[key] = f;
      }
      const locs = $$('#drvLocations input:checked').map(i => i.value);
      if (!locs.length) throw new Error('Please choose at least one work location.');
      if (!$('#drvAgree').checked) throw new Error('Please agree to the Driver Partner Agreement to continue.');

      btn.disabled = true; msg('Uploading documents… please keep this page open.');
      const url = {};
      for (const k of Object.keys(files)) url[k] = await uploadPhoto(files[k], phone, k);

      msg('Saving your application…');
      const ref = doc(db, 'drivers', phone);
      const existing = await getDoc(ref);
      const base = {
        name: v('#drvOwner'), phone, agencyName: v('#drvAgency'), ownerName: v('#drvOwner'),
        email: v('#drvEmail'), pan: v('#drvPan').toUpperCase(),
        car: $('#drvCarType').value, carNumber: v('#drvCarNumber').toUpperCase(),
        workLocations: locs, agreedToPartnerAgreement: true, agreedToPartnerAgreementAt: serverTimestamp()
      };
      if (!existing.exists()) {
        await setDoc(ref, {
          ...base, online: false, status: 'Pending', licence: 'Submitted', police: 'Not Submit', rc: 'Submitted',
          insurance: 'Submitted', aadhaar: 'Submitted', bankAccount: '—', currentLocation: '—', membership: 'No Plan',
          membershipExpiry: '—', membershipHistory: [], wallet: 0.0, earnings: 0.0, platformFee: 0.0, walletHistory: [],
          rating: 0.0, trips: 0, createdAt: serverTimestamp(), source: 'website'
        });
      } else {
        await setDoc(ref, base, { merge: true });
      }
      await addDoc(collection(db, 'drivers', phone, 'cars'), {
        name: v('#drvCarName'), number: v('#drvCarNumber').toUpperCase(), type: $('#drvCarType').value, fuel: $('#drvFuel').value,
        seats: '4+1 Seater', status: 'Pending', rc: 'Submitted', insurance: 'Submitted', permit: 'Submitted', photoWithOwner: 'Submitted',
        rcPhotoUrl: url.rc, insurancePhotoUrl: url.insurance, permitPhotoUrl: url.permit, photoWithOwnerUrl: url.car_with_owner,
        createdAt: serverTimestamp()
      });
      await addDoc(collection(db, 'drivers', phone, 'teamDrivers'), {
        name: v('#drvDrvName'), phone: v('#drvDrvPhone').replace(/\D/g, '').slice(-10), aadhaar: v('#drvAadhaar'), licenceNumber: v('#drvLicence'),
        carType: $('#drvDrvCarType').value, status: 'Pending', licence: 'Submitted', police: 'Not Submit',
        aadhaarPhotoUrl: url.aadhaar, licencePhotoUrl: url.licence, livePhotoUrl: url.live, createdAt: serverTimestamp()
      });
      form.classList.add('hidden');
      $('#drvDone').classList.remove('hidden'); $('#drvDone').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      console.error(e);
      const m = String(e?.code || '').includes('storage/') ? 'Photo upload failed. Please check your internet and try again.' : (e.message || 'Could not submit. Please try again.');
      msg(m); btn.disabled = false;
    }
  });
}

initContact(); initPolicy(); initDriver();
