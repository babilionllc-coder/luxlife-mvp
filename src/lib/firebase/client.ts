import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCDa4F1QzC7dOZZep6ardoIJDqZ7dB700E',
  authDomain: 'luxlifemvp.firebaseapp.com',
  projectId: 'luxlifemvp',
  storageBucket: 'luxlifemvp.firebasestorage.app',
  messagingSenderId: '966839822817',
  appId: '1:966839822817:web:325276f67a9839bff5caa0',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseApp = app;
export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);
export const firebaseStorage = getStorage(app);
