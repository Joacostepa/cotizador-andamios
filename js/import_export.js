import { parseNumber } from './utils.js';

export function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(data, filename) {
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

export function importJSONOrCSV(text, tipo) {
  try {
    const obj = JSON.parse(text);
    if (tipo==='productos') return { productos: sanitizeProductos(obj) };
    if (tipo==='fletes') return { fletes: sanitizeFletes(obj) };
  } catch {
    // CSV
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines.shift().split(',').map(h => h.replace(/^"|"$/g,''));
    const data = lines.map(l => {
      const cols = l.match(/\"([^\"]*)\"|([^,]+)/g)?.map(x=>x.replace(/^"|"$/g,'')) || [];
      const obj = {}; headers.forEach((h,i)=> obj[h] = cols[i]); return obj;
    });
    if (tipo==='productos') return { productos: sanitizeProductos(data) };
    if (tipo==='fletes') return { fletes: sanitizeFletes(data) };
  }
  return {};
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
  return (Array.isArray(arr)?arr:[]).map(f=>({
    locacion: String(f.locacion||'').trim(),
    precio: parseNumber(f.precio)
  })).filter(f=>f.locacion);
}


