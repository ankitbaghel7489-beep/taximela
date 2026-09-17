# Taxi Mela — production deployment package

This package is prepared for a production-style deployment of the Taxi Mela static website plus the Firebase 2nd-gen `estimateFare` callable function.

## Package structure

- Website pages are at the ZIP root so the folder can be imported directly into GitHub/Vercel/Netlify.
- `assets/` contains all supplied local image assets.
- `cloud-functions/estimateFare.js` is the trusted server-side fare calculator.
- `cloud-functions/package.json` contains Node 20 Firebase Function dependencies.
- `firebase.json` is ready for Firebase Hosting + Functions deployment.
- `vercel.json` is included for static frontend deployment on Vercel.
- `config.js` contains public Firebase client configuration and a placeholder for the browser-restricted Google Maps key.

## Recommended deployment architecture

1. Deploy the website root to Vercel (or Firebase Hosting).
2. Deploy `cloud-functions/` to the existing Firebase project `taximela-5bcae`.
3. Keep the Google Routes API key server-side as a Firebase Function secret.
4. Put a separate browser-restricted Google Maps JavaScript/Places key in `config.js`.
5. Configure Firestore rules for `websiteLeads` before public launch.

## Vercel frontend — quickest route

1. Create a GitHub repository and upload the contents of this package (not the outer ZIP folder).
2. Open Vercel and import that repository.
3. Framework preset: **Other** / static site.
4. Build command: **leave empty**.
5. Output directory: **`.`**.
6. Deploy.

Vercel will provide a public HTTPS URL that can be opened from any phone with internet access.

### Custom domain

After deployment, a custom domain can be connected in Vercel's project settings.

## Firebase Function deployment

From the package root:

```bash
firebase login
firebase use taximela-5bcae
cd cloud-functions
npm install
cd ..
firebase deploy --only functions:estimateFare
```

If the Firebase CLI asks to initialize the project, use the existing Firebase project and keep the included `firebase.json`.

### Server-only Google Routes key

Set the secret:

```bash
firebase functions:secrets:set GOOGLE_MAPS_API_KEY
```

Then deploy the function again:

```bash
firebase deploy --only functions:estimateFare
```

Do **not** put this Routes key in `config.js` or any browser code.

## Browser Google Maps key

`config.js` currently contains:

```js
googleMapsBrowserKey: "REPLACE_WITH_HTTP_REFERRER_RESTRICTED_MAPS_JS_KEY"
```

Replace only that value with a separate browser key restricted to the production domain. Enable only the browser APIs required by this site:

- Maps JavaScript API
- Places API (New)

The browser key is not the server Routes key.

## Firebase client configuration

The supplied Firebase web configuration is already present in `config.js`. These client configuration values are intended to be shipped to the browser. Firebase Security Rules and API restrictions are what protect the backend resources.

## Firestore data expected

### `settings/pricing`

- `rates.Hatchback.tollExcl`
- `rates.Hatchback.tollIncl`
- `rates.Hatchback.localRate`
- same fields for Sedan, Ertiga, Innova and Innova Crysta
- `commissionPercent`
- `supportNumber`
- `supportEmail`
- `supportWhatsapp`
- `officeAddress`

### `serviceCities`

Documents should contain an active field. Only `active == true` cities are considered serviceable by the function.

### `settings/vehicleCompatibility`

Used for admin-controlled compatibility/fallback messaging.

### `websiteLeads`

The public site writes booking, contact and driver enquiries here. Add your production Firestore security rules before launch.

## Fare model implemented

### Outstation / airport

`real road distance km × selected admin rate`

- Toll Excluded uses `tollExcl`.
- Toll Included uses `tollIncl`.
- No base fare.
- No minimum-km-per-day.
- No driver allowance.
- Pickup city must be serviceable.
- Distance is calculated server-side through Google Routes `computeRouteMatrix`.

### Local rental

Fixed packages:

| Category | 20 km | 40 km | 80 km | 120 km |
|---|---:|---:|---:|---:|
| Hatchback | ₹1,200 | ₹1,400 | ₹2,000 | ₹2,600 |
| Sedan | ₹1,500 | ₹1,800 | ₹2,200 | ₹2,800 |
| Ertiga | ₹1,800 | ₹2,000 | ₹2,500 | ₹3,400 |
| Innova | ₹2,200 | ₹2,600 | ₹2,600 | ₹4,800 |
| Innova Crysta | Quote | Quote | Quote | Quote |

For custom local trips:

- `distance <= 20 km`: category-specific fixed short-trip price.
- `distance > 20 km`: `distance × live localRate`.
- Innova Crysta has no fixed short-trip price in the supplied model and therefore returns a contact-for-quote response.
- Extra hours: ₹300/hour.

### Other charges

- First night: ₹500.
- Each additional night: ₹300.
- Pet: ₹750 flat.
- Total = base fare + pet + night.
- Advance = `(base fare × commissionPercent / 100) + pet`.
- No GST/tax line is added to the fare breakdown.

## Important pre-launch checks

1. Replace the browser Google Maps placeholder key.
2. Deploy `estimateFare` and set the Routes secret.
3. Confirm Firestore `settings/pricing` exists.
4. Populate `serviceCities` as needed.
5. Add restrictive Firestore rules for `websiteLeads`.
6. Test pickup/destination autocomplete on the final domain.
7. Test all three trip types: Outstation, Local Rental and Airport Transfer.
8. Replace demo testimonials with verified customer feedback.
9. Replace legal placeholder pages with final reviewed policies.

## Local test

From the package root:

```bash
py -m http.server 5500 --bind 0.0.0.0
```

Open `http://localhost:5500` on the PC.

For a public link, deploy the package to Vercel/Firebase Hosting rather than sharing a localhost URL.
