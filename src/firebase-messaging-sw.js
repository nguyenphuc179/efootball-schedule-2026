// Firebase Cloud Messaging background service worker.
// Handles push notifications received while the app is not in the foreground (PWA installed / tab closed).
// This file must be served from the site root (angular.json copies it via the "assets" list at build time —
// see DEPLOYMENT.md for the one-line build step that copies it into dist/).

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

// NOTE: duplicate the same values as src/environments/environment.prod.ts.
// Service workers cannot import TypeScript/Angular environment files directly.
firebase.initializeApp({
    apiKey: "AIzaSyDPl-gS3kAH6A7-BqleM4q-Loh4EkpbTZM",
    authDomain: "efootball-schedule-2026.firebaseapp.com",
    projectId: "efootball-schedule-2026",
    storageBucket: "efootball-schedule-2026.firebasestorage.app",
    messagingSenderId: "1086663020111",
    appId: "1:1086663020111:web:61ed92e731c540d605a43a",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'PitchPro';
  const options = {
    body: payload.notification?.body ?? '',
    icon: 'assets/icons/icon-192x192.png',
    badge: 'assets/icons/icon-72x72.png',
    data: payload.data,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(clients.openWindow(url));
});
