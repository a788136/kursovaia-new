// src/services/upload/dropbox.js
import fetch from 'node-fetch';

/**
 * Upload JSON to Dropbox.
 * Required env:
 *  - DROPBOX_ACCESS_TOKEN
 * Optional env:
 *  - DROPBOX_FOLDER (default: /SupportTickets)
 *
 * Поведение:
 *  - Проверяет наличие папки; при отсутствии создаёт её (create_folder_v2)
 *  - Загружает файл (files/upload)
 *  - Пытается создать шэр-линк (create_shared_link_with_settings), если есть право sharing.write
 */
export async function uploadToDropbox(payload, filename) {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) throw new Error('DROPBOX_ACCESS_TOKEN is not set');

  const folder = normalizeFolder(process.env.DROPBOX_FOLDER || '/SupportTickets');
  const path = `${folder}/${filename}`;

  // Убедимся, что папка существует; если нет — создадим.
  await ensureFolderExists(token, folder);

  // Загрузка файла
  const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: false }),
    },
    body: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Dropbox upload failed: ${uploadRes.status} ${text}`);
  }
  const meta = await uploadRes.json();

  // Создаём шэр-линк (не критично, можно игнорировать ошибки)
  let url = null;
  try {
    const shareRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: meta.path_lower }),
    });
    if (shareRes.ok) {
      const link = await shareRes.json();
      url = link?.url?.replace('?dl=0', '?dl=1') || null;
    } else {
      // Если линк уже существует, Dropbox вернёт ошибку — можно попробовать list_shared_links
      const body = await shareRes.text();
      if (body.includes('shared_link_already_exists')) {
        const listRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: meta.path_lower, direct_only: true }),
        });
        if (listRes.ok) {
          const list = await listRes.json();
          const first = list?.links?.[0];
          if (first?.url) url = first.url.replace('?dl=0', '?dl=1');
        }
      }
    }
  } catch (_) {}

  return { provider: 'dropbox', id: meta.id, path: meta.path_lower || path, url };
}

function normalizeFolder(input) {
  let f = input.trim();
  if (!f.startsWith('/')) f = '/' + f;
  return f.replace(/\/+$/, '');
}

async function ensureFolderExists(token, folderPath) {
  // Проверим метаданные папки
  const getMeta = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: folderPath, include_deleted: false }),
  });

  if (getMeta.ok) {
    const meta = await getMeta.json();
    if (meta['.tag'] === 'folder') return; // ок, папка есть
  } else {
    // Если 409/not_found — создадим папку
    const txt = await getMeta.text();
    if (getMeta.status === 409 && txt.includes('path/not_found')) {
      const mk = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: folderPath, autorename: false }),
      });
      if (!mk.ok) {
        const body = await mk.text();
        throw new Error(`Dropbox create_folder_v2 failed: ${mk.status} ${body}`);
      }
      return;
    }
    // Иначе — любая другая ошибка
    throw new Error(`Dropbox get_metadata failed: ${getMeta.status} ${txt}`);
  }
}
