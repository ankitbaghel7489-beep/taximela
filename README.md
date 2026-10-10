# Taxi Mela Website — Reference UI + Live Firebase Booking

This package keeps the **Taxi Mela Reference UI** as the visual base and connects the booking flow to the same Firebase project used by the Customer, Driver and Admin apps (`taximela-5bcae`).

## Connected
- `settings/pricing` — live cab rates and commission.
- `serviceCities` — active service-city list.
- `rides` — booking record used by the existing apps/admin.
- `activeRides` — live driver workflow used by the Driver App.
- `estimateFare` — server-side fare calculation.
- `createRazorpayOrder` + `verifyRazorpayPayment` — server-side Razorpay verification.
- Firebase Phone Auth / OTP for web customers.

## Booking flow
Reference UI → trip details → fare → phone OTP → Razorpay advance → verified payment → `rides` + `activeRides` → live `rideStatus`.

## Localhost
```bash
python -m http.server 5500
```
Open `http://localhost:5500/`.

## Production setup
1. Put the real Razorpay public Key ID in `config.js`.
2. Configure the matching Razorpay secrets in the existing Firebase Functions project.
3. Configure the Google Routes API secret used by `estimateFare`.
4. Enable Firebase Phone Authentication and authorize the production domain.
5. Deploy the included Cloud Function changes to the existing `taximela-5bcae` project. Do not create a second Firebase project.
6. Review Firestore Security Rules before launch because the website writes the same booking collections as the Customer App.

There is **no separate website admin pricing database** in this package.
