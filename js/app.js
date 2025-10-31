import { state, initState, initBackend, isFirestoreEnabled, loadAllFromFirestore, ensureSeedDataInFirestore, saveToFirestore } from './state.js';
import { formatARS, parseNumber, readFileAsText } from './utils.js';
import { selectTarifa, calcularItem, calcularTotales } from './pricing.js';
import { exportJSON, exportCSV, importJSONOrCSV } from './import_export.js';
import { buildWhatsAppLink } from './whatsapp.js';
import { exportPDF } from './pdf.js';

function setActiveTab(id) {
  document.querySelectorAll('.tab').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('border-slate-200','bg-white'));
  const tab = document.getElementById(`tab-${id}`);
  const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
  if (tab) tab.classList.remove('hidden');
  if (btn) btn.classList.add('border-slate-200','bg-white');
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
  if (sel) sel.innerHTML = (state.settings.vendedores||['-']).map(v=>`<option value="${v}">${v}</option>`).join('');
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
  state.cotizar.items.forEach((it, idx) => {
    const prod = state.productos.find(p=>p.codigo===it.codigo);
    const calc = prod ? calcularItem(prod, it.cantidad, dias) : { unitario: 0, subtotal: 0, etiquetaTarifa: it.tarifa };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2">
        <div class="font-medium">${it.codigo}</div>
        <div class="text-slate-600">${it.nombre}</div>
      </td>
      <td class="p-2 text-right">
        <div class="inline-flex items-center gap-1">
          <button data-idx="${idx}" data-act="dec" class="px-2 py-1 border rounded">-</button>
          <input data-idx="${idx}" data-act="qty" type="number" min="1" value="${it.cantidad}" class="w-16 border rounded px-2 py-1 text-right">
          <button data-idx="${idx}" data-act="inc" class="px-2 py-1 border rounded">+</button>
        </div>
      </td>
      <td class="p-2 text-center">${calc.etiquetaTarifa}</td>
      <td class="p-2 text-right">${formatARS(calc.unitario, state.settings.redondeoVisual)}</td>
      <td class="p-2 text-right">${formatARS(calc.subtotal, state.settings.redondeoVisual)}</td>
      <td class="p-2 text-center"><button data-idx="${idx}" data-act="del" class="px-2 py-1 text-red-600">🗑️</button></td>
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
    vendedor: document.getElementById('q-vendedor').value,
    items: state.cotizar.items.map(x=>({ ...x })),
    notas: document.getElementById('q-notas').value,
    descuentoPct: desc,
    ivaPct: state.settings.ivaPct,
    flete,
    totales: tot
  };
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
  list.querySelectorAll('input,button').forEach(el=>{
    el.addEventListener('change', onProductoChange);
    el.addEventListener('click', onProductoChange);
  });
}

function onProductoChange(e) {
  const idx = Number(e.currentTarget.getAttribute('data-idx'));
  const key = e.currentTarget.getAttribute('data-key');
  const act = e.currentTarget.getAttribute('data-act');
  if (!Number.isNaN(idx) && key) {
    const p = state.productos[idx];
    if (!p) return;
    if (key==='destacado') p.destacado = e.currentTarget.checked;
    else if (key.startsWith('precio') || key==='peso') p[key] = parseNumber(e.currentTarget.value) || 0; else p[key] = e.currentTarget.value;
    saveToFirestore('productos', p.codigo, p);
    renderProductos();
  }
  if (act==='p-del') {
    const p = state.productos.splice(idx,1)[0];
    if (p) saveToFirestore('productos', p.codigo, { __deleted: true });
    renderProductos();
  }
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

function onFleteChange(e) {
  const idx = Number(e.currentTarget.getAttribute('data-idx'));
  const key = e.currentTarget.getAttribute('data-key');
  const act = e.currentTarget.getAttribute('data-act');
  if (!Number.isNaN(idx) && key) {
    const f = state.fletes[idx];
    if (!f) return;
    if (key==='precio') f[key] = parseNumber(e.currentTarget.value) || 0; else f[key] = e.currentTarget.value;
    saveToFirestore('fletes', f.locacion, f);
    renderFletes();
    populateDatalistLocaciones();
  }
  if (act==='f-del') {
    const f = state.fletes.splice(idx,1)[0];
    if (f) saveToFirestore('fletes', f.locacion, { __deleted: true });
    renderFletes();
    populateDatalistLocaciones();
  }
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
      (c.locacion||'').toLowerCase().includes(q)
    );
  }
  arr.sort((a,b)=>{
    if (orden==='fecha_desc') return b.createdAt.localeCompare(a.createdAt);
    if (orden==='numero') return a.numero - b.numero;
    if (orden==='total') return a.totales.total - b.totales.total;
    if (orden==='estado') return a.estado.localeCompare(b.estado);
    if (orden==='cliente') return (a.cliente||'').localeCompare(b.cliente||'');
    return 0;
  });
  list.innerHTML = arr.map((c,idx)=>`
    <tr>
      <td class="p-2">#${c.numero}</td>
      <td class="p-2">${new Date(c.createdAt).toLocaleDateString()}</td>
      <td class="p-2">${c.cliente||'-'}</td>
      <td class="p-2">${c.locacion||'-'}</td>
      <td class="p-2"><span class="px-2 py-1 rounded text-xs border">${c.estado}</span></td>
      <td class="p-2 text-right">${formatARS(c.totales.totalFinal, state.settings.redondeoVisual)}</td>
      <td class="p-2 text-center flex gap-2 justify-center">
        <button data-idx="${idx}" data-act="c-ver" class="px-2 py-1 border rounded">Ver/Editar</button>
        <button data-idx="${idx}" data-act="c-dup" class="px-2 py-1 border rounded">Duplicar</button>
        <button data-idx="${idx}" data-act="c-pdf" class="px-2 py-1 border rounded">PDF</button>
        <button data-idx="${idx}" data-act="c-wa" class="px-2 py-1 border rounded">WhatsApp</button>
      </td>
    </tr>
  `).join('');
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
    const text = await readFileAsText(f);
    const { fletes } = importJSONOrCSV(text, 'fletes');
    if (fletes) { state.fletes = fletes; await Promise.all(fletes.map(x=> saveToFirestore('fletes', x.locacion, x))); renderFletes(); populateDatalistLocaciones(); }
    e.target.value = '';
  });
  document.getElementById('f-export-json').addEventListener('click', ()=> exportJSON(state.fletes, 'fletes.json'));
  document.getElementById('f-export-csv').addEventListener('click', ()=> exportCSV(state.fletes, 'fletes.csv'));

  document.getElementById('c-buscar').addEventListener('input', renderCotizaciones);
  document.getElementById('c-orden').addEventListener('change', renderCotizaciones);

  // Config
  document.getElementById('set-iva').addEventListener('change', async (e)=>{ state.settings.ivaPct = parseNumber(e.target.value)||0; await saveToFirestore('settings','general', state.settings); updateResumen(); });
  document.getElementById('set-redondeo').addEventListener('change', async (e)=>{ state.settings.redondeoVisual = e.target.checked; await saveToFirestore('settings','general', state.settings); updateResumen(); renderCotizaciones(); });
  document.getElementById('set-validez-def').addEventListener('change', async (e)=>{ state.settings.validezDefaultDays = parseNumber(e.target.value)||7; await saveToFirestore('settings','general', state.settings); });
  const setMin = document.getElementById('set-minimo'); if (setMin) setMin.addEventListener('change', async (e)=>{ state.settings.importeMinimo = parseNumber(e.target.value)||0; await saveToFirestore('settings','general', state.settings); updateResumen(); });
  document.getElementById('set-politica').addEventListener('change', async (e)=>{ state.settings.politicaTarifa = e.target.value; await saveToFirestore('settings','general', state.settings); updateResumen(); });
  document.getElementById('set-empresa').addEventListener('change', async (e)=>{ state.settings.empresa.nombre = e.target.value; await saveToFirestore('settings','general', state.settings); });
  document.getElementById('set-cuit').addEventListener('change', async (e)=>{ state.settings.empresa.cuit = e.target.value; await saveToFirestore('settings','general', state.settings); });
  document.getElementById('set-direccion').addEventListener('change', async (e)=>{ state.settings.empresa.direccion = e.target.value; await saveToFirestore('settings','general', state.settings); });
  document.getElementById('set-pie').addEventListener('change', async (e)=>{ state.settings.empresa.piePDF = e.target.value; await saveToFirestore('settings','general', state.settings); });
  document.getElementById('set-wa').addEventListener('change', async (e)=>{ state.settings.textoWhatsApp = e.target.value; await saveToFirestore('settings','general', state.settings); });
  const setVend = document.getElementById('set-vendedores'); if (setVend) setVend.addEventListener('change', async (e)=>{ state.settings.vendedores = String(e.target.value||'').split(',').map(s=>s.trim()).filter(Boolean); await saveToFirestore('settings','general', state.settings); renderCotizar(); });
  document.getElementById('set-logo').addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    const b64 = await new Promise((resolve)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result)); r.readAsDataURL(f); });
    state.settings.empresa.logoBase64 = b64;
    saveAll();
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
  document.getElementById('year').textContent = String(new Date().getFullYear());
  initState();
  await initBackend();
  if (!isFirestoreEnabled()) { alert('Configurar Firebase en config/firebase.js para usar la app (cloud-only)'); return; }
  try { await loadAllFromFirestore(); await ensureSeedDataInFirestore(); } catch {}
  setupTabs();
  setupEvents();
  hydrateSettingsUI();
  renderCotizar();
  renderProductos();
  renderFletes();
  renderCotizaciones();
}

main();

// Helpers
function highlightDiasButtons() {
  const d = state.cotizar.dias || 10;
  [['q-d10',10],['q-d20',20],['q-d30',30]].forEach(([id,val])=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('bg-white','bg-brand','text-white');
    if (val===d) { el.classList.add('bg-brand','text-white'); } else { el.classList.add('bg-white'); }
  });
}


