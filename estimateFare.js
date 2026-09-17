// TAXI MELA — Cloud Function
// Copy this file's handler into your existing functions/index.js (or export it from there)
// and deploy. This is a 2nd-gen callable function. Requires Node 20+ and the Firebase Admin SDK.
// Set the server-only Routes API secret with:
//   firebase functions:secrets:set GOOGLE_MAPS_API_KEY

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const GOOGLE_MAPS_API_KEY = defineSecret('GOOGLE_MAPS_API_KEY');

// STATIC app constants. Do not move these into Firestore unless the Flutter app's
// admin-editable model is intentionally changed too.
const STATIC = {
  localPackages: {
    Hatchback: { 20: 1200, 40: 1400, 80: 2000, 120: 2600 },
    Sedan: { 20: 1500, 40: 1800, 80: 2200, 120: 2800 },
    Ertiga: { 20: 1800, 40: 2000, 80: 2500, 120: 3400 },
    Innova: { 20: 2200, 40: 2600, 80: 2600, 120: 4800 },
    'Innova Crysta': {}
  },
  localFixed: { Hatchback: 800, Sedan: 1200, Ertiga: 1600, Innova: 2500, 'Innova Crysta': null },
  nightFirst: 500,
  nightAdditional: 300,
  petCharge: 750,
  extraHours: 300
};

const DEFAULT_RATES = {
  Hatchback: { tollExcl: 16, tollIncl: 19, localRate: 28 },
  Sedan: { tollExcl: 17, tollIncl: 22, localRate: 28 },
  Ertiga: { tollExcl: 22, tollIncl: 26, localRate: 32 },
  Innova: { tollExcl: 35, tollIncl: 40, localRate: 38 },
  'Innova Crysta': { tollExcl: 40, tollIncl: 45, localRate: 42 }
};

const n = v => Number(v || 0);

function nightsBetween(start, end) {
  if (!start || !end) return 0;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}
function nightCharge(start, end) {
  const nights = nightsBetween(start, end);
  return nights ? STATIC.nightFirst + Math.max(0, nights - 1) * STATIC.nightAdditional : 0;
}

function localBase(category, distanceKm, packageKm, extraHours) {
  if (packageKm && STATIC.localPackages[category]?.[packageKm]) {
    return { base: STATIC.localPackages[category][packageKm], mode: `${packageKm} km package` };
  }
  if (distanceKm <= 20) {
    const fixed = STATIC.localFixed[category];
    if (fixed == null) throw new HttpsError('failed-precondition', 'No fixed short-trip price is configured for Innova Crysta. Please contact us for a quote.');
    return { base: fixed, mode: 'short-trip fixed' };
  }
  const rate = n(DEFAULT_RATES[category]?.localRate);
  return { base: distanceKm * rate, mode: 'custom distance' };
}

function validateNumber(value, name, min = 0) {
  const x = Number(value);
  if (!Number.isFinite(x) || x < min) throw new HttpsError('invalid-argument', `${name} is invalid.`);
  return x;
}

async function getPricing() {
  const snap = await db.doc('settings/pricing').get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'settings/pricing is missing.');
  const data = snap.data();
  const rates = { ...DEFAULT_RATES, ...(data.rates || {}) };
  return { ...data, rates, commissionPercent: n(data.commissionPercent) };
}

async function pickupIsServiceable(pickup) {
  const snap = await db.collection('serviceCities').where('active', '==', true).get();
  if (snap.empty) return true; // preserve availability if the collection has not been populated yet.
  const hay = `${pickup.name || ''} ${pickup.address || ''}`.toLowerCase();
  return snap.docs.some(d => {
    const x = d.data();
    const name = String(x.name || x.city || x.cityName || x.title || '').toLowerCase();
    return name && hay.includes(name);
  });
}

async function routeDistanceKm(routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    throw new HttpsError('invalid-argument', 'At least two route points are required.');
  }
  let totalMeters = 0;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const origin = routePoints[i], destination = routePoints[i + 1];
    for (const p of [origin, destination]) {
      validateNumber(p?.lat, 'Route latitude', -90);
      validateNumber(p?.lng, 'Route longitude', -180);
    }
    const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY.value(),
        'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration'
      },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
        destinations: [{ waypoint: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } } }],
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE'
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new HttpsError('internal', `Google Routes API failed: ${body.slice(0, 300)}`);
    }
    const text = await response.text();
    const rows = text.split('\n').map(s => s.trim()).filter(Boolean).map(s => JSON.parse(s));
    const meters = rows.find(r => Number.isFinite(r.distanceMeters))?.distanceMeters;
    if (!Number.isFinite(meters)) throw new HttpsError('internal', 'Google Routes returned no distance.');
    totalMeters += meters;
  }
  return totalMeters / 1000;
}

exports.estimateFare = onCall({
  region: 'asia-south1',
  secrets: [GOOGLE_MAPS_API_KEY],
  cors: true,
  timeoutSeconds: 30
}, async request => {
  const data = request.data || {};
  const pricing = await getPricing();
  const category = String(data.category || '');
  if (!pricing.rates[category]) throw new HttpsError('invalid-argument', 'Unknown cab category.');

  let distanceKm = 0;
  let baseFare = 0;
  let mode = '';
  let extraHoursFare = 0;

  if (data.tripType === 'outstation' || data.tripType === 'airport') {
    const routePoints = data.routePoints;
    if (!await pickupIsServiceable(routePoints?.[0] || {})) {
      throw new HttpsError('failed-precondition', 'The selected pickup city is not currently serviceable.');
    }
    distanceKm = await routeDistanceKm(routePoints);
    const rateKey = data.tollMode === 'tollIncl' ? 'tollIncl' : 'tollExcl';
    const rate = n(pricing.rates[category][rateKey]);
    baseFare = distanceKm * rate;
    mode = data.tripType === 'airport'
      ? `Airport transfer • ${data.tollMode === 'tollIncl' ? 'Toll included' : 'Toll excluded'}`
      : (data.tollMode === 'tollIncl' ? 'Toll included' : 'Toll excluded');
  } else if (data.tripType === 'local') {
    distanceKm = await routeDistanceKm(data.routePoints);
    const packageKm = n(data.packageKm);
    if (packageKm && ![20, 40, 80, 120].includes(packageKm)) throw new HttpsError('invalid-argument', 'Invalid local package.');
    if (packageKm) {
      const pkg = STATIC.localPackages[category]?.[packageKm];
      if (!pkg) {
        if (category === 'Innova Crysta') throw new HttpsError('failed-precondition', 'Innova Crysta has no fixed local package yet. Please contact us for a quote.');
        throw new HttpsError('invalid-argument', 'This local package is not configured.');
      }
      baseFare = pkg;
      mode = `${packageKm} km package`;
    } else if (distanceKm <= 20) {
      const fixed = STATIC.localFixed[category];
      if (fixed == null) throw new HttpsError('failed-precondition', 'No fixed short-trip price is configured for Innova Crysta. Please contact us for a quote.');
      baseFare = fixed;
      mode = 'short-trip fixed';
    } else {
      baseFare = distanceKm * n(pricing.rates[category].localRate);
      mode = 'custom distance';
    }
    extraHoursFare = n(data.extraHours) * STATIC.extraHours;
    baseFare += extraHoursFare;
  } else {
    throw new HttpsError('invalid-argument', 'Unsupported trip type.');
  }

  const petCharge = data.pet === true ? STATIC.petCharge : 0;
  const night = nightCharge(data.pickupDateTime, data.returnDateTime);
  const totalFare = baseFare + petCharge + night;
  const advance = (baseFare * pricing.commissionPercent / 100) + petCharge;

  return {
    distanceKm: Number(distanceKm.toFixed(3)),
    baseFare: Number(baseFare.toFixed(2)),
    extraHoursFare: Number(extraHoursFare.toFixed(2)),
    petCharge,
    nightCharge: night,
    totalFare: Number(totalFare.toFixed(2)),
    advance: Number(advance.toFixed(2)),
    commissionPercent: pricing.commissionPercent,
    mode
  };
});
