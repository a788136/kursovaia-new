// routes/_shared.js
import mongoose from 'mongoose';
import { requireAuth as _requireAuth } from '../middleware/auth.js';

export const db = () => mongoose.connection.db;

/* ------------ helpers ------------ */
export function toObjectId(id) {
  if (typeof id === 'string' && mongoose.isValidObjectId(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  if (id instanceof mongoose.Types.ObjectId) return id;
  return null;
}

export function normalizeTags(arr) {
  if (!Array.isArray(arr)) return [];
  const uniq = new Set(
    arr.map((t) => String(t ?? '').trim().toLowerCase()).filter(Boolean)
  );
  return Array.from(uniq);
}

export function canEdit(user, doc) {
  if (!user) return false;
  if (user.isAdmin || user.role === 'admin') return true;
  return String(doc.owner_id) === String(user._id);
}

export function isAdmin(user) {
  return !!(user && (user.isAdmin || user.role === 'admin'));
}

export function requireAdmin(req, res, next) {
  return _requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  });
}

// Пробрасываем requireAuth для удобства импорта из одного места
export const requireAuth = _requireAuth;

// Нормализованный ответ для списка (AllInventories)
export function toClientLite(inv) {
  return {
    _id: String(inv._id),
    name: inv.name || inv.title || 'Без названия',
    description: inv.description || '',
    cover: inv.cover || inv.image || null,
    tags: Array.isArray(inv.tags) ? inv.tags : [],
    owner: inv.owner ?? null,
    owner_id: inv.owner_id ?? (typeof inv.owner === 'string' ? inv.owner : undefined),
    createdAt: inv.createdAt ?? inv.created_at ?? null,
    updatedAt: inv.updatedAt ?? inv.updated_at ?? null,
  };
}

// Нормализованный ответ для детальной страницы (InventoryDetails.jsx)
export function toClientFull(inv) {
  return {
    _id: String(inv._id),
    name: inv.name || inv.title || '',
    description: inv.description || '',
    category: inv.category || null,
    cover: inv.cover || inv.image || null,
    tags: Array.isArray(inv.tags) ? inv.tags : [],
    customIdFormat: inv.customIdFormat ?? inv.custom_id_format ?? null,
    fields: Array.isArray(inv.fields) ? inv.fields : [],
    access: (inv.access && typeof inv.access === 'object') ? inv.access : {},
    stats: (inv.stats && typeof inv.stats === 'object') ? inv.stats : {},
    owner: inv.owner ?? null,
    owner_id: inv.owner_id ?? (typeof inv.owner === 'string' ? inv.owner : undefined),
    createdAt: inv.createdAt ?? inv.created_at ?? null,
    updatedAt: inv.updatedAt ?? inv.updated_at ?? null,
  };
}

/* ====== ВАЛИДАТОРЫ (ШАГ 5) для fields[] и customIdFormat ====== */
export function validateFieldDef(f) {
  if (!f || typeof f !== 'object') return 'field must be an object';
  const key = String(f.key || '').trim();
  const label = String(f.label || '').trim();
  const type = String(f.type || '').trim();

  if (!key) return 'field.key is required';
  if (!/^[a-zA-Z0-9_\-]+$/.test(key)) return 'field.key must be alphanumeric/underscore/dash';
  if (!label) return 'field.label is required';
  if (!type) return 'field.type is required';

  if (type === 'select' && !Array.isArray(f.options)) {
    return 'field.options must be an array for type=select';
  }
  if (type === 'number') {
    if (f.min != null && typeof f.min !== 'number') return 'field.min must be number';
    if (f.max != null && typeof f.max !== 'number') return 'field.max must be number';
  }
  return null;
}

export function validateFieldsArray(fields) {
  if (!Array.isArray(fields)) return 'fields must be an array';
  const keys = new Set();
  for (const f of fields) {
    const err = validateFieldDef(f);
    if (err) return err;
    const k = String(f.key).trim().toLowerCase();
    if (keys.has(k)) return `duplicate field key: ${f.key}`;
    keys.add(k);
  }
  return null;
}

/**
 * customIdFormat см. исходный пример
 */
export function validateCustomIdFormat(cfg) {
  if (cfg == null) return null;
  if (typeof cfg !== 'object') return 'customIdFormat must be an object';
  if (!Array.isArray(cfg.elements)) return 'customIdFormat.elements must be an array';

  for (const el of cfg.elements) {
    if (!el || typeof el !== 'object') return 'element must be an object';
    const type = String(el.type || '').trim();
    if (!type) return 'element.type is required';

    if (type === 'text') {
      if (typeof el.value !== 'string') return 'text.value must be string';
    } else if (type === 'date') {
      if (typeof el.format !== 'string' || !el.format) return 'date.format is required';
    } else if (type === 'seq') {
      if (el.pad != null && (typeof el.pad !== 'number' || el.pad < 0)) return 'seq.pad must be >=0';
      if (el.scope && !['global', 'inventory'].includes(el.scope)) return 'seq.scope must be "global" or "inventory"';
    } else if (type === 'field') {
      if (typeof el.key !== 'string' || !el.key) return 'field.key is required for element.type=field';
    } else {
      return `unsupported element.type: ${type}`;
    }
  }
  if (cfg.separator != null && typeof cfg.separator !== 'string') {
    return 'customIdFormat.separator must be string';
  }
  if (cfg.enabled != null && typeof cfg.enabled !== 'boolean') {
    return 'customIdFormat.enabled must be boolean';
  }
  return null;
}

/* ====== поиск ====== */
export function buildTextFilter(q, fields) {
  const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

/* ====== РОЛИ ПОЛЬЗОВАТЕЛЯ В КОНТЕКСТЕ ИНВЕНТАРИЗАЦИИ ====== */
/**
 * Возвращает массив ролей пользователя относительно инвентаризации:
 * - 'non-authenticated' | 'authenticated'
 * - 'admins' (если user.isAdmin || user.role === 'admin')
 * - 'creators' (если user владелец инвентаризации)
 * - 'write-access' (если есть запись в inventoryaccesses с accessType='write')
 */
export async function getInventoryRoles(user, invLike) {
  try {
    if (!user) return ['non-authenticated'];

    const roles = ['authenticated'];
    if (user.isAdmin || user.role === 'admin') roles.push('admins');

    // Определяем invId и ownerId
    const invId =
      (invLike && invLike._id && toObjectId(invLike._id)) ||
      (typeof invLike === 'string' && toObjectId(invLike)) ||
      null;

    const ownerRaw =
      invLike?.owner_id ??
      (invLike?.owner && (invLike.owner._id || invLike.owner.id)) ??
      null;

    const userIdStr = String(user._id ?? user.id ?? '');
    if (ownerRaw && String(ownerRaw) === userIdStr) roles.push('creators');

    if (invId) {
      const uid = toObjectId(userIdStr);
      if (uid) {
        const rec = await db()
          .collection('inventoryaccesses')
          .findOne({ inventoryId: invId, userId: uid });
        if (rec && String(rec.accessType || '').toLowerCase() === 'write') {
          roles.push('write-access');
        }
      }
    }

    return roles;
  } catch {
    return user ? ['authenticated'] : ['non-authenticated'];
  }
}
