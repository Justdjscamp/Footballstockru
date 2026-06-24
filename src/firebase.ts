import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getDatabase } from 'firebase/database';
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from 'firebase/app-check';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Включаем Debug Provider только в режиме разработки (Vite DEV mode)
const isDev = !!(import.meta as any).env?.DEV;
(self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = isDev;

let appCheckProvider;

if (Capacitor.isNativePlatform()) {
  // Нативная среда: инициализируем плагин App Check перед использованием
  // debugToken равен true только в режиме разработки. Для продакшена он станет false автоматически.
  FirebaseAppCheck.initialize({
    debugToken: isDev,
    isTokenAutoRefreshEnabled: true
  }).catch(console.error);

  // Используем CustomProvider для маршрутизации запросов из веб-слоя в нативный
  appCheckProvider = new CustomProvider({
    getToken: async () => {
      try {
        const result = await FirebaseAppCheck.getToken({ forceRefresh: false });
        // В плагине токен приходит строкой, а expireTime нужно парсить, 
        // но для CustomProvider достаточно просто вернуть token и заглушку времени.
        return {
          token: result.token,
          expireTimeMillis: Date.now() + 60 * 60 * 1000,
        };
      } catch (error) {
        console.error("AppCheck CustomProvider error:", error);
        throw error;
      }
    }
  });
} else {
  // Веб-среда: штатный ReCaptcha
  appCheckProvider = new ReCaptchaV3Provider('6LcyxdYsAAAAAErfWDwMlxaQk_lys1Qqdak7nWuX');
}

export const appCheck = initializeAppCheck(app, {
  provider: appCheckProvider,
  isTokenAutoRefreshEnabled: true
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */

let _auth;
if (Capacitor.isNativePlatform()) {
  _auth = initializeAuth(app, {
    persistence: indexedDBLocalPersistence
  });
} else {
  _auth = getAuth(app);
}
export const auth = _auth;

export const storage = getStorage(app);
export const functions = getFunctions(app);
export const rtdb = getDatabase(app);
