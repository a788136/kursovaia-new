// services/customId.js
const crypto = require('crypto');

/**
 * Формат ожидается как у фронта:
 * {
 *   enabled: true,
 *   elements: [
 *     { id, type: 'fixed',  value: 'ABC-' },
 *     { id, type: 'rand20', fmt: 'X5_' },   // X5_ (5 hex) или D<n>[_]
 *     { id, type: 'seq',    fmt: 'D3'  },   // D (без нулей) или D<n> (с нулями)
 *     { id, type: 'date',   fmt: 'yyyy' }   // yyyy, yy, MM, M, dd, d, ddd
 *   ]
 * }
 */

function leftPad(num, size) {
  const s = String(num);
  if (!size || size <= 0) return s;
  return s.padStart(size, '0');
}

function formatRand20(fmt = 'X5_') {
  const n = crypto.randomBytes(3); // 24 бита; нам нужно 20 — отбросим старшие
  const raw = ((n[0] << 16) | (n[1] << 8) | n[2]) & 0xFFFFF; // 20 бит

  const hasUnderscore = fmt.endsWith('_');
  const suffix = hasUnderscore ? '_' : '';

  if (/^X5_?$/i.test(fmt)) {
    return raw.toString(16).toUpperCase().padStart(5, '0') + suffix;
  }
  const m = /^D(\d+)_?$/i.exec(fmt);
  if (m) {
    const len = Number(m[1] || 6);
    return String(raw).padStart(len, '0').slice(0, len) + suffix;
  }
  // дефолт — hex
  return raw.toString(16).toUpperCase().padStart(5, '0') + suffix;
}

function formatSeq(seqNumber, fmt = 'D') {
  const m = /^D(\d+)?$/i.exec(fmt || 'D');
  if (!m) return String(seqNumber);
  const pad = Number(m[1] || 0);
  return pad > 0 ? leftPad(seqNumber, pad) : String(seqNumber);
}

function formatDateToken(d, fmt = 'yyyy') {
  if (!fmt) return '';
  const s = String(fmt);

  // Если нет токенов — вернуть как есть (пользователь ввёл "2015" и т.п.)
  if (!/[yMdHhms]/i.test(s)) return s;

  const map = {
    yyyy: d.getFullYear().toString(),
    yy: d.getFullYear().toString().slice(-2),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    M: String(d.getMonth() + 1),
    dd: String(d.getDate()).padStart(2, '0'),
    d: String(d.getDate()),
    ddd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
  };
  let out = s;
  for (const [k, v] of Object.entries(map)) out = out.replaceAll(k, v);
  return out;
}

/**
 * Генерация строкового ID из формата.
 * @param {Object} format - customIdFormat
 * @param {number|null} seqNumber - порядковый номер для всех seq-элементов в этом ID
 * @param {Date} dateSource - дата для date-элементов (обычно new Date())
 * @returns {string}
 */
function buildCustomId(format, seqNumber = null, dateSource = new Date()) {
  if (!format?.enabled) {
    throw new Error('Custom ID format is disabled or missing');
  }
  const elements = Array.isArray(format.elements) ? format.elements : [];
  const parts = [];

  for (const el of elements) {
    switch (el?.type) {
      case 'fixed':
        parts.push(el?.value ?? '');
        break;
      case 'rand20':
        parts.push(formatRand20(el?.fmt ?? 'X5_'));
        break;
      case 'seq': {
        if (seqNumber == null) {
          // Если в формате есть seq — он должен быть предоставлен.
          throw new Error('Sequence number not provided for seq element');
        }
        parts.push(formatSeq(seqNumber, el?.fmt ?? 'D'));
        break;
      }
      case 'date':
        parts.push(formatDateToken(dateSource, el?.fmt ?? 'yyyy'));
        break;
      default:
        parts.push('');
    }
  }

  const out = parts.join('');
  if (!out || !out.trim()) {
    throw new Error('Generated custom_id is empty');
  }
  return out;
}

module.exports = {
  buildCustomId,
};
