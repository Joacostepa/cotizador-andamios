import { formatARS } from './utils.js';

export function buildWhatsAppLink(state, { cliente, total, locacion, dias }) {
  const base = state.settings.textoWhatsApp || 'Hola, te comparto la cotización de LLAMANA.';
  const msg = `${base}\nCliente: ${cliente||'-'}\nLocación: ${locacion||'-'}\nDías: ${dias}\nTotal: ${formatARS(total, true)}`;
  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return url;
}


