// src/routes/support.js
import { Router } from 'express';
import optionalAuth from '../middleware/optionalAuth.js';

const router = Router();

/**
 * POST /support/tickets
 * Body: { summary: string, priority: 'High'|'Average'|'Low', link?: string, template?: string }
 * Env: SUPPORT_ADMIN_EMAILS, APP_NAME
 * Uses upload service: src/services/upload/index.js (Dropbox-only версия)
 */
router.post('/support/tickets', optionalAuth, async (req, res, next) => {
  try {
    const { summary, priority, link, template } = req.body || {};
    if (!summary || !priority) {
      return res.status(400).json({ error: 'summary and priority are required' });
    }

    const adminsStr = process.env.SUPPORT_ADMIN_EMAILS || '';
    const admins = adminsStr.split(',').map(s => s.trim()).filter(Boolean);

    const user = req.user || null;
    const payload = {
      reportedBy: user ? {
        id: String(user._id || user.id || ''),
        name: user.name || user.displayName || user.email || 'Unknown',
        email: user.email || null
      } : { id: null, name: 'Anonymous', email: null },
      template: template || '',
      link: link || req.get('referer') || '',
      priority,
      summary,
      admins,
      createdAt: new Date().toISOString(),
      app: process.env.APP_NAME || 'kursovoi',
      env: process.env.NODE_ENV || 'development'
    };

    const filename = `ticket-${Date.now()}.json`;
    const { uploadSupportTicketJSON } = await import('../services/upload/index.js');
    const file = await uploadSupportTicketJSON({ payload, filename });
    return res.json({ ok: true, file, payload });
  } catch (err) {
    next(err);
  }
});

export default router;
