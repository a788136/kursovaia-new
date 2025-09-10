// src/services/upload/onedrive.js
import fetch from 'node-fetch';

/**
 * Upload JSON to OneDrive via Microsoft Graph.
 * Easiest for demo: use a pre-generated ONEDRIVE_ACCESS_TOKEN (bearer) with Files.ReadWrite.
 * Required env:
 *  - ONEDRIVE_ACCESS_TOKEN
 * Optional env:
 *  - ONEDRIVE_FOLDER (default: SupportTickets)
 *  - ONEDRIVE_DRIVE (default: 'me')  // can also be 'sites/{site-id}', etc.
 */
export async function uploadToOneDrive(payload, filename) {
  const token = process.env.ONEDRIVE_ACCESS_TOKEN;
  if (!token) throw new Error('ONEDRIVE_ACCESS_TOKEN is not set');
  const folder = (process.env.ONEDRIVE_FOLDER || 'SupportTickets').replace(/^\/+|\/+$/g, '');
  const drive = process.env.ONEDRIVE_DRIVE || 'me';

  const url = `https://graph.microsoft.com/v1.0/${drive}/drive/root:/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}:/content`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload, null, 2)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneDrive upload failed: ${res.status} ${text}`);
  }
  const meta = await res.json();
  const path = (meta?.parentReference?.path ? `${meta.parentReference.path}/${meta.name}` : `/${folder}/${filename}`);
  const webUrl = meta?.webUrl || null;
  return { provider: 'onedrive', id: meta.id, path, url: webUrl };
}
