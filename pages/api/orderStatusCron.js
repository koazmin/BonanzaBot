// Backup sweep for order status notifications. The webhook already sweeps on
// incoming traffic (throttled); this endpoint covers quiet periods. Wired to
// Vercel Cron (vercel.json) and can also be hit by any external scheduler:
//   GET /api/orderStatusCron  (Authorization: Bearer <CRON_SECRET> if set)
import { checkOrderStatusUpdates, ordersEnabled } from '../../lib/orders';

const pageTokens = {
  [process.env.PAGE_ID_EREADER]: process.env.PAGE_ACCESS_TOKEN_EREADER,
  [process.env.PAGE_ID_GADGETS]: process.env.PAGE_ACCESS_TOKEN_GADGETS,
};

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  if (!ordersEnabled()) {
    return res.status(200).json({ ok: true, notified: 0, reason: 'orders disabled' });
  }

  try {
    const notified = await checkOrderStatusUpdates(async (pageId, senderId, text) => {
      const token = pageTokens[pageId];
      if (!token) return;
      const response = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: senderId },
            messaging_type: 'RESPONSE',
            message: { text: text.slice(0, 1900) },
          }),
        }
      );
      if (!response.ok) {
        console.error('❗ Cron status send error:', response.status, await response.text());
      }
    });
    return res.status(200).json({ ok: true, notified });
  } catch (err) {
    console.error('❗ orderStatusCron error:', err);
    return res.status(500).json({ ok: false });
  }
}
