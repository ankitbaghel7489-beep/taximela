// Public web configuration. Firebase client configuration is safe to ship in a browser.
// Replace GOOGLE_MAPS_BROWSER_KEY with a browser-restricted key that has only Maps JavaScript API
// and Places API (New) enabled. Never put the server Routes API key here.
window.TAXIMELA_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCmQtNn8Q_3W02vo3AcTev7nWK48N236q4",
    appId: "1:1015904062385:web:6519187823dc6a0fd84b90",
    messagingSenderId: "1015904062385",
    projectId: "taximela-5bcae",
    authDomain: "taximela-5bcae.firebaseapp.com",
    storageBucket: "taximela-5bcae.firebasestorage.app"
  },
  googleMapsBrowserKey: "REPLACE_WITH_HTTP_REFERRER_RESTRICTED_MAPS_JS_KEY",
  functionsRegion: "asia-south1"
};
