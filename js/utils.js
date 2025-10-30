export function formatARS(value, roundVisual) {
  const v = roundVisual ? Math.round(value) : value;
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: roundVisual ? 0 : 2 }).format(v || 0);
}

export function parseNumber(v) {
  if (v===null || v===undefined) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n) ? n : 0;
}

export function readFileAsText(file) {
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result));
    r.onerror = reject;
    r.readAsText(file);
  });
}


