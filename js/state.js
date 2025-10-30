export const state = {
  productos: [],
  fletes: [],
  cotizaciones: [],
  cotizar: { items: [], dias: 10, aplicarIVA: false },
  seq: { cotizacion: 1 },
  settings: {
    ivaPct: 21,
    redondeoVisual: true,
    validezDefaultDays: 7,
    importeMinimo: 0,
    politicaTarifa: 'escalonada',
    textoWhatsApp: 'Hola, te comparto la cotización de Andamios Buenos Aires.',
    vendedores: ['-'],
    empresa: {
      nombre: 'Andamios Buenos Aires',
      cuit: '30-71111650-4',
      direccion: 'Maturin 2570',
      telefono: '0810.362.15555',
      email: 'info@andamiosbuenosaires.com.ar',
      logoBase64: '',
      piePDF: 'Gracias por su consulta.'
    }
  }
};

// LocalStorage removido: solo Firestore
export function initState() { /* cloud-only */ }
export function saveAll() { /* cloud-only */ }
export function loadAll() { /* cloud-only */ }

// Firestore opcional (auto-inicializa si existe config/firebase.js)
let _db = null; let _fb = null;
export function isFirestoreEnabled() { return !!_db; }

export async function initBackend() {
  try {
    if (!window.firebase) { _db = null; _fb = null; return; }
    const firebaseConfig = {
      apiKey: "AIzaSyAKPX1KkUrriULooGwdi3L2g6zBO43TFfw",
      authDomain: "cotizador-andamios.firebaseapp.com",
      projectId: "cotizador-andamios",
      storageBucket: "cotizador-andamios.firebasestorage.app",
      messagingSenderId: "53924047263",
      appId: "1:53924047263:web:7ef9b15e99ac00dbc4f5aa"
    };
    const app = firebase.initializeApp(firebaseConfig);
    _db = firebase.firestore();
    _fb = {
      doc: (db, col, id) => db.collection(col).doc(id),
      setDoc: (ref, data, opts) => ref.set(data, opts),
      collection: (db, col) => db.collection(col),
      getDocs: (ref) => ref.get(),
      getDoc: (ref) => ref.get()
    };
  } catch (e) {
    _db = null; _fb = null;
  }
}

export async function saveToFirestore(collection, docId, payload) {
  if (!_db) return;
  const { doc, setDoc } = _fb;
  await setDoc(doc(_db, collection, docId), payload, { merge: true });
}

export async function loadCollectionFromFirestore(collection) {
  if (!_db) return [];
  const { collection: coll, getDocs } = _fb;
  const snap = await getDocs(coll(_db, collection));
  const arr = [];
  snap.forEach(d=> {
    const data = d.data();
    arr.push({ id: d.id, ...data });
  });
  return arr;
}

export async function loadDocFromFirestore(collection, docId) {
  if (!_db) return null;
  const { doc, getDoc } = _fb;
  const ref = doc(_db, collection, docId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function syncAllToFirestore() {
  if (!_db) return;
  await Promise.all([
    ...state.productos.map(p=> saveToFirestore('productos', p.codigo, p)),
    ...state.fletes.map(f=> saveToFirestore('fletes', f.locacion, f)),
    ...state.cotizaciones.map(c=> saveToFirestore('cotizaciones', c.id, c)),
    saveToFirestore('settings', 'general', state.settings),
    saveToFirestore('seq', 'counters', state.seq)
  ]);
}

export async function loadAllFromFirestore() {
  if (!_db) return false;
  const [productos, fletes, cotizaciones, settingsDoc, seqDoc] = await Promise.all([
    loadCollectionFromFirestore('productos'),
    loadCollectionFromFirestore('fletes'),
    loadCollectionFromFirestore('cotizaciones'),
    loadDocFromFirestore('settings','general'),
    loadDocFromFirestore('seq','counters')
  ]);
  state.productos = productos.map(({ id, ...rest })=> ({ ...rest }));
  state.fletes = fletes.map(({ id, ...rest })=> ({ ...rest }));
  state.cotizaciones = cotizaciones.map(c=> ({ ...c }));
  if (settingsDoc) state.settings = { ...state.settings, ...settingsDoc };
  if (seqDoc) state.seq = { ...state.seq, ...seqDoc };
  return true;
}

export async function ensureSeedDataInFirestore() {
  if (!_db) return;
  const needProductos = (state.productos||[]).length===0;
  const needFletes = (state.fletes||[]).length===0;
  const ops = [];
  if (needProductos) {
    const seedP = [
      { codigo: 'A001', nombre: 'Marco andamio 2m', precio_10: 12000, precio_20: 20000, precio_30: 26000, destacado: true },
      { codigo: 'A002', nombre: 'Escalera interna', precio_10: 9000, precio_20: 15000, precio_30: 20000, destacado: true },
      { codigo: 'A003', nombre: 'Rueda con freno', precio_10: 4000, precio_20: 7000, precio_30: 9000, destacado: false }
    ];
    state.productos = seedP;
    ops.push(...seedP.map(p=> saveToFirestore('productos', p.codigo, p)));
  }
  if (needFletes) {
    const seedF = [
      { locacion: 'Belgrano', precio: 15000 },
      { locacion: 'Palermo', precio: 18000 },
      { locacion: 'Caballito', precio: 16000 }
    ];
    state.fletes = seedF;
    ops.push(...seedF.map(f=> saveToFirestore('fletes', f.locacion, f)));
  }
  if (ops.length) await Promise.all(ops);
  // guardar settings/seq si no existen
  await saveToFirestore('settings','general', state.settings);
  await saveToFirestore('seq','counters', state.seq);
}


