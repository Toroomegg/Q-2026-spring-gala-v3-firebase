
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// 使用您提供的 Firebase 配置
const firebaseConfig = {
  apiKey: "AIzaSyAD_PFdIBJq0qX7M2JOeAegW5AFAEmmUnw",
  authDomain: "spring-gala-vote.firebaseapp.com",
  databaseURL: "https://spring-gala-vote-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "spring-gala-vote",
  storageBucket: "spring-gala-vote.firebasestorage.app",
  messagingSenderId: "67468985228",
  appId: "1:67468985228:web:850369c096264681d10ca9",
  measurementId: "G-79QQMD494M"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
