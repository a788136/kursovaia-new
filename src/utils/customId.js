// src/utils/customId.js

// Формат rand20 по шаблону: X5 / X5_ (hex 5 символов), Dn / Dn_ (десятичное с ведущими нулями)
function formatRand20(base20, fmt = 'X5_') {
  const suffix = fmt.endsWith('_') ? '_' : '';
  if (/^X5_?$/i.test(fmt)) {
    return (base20 >>> 0).toString(16).toUpperCase().padStart(5, '0') + suffix;
  }
  const m = /^D(\d+)_?$/i.exec(fmt);
  if (m) {
    const len = Number(m[1] || 6);
    return String(base20 >>> 0).padStart(len, '0').slice(0, len) + suffix;
  }
  // по умолчанию hex
  return (base20 >>> 0).toString(16).toUpperCase().padStart(5, '0') + suffix;
}

// Простейшее форматирование даты (токены из ТЗ)
function formatDate(date, fmt = 'yyyy') {
  if (!fmt) return '';
  const s = String(fmt);

  // Если нет известных токенов — вернуть как есть (позволяет писать "2015", "Q1", и т.п.)
  if (!/[yMdHhms]/i.test(s)) return s;

  const map = {
    yyyy: date.getFullYear().toString(),
    yy: date.getFullYear().toString().slice(-2),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    M: String(date.getMonth() + 1),
    dd: String(date.getDate()).padStart(2, '0'),
    d: String(date.getDate()),
    ddd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
  };
  let out = s;
  for (const [k, v] of Object.entries(map)) out = out.replaceAll(k, v);
  return out;
}

// Форматирование последовательности: Dn (с нулями) или D (без нулей)
function formatSeq(n, fmt = 'D') {
  const m = /^D(\d+)?$/i.exec(fmt);
  if (!m) return String(n);
  const pad = Number(m[1] || 0);
  return pad > 0 ? String(n).padStart(pad, '0') : String(n);
}

// Сборка custom_id из конфигурации.
// elements: [{type, value|fmt}, ...]
// options: { seqNumber, sampleDate, baseRandMap }
export function composeCustomId(elements = [], options = {}) {
  const parts = [];
  const sampleDate = options.sampleDate || new Date();
  const baseRandMap = options.baseRandMap || new Map(); // id -> 20-bit base

  for (const el of elements) {
    switch (el.type) {
      case 'fixed':
        parts.push(el.value ?? '');
        break;
      case 'rand20': {
        let base = baseRandMap.get(el.id);
        if (base == null) {
          base = crypto.getRandomValues(new Uint32Array(1))[0] & 0xFFFFF;
          baseRandMap.set(el.id, base);
        }
        parts.push(formatRand20(base, el.fmt ?? 'X5_'));
        break;
      }
      case 'seq': {
        const n = options.seqNumber ?? 1;
        parts.push(formatSeq(n, el.fmt ?? 'D'));
        break;
      }
      case 'date':
        parts.push(formatDate(sampleDate, el.fmt ?? 'yyyy'));
        break;
      default:
        parts.push('');
    }
  }

  return parts.join('');
}
