// Development environment — placeholder Firebase config.
// Replace with your own Firebase project's config (Project settings → General → Your apps → SDK setup).
// Never commit real secrets for a public repo; for this project Firebase config is safe to expose
// client-side (it's not a secret — access is controlled by Firestore/Storage Security Rules),
// but keep a project-specific copy for clarity if you manage multiple environments.
export const environment = {
  production: false,
  useEmulators: false, // set true to talk to local Firebase Emulator Suite (see DEPLOYMENT.md)
  firebase: {
    apiKey: "AIzaSyDPl-gS3kAH6A7-BqleM4q-Loh4EkpbTZM",
  authDomain: "efootball-schedule-2026.firebaseapp.com",
  projectId: "efootball-schedule-2026",
  storageBucket: "efootball-schedule-2026.firebasestorage.app",
  messagingSenderId: "1086663020111",
  appId: "1:1086663020111:web:61ed92e731c540d605a43a",
    measurementId: 'REPLACE_WITH_MEASUREMENT_ID',
  },
  appName: 'PitchPro',
};


