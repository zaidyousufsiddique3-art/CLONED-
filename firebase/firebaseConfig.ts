
import { initializeApp } from '@firebase/app';
import { getAuth } from '@firebase/auth';
import { getFirestore } from '@firebase/firestore';
import { getStorage } from '@firebase/storage';
import { getAnalytics } from '@firebase/analytics';

// Helper to safely access env vars in Vite or fallback
const getEnv = (key: string, fallback: string) => {
  // @ts-ignore - import.meta.env is a Vite feature
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }
  return fallback;
};

const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY", "AIzaSyDtg8K2jDziwOi6aFfsP9Wb47tPQypL658"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN", "slisr-updated.firebaseapp.com"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID", "slisr-updated"),
  // FORCE BUCKET TO REMOVE VERCEL ENV ISSUES
  storageBucket: "slisr-updated.firebasestorage.app",
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "910243919222"),
  appId: getEnv("VITE_FIREBASE_APP_ID", "1:910243919222:web:a7beeb14a764c777563657"),
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-PNLW175JT9")
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
