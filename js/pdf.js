// Carga on-demand de jsPDF desde CDN si no existe
async function ensureJsPDF() {
  if (window.jspdf || window.jsPDF) return;
  await new Promise((resolve)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = resolve; document.head.appendChild(s);
  });
}

import { formatARS } from './utils.js';

export async function exportPDF(state, data) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF();

  const empresa = state.settings.empresa;
  let y = 15;
  if (empresa.logoBase64) {
    try { doc.addImage(empresa.logoBase64, 'PNG', 15, 10, 25, 25); } catch {}
  }
  doc.setFontSize(16);
  doc.text(empresa.nombre || 'LLAMANA', 45, 20);
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


