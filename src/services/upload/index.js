// src/services/upload/index.js  — OneDrive-only версия
import { uploadToOneDrive } from './onedrive.js';

export async function uploadSupportTicketJSON({ payload, filename }) {
  return await uploadToOneDrive(payload, filename);
}