// Order handling: Gemini emits an [ORDER]{...}[/ORDER] block once the customer
// has confirmed; this module parses/validates it and writes the order to the
// Notion Orders database (NOTION_ORDERS_DB_ID). Fetch-only, runtime-agnostic.

import { kvGet, kvSet } from './kv';

const NOTION_VERSION = '2022-06-28';

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

export function ordersEnabled() {
  return Boolean(process.env.NOTION_ORDERS_DB_ID && process.env.NOTION_API_KEY);
}

// ---------------------------------------------------------------------------
// Parse the machine-readable order block out of a Gemini reply
// ---------------------------------------------------------------------------

export function parseOrderBlock(reply) {
  const match = reply.match(/\[ORDER\]\s*(\{[\s\S]*?\})\s*\[\/ORDER\]/);
  const cleanReply = reply
    .replace(/```[a-z]*\s*\[ORDER\][\s\S]*?\[\/ORDER\]\s*```/g, '')
    .replace(/\[ORDER\][\s\S]*?\[\/ORDER\]/g, '')
    .trim();

  if (!match) return { cleanReply, order: null };

  try {
    const order = JSON.parse(match[1]);
    return { cleanReply, order };
  } catch (err) {
    console.error('❗ Order block JSON parse error:', err.message);
    return { cleanReply, order: null };
  }
}

// ---------------------------------------------------------------------------
// Validation — never create an order from incomplete/implausible data
// ---------------------------------------------------------------------------

export function validateOrder(order) {
  const problems = [];
  if (!order || typeof order !== 'object') return ['order missing'];

  const name = String(order.name || '').trim();
  const phone = String(order.phone || '').replace(/[\s\-–—.]/g, '');
  const address = String(order.address || '').trim();
  const product = String(order.product || '').trim();
  const quantity = Number(order.quantity || 0);
  const payment = String(order.payment || '').trim();

  if (name.length < 2) problems.push('name');
  if (!/^(\+?959|09)\d{7,9}$/.test(phone)) problems.push('phone');
  if (address.length < 8) problems.push('address');
  if (product.length < 3) problems.push('product');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) problems.push('quantity');
  if (payment.length < 2) problems.push('payment');

  return problems;
}

// ---------------------------------------------------------------------------
// Create the order row in Notion
// ---------------------------------------------------------------------------

function richText(content) {
  return { rich_text: [{ text: { content: String(content).slice(0, 1990) } }] };
}

export function generateOrderId() {
  // e.g. ORD-MCK3F9 — sortable enough, short enough to read over the phone
  return 'ORD-' + Date.now().toString(36).toUpperCase();
}

export async function createOrderInNotion(order, { orderId, price, senderId, pageId }) {
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_ORDERS_DB_ID },
      properties: {
        'Order ID': { title: [{ text: { content: orderId } }] },
        Status: { select: { name: 'Pending' } },
        'Customer Name': richText(order.name),
        Phone: richText(order.phone),
        Address: richText(order.address),
        Product: richText(order.product),
        Quantity: { number: Number(order.quantity) || 1 },
        Price: richText(price || 'ဈေးနှုန်း စစ်ဆေးရန်'),
        Payment: richText(order.payment),
        Note: richText(order.note || ''),
        'Sender ID': richText(senderId),
        'Page ID': richText(pageId),
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion order create failed: ${response.status} - ${errorText}`);
  }
}

// ---------------------------------------------------------------------------
// Latest order lookup — lets the bot answer "order ဘယ်ရောက်နေပြီလဲ"
// ---------------------------------------------------------------------------

const STATUS_MYANMAR = {
  Pending: 'လက်ခံရရှိပြီး၊ အတည်ပြုရန်စောင့်ဆိုင်းဆဲ',
  Confirmed: 'အတည်ပြုပြီး၊ ပို့ဆောင်ရန်ပြင်ဆင်နေသည်',
  Shipped: 'ပို့ဆောင်နေပြီ',
  Delivered: 'ပို့ဆောင်ပြီးပါပြီ',
  Cancelled: 'ပယ်ဖျက်ပြီး',
};

export async function getLatestOrderForUser(senderId) {
  if (!ordersEnabled()) return null;
  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${process.env.NOTION_ORDERS_DB_ID}/query`,
      {
        method: 'POST',
        headers: notionHeaders(),
        body: JSON.stringify({
          filter: { property: 'Sender ID', rich_text: { equals: senderId } },
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
          page_size: 1,
        }),
      }
    );
    if (!response.ok) return null;

    const data = await response.json();
    const page = data.results?.[0];
    if (!page) return null;

    const props = page.properties || {};
    const status = props['Status']?.select?.name || 'Pending';
    return {
      notionPageId: page.id,
      orderId: props['Order ID']?.title?.[0]?.plain_text || '',
      product: props['Product']?.rich_text?.[0]?.plain_text || '',
      quantity: props['Quantity']?.number || 1,
      status,
      statusMyanmar: STATUS_MYANMAR[status] || status,
      createdTime: page.created_time,
    };
  } catch (err) {
    console.error('❗ Latest order lookup error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Payment slip: append a note to an order row (read-modify-write, since the
// Notion API can't append to rich_text directly)
// ---------------------------------------------------------------------------

export async function appendOrderNote(notionPageId, noteText) {
  const pageResp = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
    headers: notionHeaders(),
  });
  if (!pageResp.ok) throw new Error(`Notion page read failed: ${pageResp.status}`);
  const page = await pageResp.json();
  const existing = (page.properties?.['Note']?.rich_text || [])
    .map((t) => t?.plain_text || '')
    .join('');
  const combined = (existing ? existing + '\n' : '') + noteText;

  const updateResp = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify({
      properties: { Note: richText(combined) },
    }),
  });
  if (!updateResp.ok) throw new Error(`Notion note update failed: ${updateResp.status}`);
}

// ---------------------------------------------------------------------------
// Status-change notifications: compare each recent order's Status against the
// last status we notified (tracked in KV) and message the customer on change.
// ---------------------------------------------------------------------------

export function statusChangeMessage(order) {
  const note = order.note ? `\n${order.note}` : '';
  switch (order.status) {
    case 'Confirmed':
      return `✅ Order ${order.orderId} (${order.product}) ကို အတည်ပြုပြီးပါပြီခင်ဗျ။ ပို့ဆောင်ရန် စီစဉ်နေပါပြီ — ထွက်ခွာသည်နှင့် ထပ်မံအကြောင်းကြားပေးပါမယ်ခင်ဗျာ။`;
    case 'Shipped':
      return `🚚 Order ${order.orderId} (${order.product}) ထွက်ခွာသွားပါပြီခင်ဗျ။ မကြာခင် လက်ခံရရှိပါလိမ့်မယ်။${note}`;
    case 'Delivered':
      return `🎉 Order ${order.orderId} ပို့ဆောင်ပြီးပါပြီခင်ဗျ။ Bonanza ကို ယုံကြည်အားပေးတဲ့အတွက် ကျေးဇူးအထူးတင်ပါတယ်ခင်ဗျာ။ အသုံးပြုရင်း မေးမြန်းလိုသည်များရှိပါက အချိန်မရွေး ဆက်သွယ်နိုင်ပါတယ်။`;
    case 'Cancelled':
      return `Order ${order.orderId} ကို ပယ်ဖျက်လိုက်ပါပြီခင်ဗျ။ မေးမြန်းလိုသည်များရှိပါက ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ။`;
    default:
      return null;
  }
}

export async function getRecentOrders(daysBack = 21) {
  if (!ordersEnabled()) return [];
  const since = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString();
  const response = await fetch(
    `https://api.notion.com/v1/databases/${process.env.NOTION_ORDERS_DB_ID}/query`,
    {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        filter: { timestamp: 'created_time', created_time: { on_or_after: since } },
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        page_size: 50,
      }),
    }
  );
  if (!response.ok) throw new Error(`Notion recent orders query failed: ${response.status}`);
  const data = await response.json();
  const plain = (a) => (a || []).map((t) => t?.plain_text || '').join('').trim();

  return (data.results || [])
    .map((page) => {
      const p = page.properties || {};
      return {
        notionPageId: page.id,
        orderId: plain(p['Order ID']?.title),
        senderId: plain(p['Sender ID']?.rich_text),
        pageId: plain(p['Page ID']?.rich_text),
        product: plain(p['Product']?.rich_text),
        note: plain(p['Note']?.rich_text),
        status: p['Status']?.select?.name || 'Pending',
      };
    })
    .filter((o) => o.orderId && o.senderId && o.pageId);
}

// sendText: async (pageId, senderId, text) => void — supplied by the caller
// (webhook or cron endpoint) since sending lives outside this module.
export async function checkOrderStatusUpdates(sendText) {
  const orders = await getRecentOrders();
  let notified = 0;
  for (const order of orders) {
    const key = `orderStatus:${order.orderId}`;
    const lastNotified = await kvGet(key);
    if (lastNotified === null) {
      // First sighting — record the baseline without messaging the customer
      await kvSet(key, order.status, 60 * 24 * 3600);
      continue;
    }
    if (String(lastNotified) === order.status) continue;

    const message = statusChangeMessage(order);
    if (message) {
      try {
        await sendText(order.pageId, order.senderId, message);
        notified++;
        console.log(`📦 Status noti sent: ${order.orderId} → ${order.status}`);
      } catch (err) {
        console.error(`❗ Status noti failed for ${order.orderId}:`, err.message);
      }
    }
    await kvSet(key, order.status, 60 * 24 * 3600);
  }
  return notified;
}
