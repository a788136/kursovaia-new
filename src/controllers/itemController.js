// src/controllers/itemController.js
import mongoose from 'mongoose';
import Item from '../models/Item.js';
import Inventory from '../models/Inventory.js';
import Counter from '../models/Counter.js';
import { composeCustomId } from '../utils/customId.js';

/**
 * Получить следующее последовательное число для инвентаризации (атомарно).
 * key: inv:<inventoryId>
 */
async function getNextSeqNumber(inventoryId) {
  const key = `inv:${inventoryId}`;
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 }, $set: { updated_at: new Date() } },
    { new: true, upsert: true }
  ).lean();
  return doc.seq;
}

/**
 * Сгенерировать custom_id по формату, хранящемуся в инвентаризации.
 * Если формата нет — по умолчанию используем {seq: 'D'}.
 */
async function generateCustomId(inventory, options = {}) {
  const cfg = inventory?.customIdFormat || { enabled: true, elements: [{ id: 'seq', type: 'seq', fmt: 'D' }] };

  // На один item одна последовательность, даже если элементов seq несколько — используем одно число
  const hasSeq = (cfg.elements || []).some(e => e.type === 'seq');
  const seqNumber = hasSeq ? await getNextSeqNumber(inventory._id) : undefined;

  return composeCustomId(cfg.elements || [], {
    seqNumber,
    // фиксируем sampleDate = сейчас (или можно взять created_at)
    sampleDate: new Date(),
    baseRandMap: new Map(), // на одну генерацию держим локально
  });
}

/**
 * GET /inventories/:id/items
 */
export async function listItems(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid inventory id' });

    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    const [items, total] = await Promise.all([
      Item.find({ inventory: id })
        .sort({ created_at: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Item.countDocuments({ inventory: id })
    ]);

    res.json({ items, total, limit, offset });
  } catch (e) {
    console.error('listItems error', e);
    res.status(500).json({ error: 'Failed to list items' });
  }
}

/**
 * POST /inventories/:id/items
 * body: { fields?: object, custom_id?: string }  // custom_id обычно не передаём — генерится на бэке
 */
export async function createItem(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid inventory id' });

    const inventory = await Inventory.findById(id).lean();
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    const fields = (req.body && typeof req.body === 'object' ? req.body.fields : null) || {};
    const createdBy = req.user?._id || null;

    // Если custom_id не прислали — генерируем по формату
    let customId = (req.body && req.body.custom_id) || null;

    const hasRandOrSeq = !customId; // будем пытаться несколько раз при коллизиях
    const maxAttempts = 5;

    for (let attempt = 0; attempt < (hasRandOrSeq ? maxAttempts : 1); attempt++) {
      if (!customId) {
        customId = await generateCustomId(inventory);
      }

      try {
        const doc = await Item.create({
          inventory: id,
          custom_id: String(customId),
          fields,
          created_by: createdBy,
        });
        return res.status(201).json(doc);
      } catch (err) {
        // E11000 — дубликат составного уникального индекса (inventory + custom_id)
        if (err && err.code === 11000) {
          // При коллизии — пробуем сгенерировать заново (даже если это был seq — возьмём следующий)
          customId = null;
          continue;
        }
        throw err;
      }
    }

    // Если все попытки исчерпаны
    return res.status(409).json({ error: 'Failed to generate unique custom_id' });
  } catch (e) {
    console.error('createItem error', e);
    res.status(500).json({ error: 'Failed to create item' });
  }
}

/**
 * PUT /items/:itemId
 * body: { fields?: object }  // custom_id менять не даём (обычно нельзя)
 */
export async function updateItem(req, res) {
  try {
    const { itemId } = req.params;
    if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ error: 'Invalid item id' });

    const patch = {};
    if (req.body && typeof req.body === 'object') {
      if (req.body.fields != null) patch.fields = req.body.fields;
      // custom_id специально НЕ разрешаем менять без отдельного требования
    }

    const doc = await Item.findByIdAndUpdate(itemId, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Item not found' });

    res.json(doc);
  } catch (e) {
    console.error('updateItem error', e);
    res.status(500).json({ error: 'Failed to update item' });
  }
}

/**
 * DELETE /items/:itemId
 * Каскад удалений нам не нужен — записи Item не ссылаются на дочерние сущности.
 * Если бы ссылки были — полагались бы на каскад на уровне БД/схемы.
 */
export async function deleteItem(req, res) {
  try {
    const { itemId } = req.params;
    if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ error: 'Invalid item id' });

    const r = await Item.deleteOne({ _id: itemId });
    if (r.deletedCount === 0) return res.status(404).json({ error: 'Item not found' });

    res.status(204).send();
  } catch (e) {
    console.error('deleteItem error', e);
    res.status(500).json({ error: 'Failed to delete item' });
  }
}
