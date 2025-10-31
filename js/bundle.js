// State
const state = {
  productos: [], fletes: [], cotizaciones: [],
  vendedores: [],
  cotizar: { items: [], dias: 10, aplicarIVA: false },
  seq: { cotizacion: 1 },
  settings: {
    ivaPct: 21, redondeoVisual: true, validezDefaultDays: 7, importeMinimo: 0,
    politicaTarifa: 'escalonada',
    textoWhatsApp: 'Hola, te comparto la cotización de Andamios Buenos Aires.',
    vendedores: ['-'],
    empresa: {
      nombre: 'Andamios Buenos Aires', cuit: '30-71111650-4', direccion: 'Maturin 2570',
      telefono: '0810.362.15555', email: 'info@andamiosbuenosaires.com.ar',
      logoBase64: '', piePDF: 'Gracias por su consulta.'
    }
  }
};

function initState() { }
function saveAll() { }

// Firestore
let _db = null; let _fb = null;
function isFirestoreEnabled() { return !!_db; }

async function initBackend() {
  try {
    if (!window.firebase) { 
      console.error('[INIT] Firebase no está disponible en window.firebase');
      _db = null; 
      _fb = null; 
      return; 
    }
    console.log('[INIT] Firebase encontrado, inicializando...');
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
    _fb = null;
    console.log('[INIT] ✅ Firestore inicializado correctamente');
    console.log('[INIT] Firestore DB:', _db);
    
    // Test de conexión
    try {
      const testDoc = await _db.collection('productos').limit(1).get();
      console.log('[INIT] ✅ Test de conexión exitoso. Documentos encontrados:', testDoc.size);
    } catch (testErr) {
      console.error('[INIT] ❌ Error en test de conexión:', testErr);
    }
  } catch (e) { 
    console.error('[INIT] ❌ Error inicializando Firebase:', e);
    _db = null; 
    _fb = null; 
  }
}

async function saveToFirestore(collection, docId, payload) {
  if (!_db) return;
  try {
    await _db.collection(collection).doc(docId).set(payload, { merge: true });
  } catch (e) {
    console.error('Error guardando en Firestore:', e);
  }
}

async function loadCollectionFromFirestore(collection) {
  if (!_db) return [];
  try {
    console.log(`[loadCollectionFromFirestore] Cargando colección: ${collection}`);
    const snap = await _db.collection(collection).get();
    const arr = [];
    snap.forEach(d=> { 
      const data = d.data(); 
      if (collection === 'cotizaciones') {
        console.log(`[loadCollectionFromFirestore] Cotización ${d.id}:`, {
          numero: data.numero,
          vendedor: data.vendedor,
          estado: data.estado,
          raw: data
        });
      }
      if (collection === 'vendedores') {
        console.log(`[loadCollectionFromFirestore] Vendedor ${d.id}:`, {
          id: d.id,
          nombre: data.nombre,
          raw: data
        });
      }
      arr.push({ id: d.id, ...data }); 
    });
    console.log(`[loadCollectionFromFirestore] ${collection}: ${arr.length} documentos cargados`);
    return arr;
  } catch (e) {
    console.error(`[loadCollectionFromFirestore] Error cargando colección ${collection}:`, e);
    return [];
  }
}

async function loadDocFromFirestore(collection, docId) {
  if (!_db) return null;
  try {
    const snap = await _db.collection(collection).doc(docId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error('Error cargando doc:', e);
    return null;
  }
}

async function loadAllFromFirestore() {
  if (!_db) {
    console.log('[LOAD] No hay conexión a Firestore');
    return false;
  }
  console.log('[LOAD] Iniciando carga de datos desde Firestore...');
  const [productos, fletes, cotizaciones, vendedores, settingsDoc, seqDoc] = await Promise.all([
    loadCollectionFromFirestore('productos'),
    loadCollectionFromFirestore('fletes'),
    loadCollectionFromFirestore('cotizaciones'),
    loadCollectionFromFirestore('vendedores'),
    loadDocFromFirestore('settings','general'),
    loadDocFromFirestore('seq','counters')
  ]);
  console.log('[LOAD] Productos cargados desde Firestore:', productos.length);
  console.log('[LOAD] Productos crudos:', productos);
  // Filtrar documentos marcados como eliminados
  const productosFiltrados = productos
    .filter(p => {
      const deleted = p.__deleted;
      if (deleted) console.log('[LOAD] Producto marcado como eliminado, filtrando:', p.codigo || p.id);
      return !deleted;
    })
    .map(({ id, __deleted, ...rest })=> ({ ...rest }));
  console.log('[LOAD] Productos después de filtrar eliminados:', productosFiltrados.length);
  console.log('[LOAD] Productos finales:', productosFiltrados);
  state.productos = productosFiltrados;
  state.fletes = fletes
    .filter(f => {
      if (f.__deleted) console.log('[LOAD] Flete marcado como eliminado, filtrando:', f.locacion || f.id);
      return !f.__deleted;
    })
    .map(({ id, __deleted, ...rest })=> ({ ...rest }));
  console.log('[LOAD] Cotizaciones cargadas desde Firestore:', cotizaciones.length);
  cotizaciones.forEach((c, idx) => {
    console.log(`[LOAD] Cotización ${idx + 1}:`, {
      numero: c.numero,
      vendedor: c.vendedor,
      estado: c.estado,
      cliente: c.cliente,
      raw: c
    });
  });
  state.cotizaciones = cotizaciones.map(c=> ({ ...c }));
  // Vendedores (colección simple con campo "nombre")
  console.log('[LOAD] Vendedores crudos desde Firestore:', vendedores);
  state.vendedores = (vendedores||[])
    .map(v => {
      // El documento puede tener campo "nombre" o el ID puede ser el nombre
      const nombre = v.nombre || v.id || '';
      console.log('[LOAD] Procesando vendedor:', { id: v.id, nombre: v.nombre, resultado: nombre, raw: v });
      return nombre;
    })
    .filter(Boolean)
    .sort((a,b)=> a.localeCompare(b));
  console.log('[LOAD] Vendedores finales en state:', state.vendedores);
  if (settingsDoc) state.settings = { ...state.settings, ...settingsDoc };
  if (seqDoc) state.seq = { ...state.seq, ...seqDoc };
  console.log('[LOAD] Carga completada. Productos en state:', state.productos.length);
  return true;
}

async function ensureSeedDataInFirestore() {
  if (!_db) {
    console.log('[SEED] No hay conexión a Firestore');
    return;
  }
  console.log('[SEED] Verificando si se necesitan datos semilla...');
  // Solo agregar datos semilla si la colección está completamente vacía (primera vez)
  // NO agregar si el usuario ha eliminado productos
  const productosSnapshot = await _db.collection('productos').get();
  const fletesSnapshot = await _db.collection('fletes').get();
  const vendedoresSnapshot = await _db.collection('vendedores').get();
  
  console.log('[SEED] Productos en Firestore:', productosSnapshot.size, '(empty:', productosSnapshot.empty, ')');
  console.log('[SEED] Productos en state:', (state.productos||[]).length);
  console.log('[SEED] Fletes en Firestore:', fletesSnapshot.size, '(empty:', fletesSnapshot.empty, ')');
  console.log('[SEED] Fletes en state:', (state.fletes||[]).length);
  
  const ops = [];
  
  // Solo agregar productos semilla si la colección está vacía
  if (productosSnapshot.empty && (state.productos||[]).length===0) {
    console.log('[SEED] ✅ Agregando productos semilla (colección vacía)');
    const seedP = [
      { codigo: 'A001', nombre: 'Marco andamio 2m', precio_10: 12000, precio_20: 20000, precio_30: 26000, destacado: true },
      { codigo: 'A002', nombre: 'Escalera interna', precio_10: 9000, precio_20: 15000, precio_30: 20000, destacado: true },
      { codigo: 'A003', nombre: 'Rueda con freno', precio_10: 4000, precio_20: 7000, precio_30: 9000, destacado: false }
    ];
    state.productos = seedP;
    ops.push(...seedP.map(p=> saveToFirestore('productos', p.codigo, p)));
  } else {
    console.log('[SEED] ❌ NO se agregan productos semilla - colección no vacía o state tiene productos');
  }
  
  // Solo agregar fletes semilla si la colección está vacía
  if (fletesSnapshot.empty && (state.fletes||[]).length===0) {
    console.log('[SEED] ✅ Agregando fletes semilla (colección vacía)');
    const seedF = [
      { locacion: 'Belgrano', precio: 15000 },
      { locacion: 'Palermo', precio: 18000 },
      { locacion: 'Caballito', precio: 16000 }
    ];
    state.fletes = seedF;
    ops.push(...seedF.map(f=> saveToFirestore('fletes', f.locacion, f)));
  } else {
    console.log('[SEED] ❌ NO se agregan fletes semilla - colección no vacía o state tiene fletes');
  }

  // Vendedores semilla (si colección vacía)
  console.log('[SEED] Vendedores en Firestore:', vendedoresSnapshot.size, '(empty:', vendedoresSnapshot.empty, ')');
  console.log('[SEED] Vendedores en state:', (state.vendedores||[]).length);
  if (vendedoresSnapshot.empty && (state.vendedores||[]).length===0) {
    const vend = state.settings.vendedores?.length ? state.settings.vendedores : ['Tamara','Sandra','Agustina','Rocio'];
    console.log('[SEED] ✅ Agregando vendedores semilla:', vend);
    await Promise.all(vend.map(nombre => saveToFirestore('vendedores', nombre, { nombre })));
    // Recargar vendedores después de agregarlos
    const nuevosVendedores = await loadCollectionFromFirestore('vendedores');
    state.vendedores = nuevosVendedores.map(v => v.nombre || v.id || '').filter(Boolean).sort((a,b)=> a.localeCompare(b));
    console.log('[SEED] Vendedores actualizados en state:', state.vendedores);
  } else {
    console.log('[SEED] ❌ NO se agregan vendedores semilla - colección no vacía o state tiene vendedores');
  }
  
  if (ops.length) {
    console.log('[SEED] Guardando', ops.length, 'documentos semilla...');
    await Promise.all(ops);
    console.log('[SEED] Datos semilla guardados');
  }
  
  // Solo guardar settings si no existen
  const settingsDoc = await loadDocFromFirestore('settings','general');
  if (!settingsDoc) {
    console.log('[SEED] Agregando settings por defecto');
    await saveToFirestore('settings','general', state.settings);
  }
  
  // Solo guardar seq si no existe
  const seqDoc = await loadDocFromFirestore('seq','counters');
  if (!seqDoc) {
    console.log('[SEED] Agregando seq por defecto');
    await saveToFirestore('seq','counters', state.seq);
  }
  
  console.log('[SEED] Verificación completada');
}

// Utils
function formatARS(value, roundVisual) {
  const v = roundVisual ? Math.round(value) : value;
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: roundVisual ? 0 : 2 }).format(v || 0);
}

function parseNumber(v) {
  if (v===null || v===undefined) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n) ? n : 0;
}

function readFileAsText(file) {
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result));
    r.onerror = reject;
    r.readAsText(file);
  });
}

// Pricing
function selectTarifa(dias) {
  if (dias <= 10) return '10';
  if (dias <= 20) return '20';
  if (dias <= 30) return '30';
  return '30+';
}

function precioPorTarifa(producto, etiqueta) {
  if (etiqueta==='10') return producto.precio_10||0;
  if (etiqueta==='20') return producto.precio_20||0;
  return producto.precio_30||0;
}

function calcularPrecioPorDias(producto, dias) {
  if (state.settings.politicaTarifa === 'prorrateo') {
    const p10 = producto.precio_10||0; const p20 = producto.precio_20||0; const p30 = producto.precio_30||0;
    if (dias <= 10) return p10 * (dias/10);
    if (dias <= 20) return p20 * (dias/20);
    if (dias <= 30) return p30 * (dias/30);
    const bloques = Math.floor(dias/30);
    const residuo = dias - bloques*30;
    const totalBloques = bloques * p30;
    const residuoProrr = residuo<=10 ? p10*(residuo/10) : residuo<=20 ? p20*(residuo/20) : p30*(residuo/30);
    return totalBloques + residuoProrr;
  }
  if (dias <= 30) return precioPorTarifa(producto, selectTarifa(dias));
  const bloques = Math.floor(dias/30);
  const residuo = dias - bloques*30;
  const totalBloques = bloques * (producto.precio_30||0);
  const residual = residuo===0 ? 0 : (residuo<=10 ? producto.precio_10||0 : residuo<=20 ? producto.precio_20||0 : producto.precio_30||0);
  return totalBloques + residual;
}

function calcularItem(producto, cantidad, dias) {
  const precioFraccion = calcularPrecioPorDias(producto, dias);
  const unitario = precioFraccion;
  const subtotal = unitario * (cantidad||1);
  const etiquetaTarifa = dias>30 ? '30+residuo' : selectTarifa(dias);
  return { unitario, subtotal, etiquetaTarifa };
}

function calcularTotales(stateRef, dias, flete, descuentoPct, aplicarIVA=false) {
  const subProductos = stateRef.cotizar.items.reduce((acc, it)=>{
    const prod = stateRef.productos.find(p=>p.codigo===it.codigo);
    if (!prod) return acc;
    const calc = calcularItem(prod, it.cantidad, dias);
    return acc + calc.subtotal;
  }, 0);
  const subtotal = subProductos + (flete||0);
  const descuento = (subtotal * (descuentoPct||0)) / 100;
  let base = subtotal - descuento;
  const minimo = Number(stateRef.settings.importeMinimo||0);
  const ajusteMinimo = Math.max(0, minimo - base);
  base += ajusteMinimo;
  const iva = aplicarIVA ? base * (stateRef.settings.ivaPct/100) : 0;
  const totalFinal = base + iva;
  return { subtotalProductos: subProductos, subtotal, descuento, ajusteMinimo, base, iva, totalFinal };
}

// Import/Export
function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(data, filename) {
  if (!Array.isArray(data) || !data.length) {
    const blob = new Blob([''], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); return;
  }
  const headers = Object.keys(data[0]);
  const rows = [headers.join(',')].concat(data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function sanitizeProductos(arr) {
  return (Array.isArray(arr)?arr:[]).map(p=>({
    codigo: String(p.codigo||'').trim(),
    nombre: String(p.nombre||'').trim(),
    precio_10: parseNumber(p.precio_10),
    precio_20: parseNumber(p.precio_20),
    precio_30: parseNumber(p.precio_30),
    peso: p.peso!==undefined ? parseNumber(p.peso) : undefined,
    notas: p.notas?String(p.notas):undefined
  })).filter(p=>p.codigo && p.nombre);
}

function sanitizeFletes(arr) {
  console.log('[sanitizeFletes] Input:', arr);
  const sanitized = (Array.isArray(arr)?arr:[]).map(f=>({
    locacion: String(f.locacion||'').trim(),
    precio: parseNumber(f.precio)
  })).filter(f=>{
    const valid = !!f.locacion && f.locacion.length > 0;
    if (!valid) console.warn('[sanitizeFletes] Filtrando flete inválido:', f);
    return valid;
  });
  console.log('[sanitizeFletes] Output:', sanitized);
  return sanitized;
}

function importJSONOrCSV(text, tipo) {
  try {
    const obj = JSON.parse(text);
    if (tipo==='productos') return { productos: sanitizeProductos(obj) };
    if (tipo==='fletes') return { fletes: sanitizeFletes(obj) };
  } catch {
    // CSV Parser tolerante: maneja encabezados variados y CSV sin encabezados
    const raw = text.replace(/\uFEFF/g,'').trim();
    if (!raw) return {};
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return {};
    const splitRow = (row)=> row.match(/\"([^\"]*)\"|([^,]+)/g)?.map(x=>x.replace(/^"|"$/g,'')) || [];
    const firstCols = splitRow(lines[0]);

    // Normalizar encabezados si existen
    const isHeaderLikely = firstCols.some(c => /loca|preci|valor|monto|nombre|codigo/i.test(c));
    let dataObjs = [];
    if (isHeaderLikely) {
      const headerMap = firstCols.map(h => String(h||'').trim().toLowerCase());
      const mapKey = (h)=>{
        if (/^loc/.test(h) || /localidad|zona|lugar/.test(h)) return 'locacion';
        if (/^prec/.test(h) || /valor|monto|importe/.test(h)) return 'precio';
        if (/^cod/.test(h)) return 'codigo';
        if (/^nom/.test(h)) return 'nombre';
        if (/^p10|10/.test(h)) return 'precio_10';
        if (/^p20|20/.test(h)) return 'precio_20';
        if (/^p30|30/.test(h)) return 'precio_30';
        return h;
      };
      const normHeaders = headerMap.map(mapKey);
      for (let i=1;i<lines.length;i++) {
        const cols = splitRow(lines[i]);
        const obj = {}; normHeaders.forEach((h,idx)=> obj[h] = cols[idx]);
        dataObjs.push(obj);
      }
    } else {
      // CSV sin encabezado: asumir 2 columnas para fletes [locacion, precio]
      for (let i=0;i<lines.length;i++) {
        const cols = splitRow(lines[i]);
        if (cols.length>=2) dataObjs.push({ locacion: cols[0], precio: cols[1] });
      }
    }
    if (tipo==='productos') return { productos: sanitizeProductos(dataObjs) };
    if (tipo==='fletes') return { fletes: sanitizeFletes(dataObjs) };
  }
  return {};
}

// WhatsApp
function buildWhatsAppLink(state, { cliente, total, locacion, dias }) {
  const base = state.settings.textoWhatsApp || 'Hola, te comparto la cotización de Andamios Buenos Aires.';
  const msg = `${base}\nCliente: ${cliente||'-'}\nLocación: ${locacion||'-'}\nDías: ${dias}\nTotal: ${formatARS(total, true)}`;
  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return url;
}

// PDF
async function ensureJsPDF() {
  if (window.jspdf || window.jsPDF) return;
  await new Promise((resolve)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = resolve; document.head.appendChild(s);
  });
}

async function exportPDF(state, data) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF();
  const empresa = state.settings.empresa;
  let y = 15;
  if (empresa.logoBase64) {
    try { doc.addImage(empresa.logoBase64, 'PNG', 15, 10, 25, 25); } catch {}
  }
  doc.setFontSize(16);
  doc.text(empresa.nombre || 'Andamios Buenos Aires', 45, 20);
  doc.setFontSize(10);
  doc.text(`${empresa.cuit || ''}  ${empresa.direccion || ''}`.trim(), 45, 26);
  doc.setFontSize(12);
  doc.text('Cotización de alquiler de andamios', 15, 45);
  doc.setFontSize(10);
  doc.text(`Cliente: ${data.cliente||'-'}`, 15, 52);
  doc.text(`Locación: ${data.locacion||'-'}`, 15, 58);
  doc.text(`Fecha inicio: ${data.fecha||'-'}   Días: ${data.dias}`, 15, 64);
  y = 74;
  doc.setFontSize(10);
  doc.text('Ítems', 15, y); y+=4;
  doc.setFont('helvetica','bold'); doc.text('Producto', 15, y); doc.text('Cant', 110, y); doc.text('Tarifa', 130, y); doc.text('Unit', 155, y, { align: 'right' }); doc.text('Subt', 195, y, { align: 'right' });
  doc.setFont('helvetica','normal'); y+=2;
  doc.line(15, y, 195, y); y+=4;
  (data.items||[]).forEach(it => {
    const unit = it._calc?.unitario ?? 0;
    const subt = it._calc?.subtotal ?? 0;
    const nombre = `${it.codigo} - ${it.nombre}`.slice(0,60);
    doc.text(nombre, 15, y);
    doc.text(String(it.cantidad), 110, y);
    doc.text(String(it.tarifa), 130, y);
    doc.text(formatARS(unit, true), 155, y, { align: 'right' });
    doc.text(formatARS(subt, true), 195, y, { align: 'right' });
    y+=6;
    if (y>260) { doc.addPage(); y=20; }
  });
  y+=4;
  doc.line(120, y, 195, y); y+=6;
  doc.text('Subtotal productos:', 125, y); doc.text(formatARS(data.totales?.subtotalProductos||0, true), 195, y, { align: 'right' }); y+=6;
  doc.text('Flete:', 125, y); doc.text(formatARS(data.totales?.subtotal - (data.totales?.subtotalProductos||0), true), 195, y, { align: 'right' }); y+=6;
  doc.text('Ajuste mínimo:', 125, y); doc.text(formatARS(data.totales?.ajusteMinimo||0, true), 195, y, { align: 'right' }); y+=6;
  doc.text('TOTAL (sin IVA):', 125, y); doc.text(formatARS(data.totales?.base||0, true), 195, y, { align: 'right' }); y+=6;
  if (data.aplicarIVA) {
    doc.text('IVA:', 125, y); doc.text(formatARS(data.totales?.iva||0, true), 195, y, { align: 'right' }); y+=6;
    doc.setFont('helvetica','bold'); doc.text('TOTAL:', 125, y); doc.text(formatARS(data.totales?.totalFinal||0, true), 195, y, { align: 'right' }); doc.setFont('helvetica','normal');
  } else {
    doc.setFont('helvetica','bold'); doc.text('TOTAL:', 125, y); doc.text(formatARS(data.totales?.base||0, true), 195, y, { align: 'right' }); doc.setFont('helvetica','normal');
  }
  y+=10;
  if (data.notas) { doc.text('Notas:', 15, y); y+=6; doc.text(String(data.notas), 15, y); y+=6; }
  if (empresa.piePDF) { y = 285; doc.setFontSize(9); doc.text(empresa.piePDF, 15, y); }
  doc.save('cotizacion.pdf');
}


function setActiveTab(id) {
  document.querySelectorAll('.tab').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('border-blue-600','text-blue-600','font-semibold');
    b.classList.add('border-transparent','text-slate-600');
  });
  const tab = document.getElementById(`tab-${id}`);
  const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
  if (tab) tab.classList.remove('hidden');
  if (btn) {
    btn.classList.remove('border-transparent','text-slate-600');
    btn.classList.add('border-blue-600','text-blue-600','font-semibold');
  }
  window.location.hash = id;
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
  const initial = window.location.hash?.replace('#','') || 'cotizar';
  setActiveTab(initial);
}

function populateDatalistLocaciones() {
  const dl = document.getElementById('locaciones-list');
  dl.innerHTML = '';
  state.fletes
    .slice()
    .sort((a,b)=>a.locacion.localeCompare(b.locacion))
    .forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.locacion;
      dl.appendChild(opt);
    });
}

function renderCotizar() {
  populateDatalistLocaciones();
  // Fecha de emisión (solo visual)
  const hoy = new Date().toLocaleDateString();
  const em = document.getElementById('q-emision'); if (em) em.textContent = hoy;
  // Validez visual desde configuración
  const vv = document.getElementById('q-validez-view'); if (vv) vv.textContent = `${state.settings.validezDefaultDays} días`;
  // Vendedores
  const sel = document.getElementById('q-vendedor');
  if (sel) {
    const vendedoresList = state.vendedores?.length ? state.vendedores : (state.settings.vendedores||['-']);
    console.log('[renderCotizar] Vendedores disponibles:', vendedoresList);
    console.log('[renderCotizar] state.vendedores:', state.vendedores);
    console.log('[renderCotizar] state.settings.vendedores:', state.settings.vendedores);
    sel.innerHTML = '<option value="">-- Seleccionar vendedor --</option>' + 
      vendedoresList.map(v=>`<option value="${v}">${v}</option>`).join('');
    // No establecer valor por defecto, dejar vacío
    if (!sel.value || sel.value === '') {
      sel.value = '';
    }
  }
  // Botones de días
  highlightDiasButtons();
  // Prefill destacados si vacío
  if (!state.cotizar.items.length) {
    const destacados = state.productos.filter(p=>p.destacado);
    destacados.forEach(p=>{
      const tarifa = selectTarifa(state.cotizar.dias || 10);
      state.cotizar.items.push({ codigo: p.codigo, nombre: p.nombre, tarifa, cantidad: 1 });
    });
  }
  updateResumen();
  renderItems();
}

function findProductosByQuery(q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return state.productos.filter(p => p.codigo.toLowerCase().includes(s) || p.nombre.toLowerCase().includes(s)).slice(0,5);
}

function renderSugerencias() {
  const q = document.getElementById('q-buscar').value;
  const sug = document.getElementById('q-sugerencias');
  const results = findProductosByQuery(q);
  if (!results.length) { sug.textContent = 'Sin resultados'; return; }
  sug.innerHTML = results.map(p=>`${p.codigo} · ${p.nombre}`).join(' · ');
}

function addFirstSuggestion() {
  const q = document.getElementById('q-buscar').value;
  const results = findProductosByQuery(q);
  if (!results.length) return;
  const prod = results[0];
  const dias = state.cotizar.dias || 10;
  const tarifa = selectTarifa(dias);
  const existing = state.cotizar.items.find(i=>i.codigo===prod.codigo && i.tarifa===tarifa);
  if (existing) existing.cantidad += 1; else state.cotizar.items.push({ codigo: prod.codigo, nombre: prod.nombre, tarifa, cantidad: 1 });
  document.getElementById('q-buscar').value = '';
  renderSugerencias();
  renderItems();
  updateResumen();
}

function renderItems() {
  const tbody = document.getElementById('q-items');
  tbody.innerHTML = '';
  const dias = state.cotizar.dias || 10;
  if (state.cotizar.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 font-medium">No hay productos agregados</td></tr>';
    return;
  }
  state.cotizar.items.forEach((it, idx) => {
    const prod = state.productos.find(p=>p.codigo===it.codigo);
    const calc = prod ? calcularItem(prod, it.cantidad, dias) : { unitario: 0, subtotal: 0, etiquetaTarifa: it.tarifa };
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition';
    tr.innerHTML = `
      <td class="p-3">
        <div class="font-semibold text-slate-800">${it.codigo}</div>
        <div class="text-sm text-slate-600">${it.nombre}</div>
      </td>
      <td class="p-3 text-right">
        <div class="inline-flex items-center gap-2">
          <button data-idx="${idx}" data-act="dec" class="px-3 py-1.5 border-2 border-slate-300 rounded-lg hover:bg-slate-100 transition font-medium">-</button>
          <input data-idx="${idx}" data-act="qty" type="number" min="1" value="${it.cantidad}" class="w-20 border-2 border-slate-300 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
          <button data-idx="${idx}" data-act="inc" class="px-3 py-1.5 border-2 border-slate-300 rounded-lg hover:bg-slate-100 transition font-medium">+</button>
        </div>
      </td>
      <td class="p-3 text-center"><span class="px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium text-xs">${calc.etiquetaTarifa}</span></td>
      <td class="p-3 text-right font-medium text-slate-800">${formatARS(calc.unitario, state.settings.redondeoVisual)}</td>
      <td class="p-3 text-right font-semibold text-slate-900">${formatARS(calc.subtotal, state.settings.redondeoVisual)}</td>
      <td class="p-3 text-center"><button data-idx="${idx}" data-act="del" class="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded transition font-medium">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button, input').forEach(el=>{
    el.addEventListener('click', onItemAction);
    el.addEventListener('change', onItemAction);
  });
}

function onItemAction(e) {
  const idx = Number(e.currentTarget.getAttribute('data-idx'));
  const act = e.currentTarget.getAttribute('data-act');
  if (Number.isNaN(idx)) return;
  const item = state.cotizar.items[idx];
  if (!item) return;
  if (act==='inc') item.cantidad += 1;
  if (act==='dec') item.cantidad = Math.max(1, item.cantidad - 1);
  if (act==='del') state.cotizar.items.splice(idx,1);
  if (act==='qty') item.cantidad = Math.max(1, parseNumber(e.currentTarget.value) || 1);
  renderItems();
  updateResumen();
}

function getFleteForLocacion(loc) {
  const f = state.fletes.find(x=>x.locacion.toLowerCase()===String(loc||'').toLowerCase());
  return f ? f.precio : 0;
}

function updateResumen() {
  const dias = state.cotizar.dias || 10;
  const loc = document.getElementById('q-locacion').value;
  const descuentoPct = parseNumber(document.getElementById('sum-desc').value) || 0;
  const flete = getFleteForLocacion(loc);
  const aplicarIVA = !!document.getElementById('sum-aplicar-iva')?.checked;
  state.cotizar.aplicarIVA = aplicarIVA;
  const tot = calcularTotales(state, dias, flete, descuentoPct, aplicarIVA);
  document.getElementById('sum-subproductos').textContent = formatARS(tot.subtotalProductos, state.settings.redondeoVisual);
  document.getElementById('sum-flete').textContent = formatARS(flete, state.settings.redondeoVisual);
  const aj = document.getElementById('sum-ajuste'); if (aj) aj.textContent = formatARS(tot.ajusteMinimo||0, state.settings.redondeoVisual);
  document.getElementById('sum-total-sin-iva').textContent = formatARS(tot.base, state.settings.redondeoVisual);
  const ivaSpan = document.getElementById('sum-iva'); if (ivaSpan) ivaSpan.textContent = formatARS(tot.iva, state.settings.redondeoVisual);
  document.getElementById('sum-total').textContent = formatARS(tot.totalFinal, state.settings.redondeoVisual);
  const top = document.getElementById('top-total');
  if (top) top.textContent = `Total actual: ${formatARS(tot.totalFinal, true)}`;
}

async function guardarCotizacion() {
  const now = new Date();
  const numero = (state.seq.cotizacion++);
  const dias = state.cotizar.dias || 10;
  const loc = document.getElementById('q-locacion').value;
  const flete = getFleteForLocacion(loc);
  const desc = parseNumber(document.getElementById('sum-desc').value) || 0;
  const aplicarIVA = !!document.getElementById('sum-aplicar-iva')?.checked;
  const tot = calcularTotales(state, dias, flete, desc, aplicarIVA);
  const vendedorInput = document.getElementById('q-vendedor');
  const vendedorValue = vendedorInput ? String(vendedorInput.value || '').trim() : '-';
  console.log('[guardarCotizacion] Vendedor capturado:', vendedorValue);
  const cot = {
    id: `C${numero}`,
    numero,
    createdAt: now.toISOString(),
    estado: 'Borrador',
    cliente: document.getElementById('q-cliente').value.trim(),
    locacion: loc,
    fechaEmision: now.toISOString().slice(0,10),
    dias,
    validezDias: state.settings.validezDefaultDays,
    aplicarIVA,
    vendedor: vendedorValue,
    items: state.cotizar.items.map(x=>({ ...x })),
    notas: document.getElementById('q-notas').value,
    descuentoPct: desc,
    ivaPct: state.settings.ivaPct,
    flete,
    totales: tot
  };
  console.log('[guardarCotizacion] Cotización a guardar:', JSON.stringify(cot, null, 2));
  state.cotizaciones.push(cot);
  await saveToFirestore('cotizaciones', cot.id, cot);
  await saveToFirestore('seq','counters', state.seq);
  renderCotizaciones();
  alert(`Cotización guardada #${cot.numero}`);
}

function exportarPDFActual() {
  const dias = state.cotizar.dias || 10;
  const loc = document.getElementById('q-locacion').value;
  const flete = getFleteForLocacion(loc);
  const desc = parseNumber(document.getElementById('sum-desc').value) || 0;
  const aplicarIVA = !!document.getElementById('sum-aplicar-iva')?.checked;
  const tot = calcularTotales(state, dias, flete, desc, aplicarIVA);
  exportPDF(state, {
    cliente: document.getElementById('q-cliente').value,
    locacion: loc,
    fecha: new Date().toISOString().slice(0,10),
    dias,
    validez: state.settings.validezDefaultDays,
    vendedor: document.getElementById('q-vendedor').value,
    notas: document.getElementById('q-notas').value,
    items: state.cotizar.items,
    totales: tot,
    aplicarIVA
  });
}

function compartirWhatsAppActual() {
  const dias = state.cotizar.dias || 10;
  const loc = document.getElementById('q-locacion').value;
  const flete = getFleteForLocacion(loc);
  const desc = parseNumber(document.getElementById('sum-desc').value) || 0;
  const aplicarIVA = !!document.getElementById('sum-aplicar-iva')?.checked;
  const tot = calcularTotales(state, dias, flete, desc, aplicarIVA);
  const url = buildWhatsAppLink(state, {
    cliente: document.getElementById('q-cliente').value,
    total: tot.totalFinal,
    locacion: loc,
    dias
  });
  window.open(url, '_blank');
}

function renderProductos() {
  const list = document.getElementById('p-list');
  const q = document.getElementById('p-buscar').value.trim().toLowerCase();
  const rows = state.productos
    .filter(p => !q || p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
    .sort((a,b)=> a.codigo.localeCompare(b.codigo))
    .map((p,idx)=>`
      <tr>
        <td class="p-2"><input data-idx="${idx}" data-key="codigo" class="w-full border rounded px-2 py-1" value="${p.codigo}"></td>
        <td class="p-2"><input data-idx="${idx}" data-key="nombre" class="w-full border rounded px-2 py-1" value="${p.nombre}"></td>
        <td class="p-2 text-right"><input data-idx="${idx}" data-key="precio_10" class="w-full border rounded px-2 py-1 text-right" value="${p.precio_10}"></td>
        <td class="p-2 text-right"><input data-idx="${idx}" data-key="precio_20" class="w-full border rounded px-2 py-1 text-right" value="${p.precio_20}"></td>
        <td class="p-2 text-right"><input data-idx="${idx}" data-key="precio_30" class="w-full border rounded px-2 py-1 text-right" value="${p.precio_30}"></td>
        <td class="p-2 text-right"><input data-idx="${idx}" data-key="peso" class="w-full border rounded px-2 py-1 text-right" value="${p.peso ?? ''}"></td>
        <td class="p-2"><input data-idx="${idx}" data-key="notas" class="w-full border rounded px-2 py-1" value="${p.notas ?? ''}"></td>
        <td class="p-2 text-center"><input type="checkbox" data-idx="${idx}" data-key="destacado" ${p.destacado? 'checked':''}></td>
        <td class="p-2 text-center"><button data-idx="${idx}" data-act="p-del" class="px-2 py-1 text-red-600">🗑️</button></td>
      </tr>
    `).join('');
  list.innerHTML = rows || '<tr><td class="p-2 text-slate-500" colspan="9">Sin productos</td></tr>';
  console.log('[renderProductos] Agregando listeners...', list.querySelectorAll('button[data-act="p-del"]').length, 'botones eliminar encontrados');
  list.querySelectorAll('input,button').forEach((el, i)=> {
    const act = el.getAttribute('data-act');
    const idx = el.getAttribute('data-idx');
    console.log(`[renderProductos] Elemento ${i}: tag=${el.tagName}, act=${act}, idx=${idx}`);
    if (act === 'p-del') {
      // Para botones de eliminar, usar solo click
      console.log(`[renderProductos] Agregando listener para botón eliminar idx=${idx}`);
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[DELETE] 🗑️ Click detectado en botón eliminar!', idx);
        await onProductoChange(e);
      }, { once: false, capture: true });
    } else {
      el.addEventListener('change', onProductoChange);
      el.addEventListener('click', onProductoChange);
    }
  });
  console.log('[renderProductos] Listeners agregados');
}

async function onProductoChange(e) {
  console.log('[onProductoChange] Función ejecutada, event:', e);
  e.stopPropagation();
  const idx = Number(e.currentTarget.getAttribute('data-idx'));
  const key = e.currentTarget.getAttribute('data-key');
  const act = e.currentTarget.getAttribute('data-act');
  console.log('[onProductoChange] idx:', idx, 'key:', key, 'act:', act);
  
  if (act==='p-del') {
    console.log('[DELETE] === INICIO ELIMINACIÓN ===');
    if (Number.isNaN(idx)) {
      console.error('[DELETE] ❌ Índice inválido:', idx);
      return;
    }
    if (idx >= state.productos.length) {
      console.error('[DELETE] ❌ Índice fuera de rango. Productos en state:', state.productos.length);
      return;
    }
    const p = state.productos.splice(idx,1)[0];
    console.log('[DELETE] Producto a eliminar:', p?.codigo);
    console.log('[DELETE] Productos en state antes:', state.productos.length);
    if (p && _db) {
      // Eliminar físicamente de Firestore
      try {
        console.log('[DELETE] Eliminando de Firestore...');
        await _db.collection('productos').doc(p.codigo).delete();
        console.log('[DELETE] ✅ Producto eliminado de Firestore:', p.codigo);
        // Verificar que realmente se eliminó
        const verify = await _db.collection('productos').doc(p.codigo).get();
        console.log('[DELETE] Verificación - ¿Existe después de eliminar?', verify.exists);
        if (verify.exists) {
          console.error('[DELETE] ⚠️ PRODUCTO SIGUE EXISTIENDO EN FIRESTORE DESPUÉS DE ELIMINAR');
        }
      } catch (e) {
        console.error('[DELETE] ❌ Error eliminando producto:', e);
        console.error('[DELETE] Error completo:', JSON.stringify(e, null, 2));
      }
    } else {
      console.log('[DELETE] ⚠️ No se puede eliminar - p:', !!p, '_db:', !!_db);
    }
    console.log('[DELETE] Productos en state después:', state.productos.length);
    console.log('[DELETE] === FIN ELIMINACIÓN ===');
    renderProductos();
    return;
  }
  
  if (!Number.isNaN(idx) && key) {
    const p = state.productos[idx];
    if (!p) {
      console.warn('[onProductoChange] Producto no encontrado en índice:', idx);
      return;
    }
    if (key==='destacado') p.destacado = e.currentTarget.checked;
    else if (key.startsWith('precio') || key==='peso') p[key] = parseNumber(e.currentTarget.value) || 0;
    else p[key] = e.currentTarget.value;
    // Solo actualizar estado, NO guardar ni re-renderizar
  }
}

async function guardarTodosProductos() {
  const ops = state.productos.map(p => saveToFirestore('productos', p.codigo, p));
  await Promise.all(ops);
  alert('Productos guardados correctamente');
}

function renderFletes() {
  const list = document.getElementById('f-list');
  const q = document.getElementById('f-buscar').value.trim().toLowerCase();
  const rows = state.fletes
    .filter(f => !q || f.locacion.toLowerCase().includes(q))
    .sort((a,b)=> a.locacion.localeCompare(b.locacion))
    .map((f,idx)=>`
      <tr>
        <td class="p-2"><input data-idx="${idx}" data-key="locacion" class="w-full border rounded px-2 py-1" value="${f.locacion}"></td>
        <td class="p-2 text-right"><input data-idx="${idx}" data-key="precio" class="w-full border rounded px-2 py-1 text-right" value="${f.precio}"></td>
        <td class="p-2 text-center"><button data-idx="${idx}" data-act="f-del" class="px-2 py-1 text-red-600">🗑️</button></td>
      </tr>
    `).join('');
  list.innerHTML = rows || '<tr><td class="p-2 text-slate-500" colspan="3">Sin fletes</td></tr>';
  list.querySelectorAll('input,button').forEach(el=>{
    el.addEventListener('change', onFleteChange);
    el.addEventListener('click', onFleteChange);
  });
}

async function onFleteChange(e) {
  e.stopPropagation();
  const idx = Number(e.currentTarget.getAttribute('data-idx'));
  const key = e.currentTarget.getAttribute('data-key');
  const act = e.currentTarget.getAttribute('data-act');
  if (!Number.isNaN(idx) && key) {
    const f = state.fletes[idx];
    if (!f) return;
    if (key==='precio') f[key] = parseNumber(e.currentTarget.value) || 0;
    else f[key] = e.currentTarget.value;
    // Solo actualizar estado, NO guardar ni re-renderizar
  }
  if (act==='f-del') {
    const f = state.fletes.splice(idx,1)[0];
    if (f && _db) {
      // Eliminar físicamente de Firestore
      try {
        await _db.collection('fletes').doc(f.locacion).delete();
        console.log('Flete eliminado:', f.locacion);
      } catch (e) {
        console.error('Error eliminando flete:', e);
        // Si falla, al menos removemos del estado local
      }
    }
    renderFletes();
    populateDatalistLocaciones();
  }
}

async function guardarTodosFletes() {
  const ops = state.fletes.map(f => saveToFirestore('fletes', f.locacion, f));
  await Promise.all(ops);
  populateDatalistLocaciones();
  alert('Fletes guardados correctamente');
}

async function guardarConfiguracion() {
  await saveToFirestore('settings', 'general', state.settings);
  alert('Configuración guardada correctamente');
}

function renderCotizaciones() {
  const list = document.getElementById('c-list');
  const q = document.getElementById('c-buscar')?.value?.trim().toLowerCase() || '';
  const orden = document.getElementById('c-orden')?.value || 'fecha_desc';
  let arr = state.cotizaciones.slice();
  if (q) {
    arr = arr.filter(c =>
      String(c.numero).includes(q) ||
      (c.cliente||'').toLowerCase().includes(q) ||
      (c.locacion||'').toLowerCase().includes(q) ||
      (c.vendedor||'').toLowerCase().includes(q)
    );
  }
  arr.sort((a,b)=>{
    if (orden==='fecha_desc') return b.createdAt.localeCompare(a.createdAt);
    if (orden==='numero') return a.numero - b.numero;
    if (orden==='total') return a.totales.totalFinal - b.totales.totalFinal;
    if (orden==='estado') return a.estado.localeCompare(b.estado);
    if (orden==='cliente') return (a.cliente||'').localeCompare(b.cliente||'');
    if (orden==='vendedor') return (a.vendedor||'').localeCompare(b.vendedor||'');
    return 0;
  });
  console.log('[renderCotizaciones] Cotizaciones a renderizar:', arr.length);
  arr.forEach((c, idx) => {
    console.log(`[renderCotizaciones] Cotización #${c.numero}:`, {
      vendedor: c.vendedor,
      estado: c.estado,
      cliente: c.cliente,
      locacion: c.locacion,
      raw: c
    });
  });
  
  list.innerHTML = arr.map((c,idx)=> {
    const vendedorValue = String(c.vendedor || '').trim() || '-';
    const estadoValue = String(c.estado || 'Borrador').trim();
    console.log(`[renderCotizaciones] Renderizando cotización #${c.numero}: vendedor="${vendedorValue}", estado="${estadoValue}"`);
    return `
    <tr>
      <td class="p-2">#${c.numero}</td>
      <td class="p-2">${new Date(c.createdAt).toLocaleDateString()}</td>
      <td class="p-2">${c.cliente||'-'}</td>
      <td class="p-2">${c.locacion||'-'}</td>
      <td class="p-2">${vendedorValue}</td>
      <td class="p-2"><span class="px-2 py-1 rounded text-xs border">${estadoValue}</span></td>
      <td class="p-2 text-right">${formatARS((c.totales?.totalFinal || c.totales?.total || 0), state.settings.redondeoVisual)}</td>
      <td class="p-2 text-center flex gap-2 justify-center">
        <button data-idx="${idx}" data-act="c-ver" class="px-2 py-1 border rounded">Ver/Editar</button>
        <button data-idx="${idx}" data-act="c-dup" class="px-2 py-1 border rounded">Duplicar</button>
        <button data-idx="${idx}" data-act="c-pdf" class="px-2 py-1 border rounded">PDF</button>
        <button data-idx="${idx}" data-act="c-wa" class="px-2 py-1 border rounded">WhatsApp</button>
      </td>
    </tr>
  `;
  }).join('');
  list.querySelectorAll('button').forEach(b=> b.addEventListener('click', onCotizacionAction));

  // KPIs
  const totalSum = arr.reduce((acc,c)=>acc + c.totales.total, 0);
  document.getElementById('kpi-total').textContent = formatARS(totalSum, true);
  const aprobadas = arr.filter(c=>c.estado==='Aprobada').length;
  document.getElementById('kpi-aprobadas').textContent = String(aprobadas);
  const enviadas = arr.filter(c=>c.estado==='Enviada' || c.estado==='Aprobada').length;
  const conv = enviadas ? Math.round((aprobadas/enviadas)*100) : 0;
  document.getElementById('kpi-conversion').textContent = `${conv}%`;
  const ticket = arr.length ? totalSum/arr.length : 0;
  document.getElementById('kpi-ticket').textContent = formatARS(ticket, true);
}

function onCotizacionAction(e) {
  const idx = Number(e.currentTarget.getAttribute('data-idx'));
  const act = e.currentTarget.getAttribute('data-act');
  const c = state.cotizaciones[idx];
  if (!c) return;
  if (act==='c-ver') {
    // Cargar en pantalla Cotizar para editar
    state.cotizar.items = c.items.map(x=>({ ...x }));
    document.getElementById('q-cliente').value = c.cliente || '';
    document.getElementById('q-locacion').value = c.locacion || '';
    state.cotizar.dias = c.dias || 10; highlightDiasButtons();
    const vv = document.getElementById('q-validez-view'); if (vv) vv.textContent = `${c.validezDias || state.settings.validezDefaultDays} días`;
    document.getElementById('q-vendedor').value = c.vendedor || '';
    document.getElementById('q-notas').value = c.notas || '';
    setActiveTab('cotizar');
    renderItems();
    updateResumen();
  }
  if (act==='c-dup') {
    const copia = JSON.parse(JSON.stringify(c));
    copia.numero = (state.seq.cotizacion++);
    copia.id = `C${copia.numero}`;
    copia.createdAt = new Date().toISOString();
    copia.estado = 'Borrador';
    state.cotizaciones.push(copia);
    saveToFirestore('cotizaciones', copia.id, copia);
    saveToFirestore('seq','counters', state.seq);
    renderCotizaciones();
  }
  if (act==='c-pdf') {
    exportPDF(state, c);
  }
  if (act==='c-wa') {
    const url = buildWhatsAppLink(state, { cliente: c.cliente, total: c.totales.totalFinal ?? c.totales.total, locacion: c.locacion, dias: c.dias });
    window.open(url, '_blank');
  }
}

function setupEvents() {
  document.getElementById('q-buscar').addEventListener('input', renderSugerencias);
  document.getElementById('q-buscar').addEventListener('keydown', (e)=>{ if (e.key==='Enter') addFirstSuggestion(); });
  document.getElementById('q-agregar').addEventListener('click', addFirstSuggestion);
  // Botones de días
  const setDias = (d)=>{ state.cotizar.dias = d; highlightDiasButtons(); renderItems(); updateResumen(); };
  const b10 = document.getElementById('q-d10'); if (b10) b10.addEventListener('click', ()=> setDias(10));
  const b20 = document.getElementById('q-d20'); if (b20) b20.addEventListener('click', ()=> setDias(20));
  const b30 = document.getElementById('q-d30'); if (b30) b30.addEventListener('click', ()=> setDias(30));
  document.getElementById('q-locacion').addEventListener('change', updateResumen);
  document.getElementById('sum-desc').addEventListener('change', updateResumen);
  const chkIva = document.getElementById('sum-aplicar-iva'); if (chkIva) chkIva.addEventListener('change', updateResumen);
  document.getElementById('btn-guardar').addEventListener('click', guardarCotizacion);
  document.getElementById('btn-pdf').addEventListener('click', exportarPDFActual);
  document.getElementById('btn-whatsapp').addEventListener('click', compartirWhatsAppActual);

  document.getElementById('p-buscar').addEventListener('input', renderProductos);
  document.getElementById('p-guardar').addEventListener('click', guardarTodosProductos);
  document.getElementById('p-add').addEventListener('click', async ()=>{
    const p = { codigo: `P${Date.now()%100000}`, nombre: 'Nuevo producto', precio_10: 0, precio_20: 0, precio_30: 0 };
    state.productos.push(p);
    await saveToFirestore('productos', p.codigo, p);
    renderProductos();
  });
  document.getElementById('p-import').addEventListener('click', ()=> document.getElementById('p-file').click());
  document.getElementById('p-file').addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    const text = await readFileAsText(f);
    const { productos } = importJSONOrCSV(text, 'productos');
    if (productos) { state.productos = productos; await Promise.all(productos.map(p=> saveToFirestore('productos', p.codigo, p))); renderProductos(); }
    e.target.value = '';
  });
  document.getElementById('p-export-json').addEventListener('click', ()=> exportJSON(state.productos, 'productos.json'));
  document.getElementById('p-export-csv').addEventListener('click', ()=> exportCSV(state.productos, 'productos.csv'));

  document.getElementById('f-buscar').addEventListener('input', renderFletes);
  document.getElementById('f-guardar').addEventListener('click', guardarTodosFletes);
  document.getElementById('f-add').addEventListener('click', async ()=>{
    const f = { locacion: 'Nueva locación', precio: 0 };
    state.fletes.push(f);
    await saveToFirestore('fletes', f.locacion, f);
    renderFletes();
    populateDatalistLocaciones();
  });
  document.getElementById('f-import').addEventListener('click', ()=> document.getElementById('f-file').click());
  document.getElementById('f-file').addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    console.log('[IMPORT] Archivo seleccionado:', f.name, f.size, 'bytes');
    const text = await readFileAsText(f);
    console.log('[IMPORT] Contenido leído (primeros 500 chars):', text.substring(0, 500));
    const result = importJSONOrCSV(text, 'fletes');
    console.log('[IMPORT] Resultado del parse:', result);
    const { fletes } = result;
    if (fletes && Array.isArray(fletes) && fletes.length > 0) {
      console.log('[IMPORT] Fletes parseados:', fletes.length, fletes);
      state.fletes = fletes;
      console.log('[IMPORT] Guardando', fletes.length, 'fletes en Firestore...');
      await Promise.all(fletes.map(x=> saveToFirestore('fletes', x.locacion, x)));
      console.log('[IMPORT] Fletes guardados, renderizando...');
      renderFletes();
      populateDatalistLocaciones();
      alert(`✅ Importados ${fletes.length} fletes correctamente`);
    } else {
      console.error('[IMPORT] ❌ No se pudieron importar fletes. Resultado:', result);
      alert(`❌ No se pudieron importar fletes. Verifica el formato del CSV.\n\nFormato esperado:\nlocacion,precio\nBelgrano,15000\nPalermo,18000`);
    }
    e.target.value = '';
  });
  document.getElementById('f-export-json').addEventListener('click', ()=> exportJSON(state.fletes, 'fletes.json'));
  document.getElementById('f-export-csv').addEventListener('click', ()=> exportCSV(state.fletes, 'fletes.csv'));

  document.getElementById('c-buscar').addEventListener('input', renderCotizaciones);
  document.getElementById('c-orden').addEventListener('change', renderCotizaciones);

  // Config - Solo actualizar estado local, NO guardar automáticamente
  document.getElementById('set-iva').addEventListener('change', (e)=>{ state.settings.ivaPct = parseNumber(e.target.value)||0; updateResumen(); });
  document.getElementById('set-redondeo').addEventListener('change', (e)=>{ state.settings.redondeoVisual = e.target.checked; updateResumen(); renderCotizaciones(); });
  document.getElementById('set-validez-def').addEventListener('change', (e)=>{ state.settings.validezDefaultDays = parseNumber(e.target.value)||7; });
  const setMin = document.getElementById('set-minimo'); if (setMin) setMin.addEventListener('change', (e)=>{ state.settings.importeMinimo = parseNumber(e.target.value)||0; updateResumen(); });
  document.getElementById('set-politica').addEventListener('change', (e)=>{ state.settings.politicaTarifa = e.target.value; updateResumen(); });
  document.getElementById('set-empresa').addEventListener('change', (e)=>{ state.settings.empresa.nombre = e.target.value; });
  document.getElementById('set-cuit').addEventListener('change', (e)=>{ state.settings.empresa.cuit = e.target.value; });
  document.getElementById('set-direccion').addEventListener('change', (e)=>{ state.settings.empresa.direccion = e.target.value; });
  document.getElementById('set-pie').addEventListener('change', (e)=>{ state.settings.empresa.piePDF = e.target.value; });
  document.getElementById('set-wa').addEventListener('change', (e)=>{ state.settings.textoWhatsApp = e.target.value; });
  const setVend = document.getElementById('set-vendedores'); if (setVend) setVend.addEventListener('change', (e)=>{ state.settings.vendedores = String(e.target.value||'').split(',').map(s=>s.trim()).filter(Boolean); renderCotizar(); });
  document.getElementById('config-guardar').addEventListener('click', guardarConfiguracion);
  document.getElementById('set-logo').addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    const b64 = await new Promise((resolve)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result)); r.readAsDataURL(f); });
    state.settings.empresa.logoBase64 = b64;
    await guardarConfiguracion();
  });
}

function hydrateSettingsUI() {
  const setIva = document.getElementById('set-iva'); if (setIva) setIva.value = String(state.settings.ivaPct);
  const setRed = document.getElementById('set-redondeo'); if (setRed) setRed.checked = !!state.settings.redondeoVisual;
  const setVal = document.getElementById('set-validez-def'); if (setVal) setVal.value = String(state.settings.validezDefaultDays);
  const sm = document.getElementById('set-minimo'); if (sm) sm.value = String(state.settings.importeMinimo||0);
  const setPol = document.getElementById('set-politica'); if (setPol) setPol.value = state.settings.politicaTarifa;
  const setEmp = document.getElementById('set-empresa'); if (setEmp) setEmp.value = state.settings.empresa.nombre || '';
  const setCuit = document.getElementById('set-cuit'); if (setCuit) setCuit.value = state.settings.empresa.cuit || '';
  const setDir = document.getElementById('set-direccion'); if (setDir) setDir.value = state.settings.empresa.direccion || '';
  const setPie = document.getElementById('set-pie'); if (setPie) setPie.value = state.settings.empresa.piePDF || '';
  const setWa = document.getElementById('set-wa'); if (setWa) setWa.value = state.settings.textoWhatsApp || '';
  const sv = document.getElementById('set-vendedores'); if (sv) sv.value = (state.settings.vendedores||[]).join(', ');
}

async function main() {
  console.log('[MAIN] Iniciando aplicación...');
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  initState();
  console.log('[MAIN] Estado inicializado');
  await initBackend();
  console.log('[MAIN] Backend inicializado, Firestore habilitado:', isFirestoreEnabled());
  if (!isFirestoreEnabled()) { alert('Configurar Firebase en config/firebase.js para usar la app (cloud-only)'); return; }
  try {
    console.log('[MAIN] Cargando datos...');
    await loadAllFromFirestore();
    console.log('[MAIN] Datos cargados, verificando semillas...');
    await ensureSeedDataInFirestore();
    console.log('[MAIN] Productos finales en state:', state.productos.length);
    console.log('[MAIN] Productos finales:', state.productos);
  } catch (e) {
    console.error('[MAIN] ❌ Error cargando datos:', e);
  }
  setupTabs();
  setupEvents();
  hydrateSettingsUI();
  renderCotizar();
  renderProductos();
  renderFletes();
  renderCotizaciones();
  console.log('[MAIN] Aplicación inicializada');
}

main();

// Helpers
function highlightDiasButtons() {
  const d = state.cotizar.dias || 10;
  [['q-d10',10],['q-d20',20],['q-d30',30]].forEach(([id,val])=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('bg-blue-600','bg-white','text-white','text-slate-700','border-blue-500','border-slate-300');
    if (val===d) { 
      el.classList.add('bg-blue-600','text-white','border-blue-600','shadow-md');
    } else { 
      el.classList.add('bg-white','text-slate-700','border-slate-300');
    }
  });
}


