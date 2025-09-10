// src/services/upload/index.js
import { uploadToDropbox } from './dropbox.js';

/**
 * Uploads Support Ticket JSON to Dropbox.
 * Uses env:
 *  - DROPBOX_ACCESS_TOKEN
 *  - DROPBOX_FOLDER (default: /SupportTickets)
 */
export async function uploadSupportTicketJSON({ payload, filename }) {
  return await uploadToDropbox(payload, filename);
}