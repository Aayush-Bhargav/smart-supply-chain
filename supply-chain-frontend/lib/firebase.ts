import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const firebaseMessagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const firebaseMeasurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

if (!firebaseApiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not set");
if (!firebaseAuthDomain) throw new Error("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is not set");
if (!firebaseProjectId) throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set");
if (!firebaseStorageBucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set");
if (!firebaseMessagingSenderId) throw new Error("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is not set");
if (!firebaseAppId) throw new Error("NEXT_PUBLIC_FIREBASE_APP_ID is not set");
if (!firebaseMeasurementId) throw new Error("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID is not set");

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
  measurementId: firebaseMeasurementId,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let analytics = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    console.warn('Firebase analytics is unavailable in this environment.', error);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export { analytics };
