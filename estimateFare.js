// TAXI MELA — Cloud Function
// Copy this file's handler into your existing functions/index.js (or export it from there)
// and deploy. This is a 2nd-gen callable function. Requires Node 20+ and the Firebase Admin SDK.
// Set the server-only Routes API secret with:
//   firebase functions:secrets:set GOOGLE_MAPS_API_KEY

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const Razorpay = require('razorpay');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const GOOGLE_MAPS_API_KEY = defineSecret('GOOGLE_MAPS_API_KEY');
const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');

// App-level constants that are not managed by Admin Pricing Management.
const STATIC = { nightFirst: 500, nightAdditional: 300, petCharge: 750, extraHours: 300 };

const n = v => Number(v || 0);

function nightCharge({tripType, isOneWay, pickupDateTime, returnDateTime, totalDistanceKm}) {
  if (tripType !== 'outstation' || isOneWay || !returnDateTime || !pickupDateTime) return 0;
  const pickup = new Date(pickupDateTime);
  const ret = new Date(returnDateTime);
  if (!Number.isFinite(pickup.getTime()) || !Number.isFinite(ret.getTime()) || ret <= pickup) return 0;
  const oneWayDistance = totalDistanceKm / 1.8;
  const travelMinutes = (oneWayDistance / 45) * 60;
  const arrival = new Date(pickup.getTime() + Math.round(travelMinutes) * 60000);
  const arrivalDate = new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate());
  const returnDate = new Date(ret.getFullYear(), ret.getMonth(), ret.getDate());
  const nights = Math.max(0, Math.floor((returnDate - arrivalDate) / (24 * 60 * 60 * 1000)));
  return nights ? STATIC.nightFirst + Math.max(0, nights - 1) * STATIC.nightAdditional : 0;
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
  const rates = data.rates || {};
  const categories = ['Hatchback','Sedan','Ertiga','Innova','Innova Crysta'];
  for (const category of categories) {
    if (!rates[category]) throw new HttpsError('failed-precondition', `Admin pricing is missing for ${category}.`);
  }
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

  if (data.tripType === 'outstation') {
    const routePoints = data.routePoints;
    if (!await pickupIsServiceable(routePoints?.[0] || {})) {
      throw new HttpsError('failed-precondition', 'The selected pickup city is not currently serviceable.');
    }
    distanceKm = await routeDistanceKm(routePoints);
    const multiplier = Number(data.distanceMultiplier || 1);
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 2) throw new HttpsError('invalid-argument', 'Invalid distance multiplier.');
    distanceKm *= multiplier;
    const rateKey = data.tollMode === 'tollIncl' ? 'tollIncl' : 'tollExcl';
    const rate = n(pricing.rates[category][rateKey]);
    baseFare = distanceKm * rate;
    mode = data.tollMode === 'tollIncl' ? 'Toll included' : 'Toll excluded';
  } else if (data.tripType === 'local' || data.tripType === 'airport') {
    if (data.tripType === 'local') {
      const packageKm = n(data.packageKm);
      if (![20, 40, 80, 120].includes(packageKm)) {
        throw new HttpsError('invalid-argument', 'Please select a valid local package.');
      }
      const packageRates = {
        Hatchback: {20:1200, 40:1400, 80:2000, 120:2600},
        Sedan: {20:1500, 40:1800, 80:2200, 120:2800},
        Ertiga: {20:1800, 40:2000, 80:2500, 120:3400},
        Innova: {20:2200, 40:2600, 80:2600, 120:4800}
      };
      const pkg = packageRates[category]?.[packageKm];
      if (!pkg) throw new HttpsError('failed-precondition', 'This local package is not configured for the selected cab.');
      distanceKm = packageKm;
      baseFare = pkg;
      mode = `${packageKm} km package`;
      extraHoursFare = n(data.extraHours) * 300;
      baseFare += extraHoursFare;
    } else {
      const points = data.routePoints;
      if (!Array.isArray(points) || points.length < 2) {
        throw new HttpsError('invalid-argument', 'Airport and city coordinates are required.');
      }
      if (!await pickupIsServiceable(points[0] || {})) {
        throw new HttpsError('failed-precondition', 'The selected pickup city is not currently serviceable.');
      }
      const a = points[0], b = points[1];
      const toRad = x => x * Math.PI / 180;
      const R = 6371;
      const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
      const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
      distanceKm = Math.max(1, Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h)) * 1.3));
      const fixed = {Hatchback:800, Sedan:1200, Ertiga:1600, Innova:2500}[category];
      if (distanceKm <= 20 && fixed != null) {
        baseFare = fixed;
        mode = 'Airport transfer (fixed)';
      } else {
        baseFare = distanceKm * n(pricing.rates[category].localRate);
        mode = 'Airport transfer (per km)';
      }
    }
  } else {
    throw new HttpsError('invalid-argument', 'Unsupported trip type.');
  }

  const petCharge = data.pet === true ? STATIC.petCharge : 0;
  const night = nightCharge({tripType: data.tripType, isOneWay: data.isOneWay !== false, pickupDateTime: data.pickupDateTime, returnDateTime: data.returnDateTime, totalDistanceKm: distanceKm});
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


// Razorpay: create one server-side order for each advance payment.
// The secret is never sent to the browser.
exports.createRazorpayOrder = onCall({
  region: 'asia-south1',
  secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET],
  cors: true,
  timeoutSeconds: 20
}, async request => {
  const data = request.data || {};
  const amountPaise = Number(data.amountPaise ?? data.amount);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise > 100000000) {
    throw new HttpsError('invalid-argument', 'Invalid payment amount.');
  }

  const keyId = RAZORPAY_KEY_ID.value();
  const keySecret = RAZORPAY_KEY_SECRET.value();
  if (!keyId || !keySecret) {
    throw new HttpsError('failed-precondition', 'Razorpay keys are not configured on the server.');
  }

  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const safeAmountPaise = Math.round(amountPaise);
  const receipt = String(data.receipt || `tm_${Date.now()}`).slice(0, 40);

  try {
    const order = await client.orders.create({
      amount: safeAmountPaise,
      currency: 'INR',
      receipt,
      notes: {
        tripType: String(data.tripType || '').slice(0, 40),
        category: String(data.category || '').slice(0, 40)
      }
    });
    return {
      id: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId
    };
  } catch (error) {
    console.error('Razorpay order creation failed', error);
    throw new HttpsError('internal', 'Could not create the Razorpay order.');
  }
});

// Razorpay requires signature verification on the server after Checkout.
// We also fetch the order from Razorpay and compare the payment/order amount.
exports.verifyRazorpayPayment = onCall({
  region: 'asia-south1',
  secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET],
  cors: true,
  timeoutSeconds: 20
}, async request => {
  const data = request.data || {};
  const orderId = String(data.orderId || '');
  const paymentId = String(data.paymentId || '');
  const signature = String(data.signature || '');

  if (!orderId || !paymentId || !signature) {
    throw new HttpsError('invalid-argument', 'Missing Razorpay payment verification fields.');
  }

  const keySecret = RAZORPAY_KEY_SECRET.value();
  if (!keySecret) throw new HttpsError('failed-precondition', 'Razorpay secret is not configured.');

  const generated = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const valid = generated.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(signature));

  if (!valid) {
    throw new HttpsError('permission-denied', 'Razorpay payment signature verification failed.');
  }

  const client = new Razorpay({
    key_id: RAZORPAY_KEY_ID.value(),
    key_secret: keySecret
  });

  try {
    const order = await client.orders.fetch(orderId);
    const payment = await client.payments.fetch(paymentId);

    if (String(payment.order_id) !== orderId) {
      throw new HttpsError('failed-precondition', 'Payment does not belong to this order.');
    }

    if (Number(payment.amount) !== Number(order.amount)) {
      throw new HttpsError('failed-precondition', 'Payment amount does not match the Razorpay order.');
    }

    // Do not treat an authorisation as a booking until Razorpay reports it
    // as captured. Dashboard auto-capture should normally make this immediate.
    if (String(payment.status) !== 'captured') {
      throw new HttpsError('failed-precondition', `Payment status is ${payment.status}.`);
    }

    await db.collection('razorpayPayments').doc(orderId).set({
      orderId,
      paymentId,
      amount: Number(payment.amount),
      currency: payment.currency || 'INR',
      status: payment.status,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    }, {merge: true});

    return {
      verified: true,
      orderId,
      paymentId,
      amount: Number(payment.amount),
      status: payment.status
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Razorpay verification failed', error);
    throw new HttpsError('internal', 'Could not verify the Razorpay payment.');
  }
});
