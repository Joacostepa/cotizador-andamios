import { state } from './state.js';

export function selectTarifa(dias) {
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
    // política no activa por UI, implementada: prorrateo lineal entre tramos 10/20/30
    const p10 = producto.precio_10||0;
    const p20 = producto.precio_20||0;
    const p30 = producto.precio_30||0;
    if (dias <= 10) return p10 * (dias/10);
    if (dias <= 20) return p20 * (dias/20);
    if (dias <= 30) return p30 * (dias/30);
    const bloques = Math.floor(dias/30);
    const residuo = dias - bloques*30;
    const totalBloques = bloques * p30;
    const residuoProrr = residuo<=10 ? p10*(residuo/10) : residuo<=20 ? p20*(residuo/20) : p30*(residuo/30);
    return totalBloques + residuoProrr;
  }

  // Escalonada (default)
  if (dias <= 30) return precioPorTarifa(producto, selectTarifa(dias));
  const bloques = Math.floor(dias/30);
  const residuo = dias - bloques*30;
  const totalBloques = bloques * (producto.precio_30||0);
  const residual = residuo===0 ? 0 : (residuo<=10 ? producto.precio_10||0 : residuo<=20 ? producto.precio_20||0 : producto.precio_30||0);
  return totalBloques + residual;
}

export function calcularItem(producto, cantidad, dias) {
  const precioFraccion = calcularPrecioPorDias(producto, dias);
  const unitario = precioFraccion; // precio total por fracción
  const subtotal = unitario * (cantidad||1);
  const etiquetaTarifa = dias>30 ? '30+residuo' : selectTarifa(dias);
  return { unitario, subtotal, etiquetaTarifa };
}

export function calcularTotales(stateRef, dias, flete, descuentoPct, aplicarIVA=false) {
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


