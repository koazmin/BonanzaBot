// Order handling: Gemini emits an [ORDER]{...}[/ORDER] block once the customer
// has confirmed; this module parses/validates it and writes the order to the
// Notion Orders database (NOTION_ORDERS_DB_ID). Fetch-only, runtime-agnostic.

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
