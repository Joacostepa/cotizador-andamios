// Copiar este archivo a config/firebase.js y completar las credenciales
// Luego importar donde corresponda. Este proyecto usa LocalStorage por defecto.

export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

// Ejemplo de inicialización (cuando se integre Firebase real):
// import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
// import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
// const app = initializeApp(firebaseConfig);
// export const db = getFirestore(app);


