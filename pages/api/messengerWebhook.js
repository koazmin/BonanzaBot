import crypto from 'crypto';
import { Client } from '@notionhq/client';
import { askGemini, lookupPrice, BUSY_MESSAGE, NETWORK_ERROR_MESSAGE } from '../../lib/gemini';
import { kvGet, kvSet, kvDelete, kvSetIfNotExists } from '../../lib/kv';
import {
  ordersEnabled,
  parseOrderBlock,
  validateOrder,
  generateOrderId,
  createOrderInNotion,
  getLatestOrderForUser,
} from '../../lib/orders';

// Raw body is needed to verify Facebook's X-Hub-Signature-256 header
export const config = {
  api: { bodyParser: false },
};

const pageTokens = {
  [process.env.PAGE_ID_EREADER]: process.env.PAGE_ACCESS_TOKEN_EREADER,
  [process.env.PAGE_ID_GADGETS]: process.env.PAGE_ACCESS_TOKEN_GADGETS,
};

// Admin PSIDs for order notifications (PSIDs are page-scoped, so one per page).
// Get yours by messaging the page the word: adminid
const adminPsids = {
  [process.env.PAGE_ID_EREADER]: process.env.ADMIN_PSID_EREADER,
  [process.env.PAGE_ID_GADGETS]: process.env.ADMIN_PSID_GADGETS,
};

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// Facebook Page Inbox app id — echoes from a human replying in the Page inbox
// carry this app_id (or none), while bot-sent messages carry our own app id.
const PAGE_INBOX_APP_ID = '263902037430900';

// How long the bot stays quiet for a conversation after a human takes over
const HUMAN_TAKEOVER_HOURS = Number(process.env.HUMAN_TAKEOVER_HOURS || 6);

// Messenger hard limit is 2000 chars per message; keep a safety margin
const MESSAGE_CHAR_LIMIT = 1900;

const QUICK_REPLIES = [
  { content_type: 'text', title: '💰 ဈေးနှုန်းများ', payload: 'QR_PRICES' },
  { content_type: 'text', title: '📚 မော်ဒယ်ရွေးရန်', payload: 'QR_COMPARE' },
  { content_type: 'text', title: '🛒 Order တင်မယ်', payload: 'QR_ORDER' },
  { content_type: 'text', title: '👨‍💼 Admin နဲ့ပြောမယ်', payload: 'TALK_TO_HUMAN' },
];

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Global pause (admin kill-switch): toggle the "Paused" checkbox on the
// BotState row in Notion. Cached for 60s so we don't query Notion per message.
// ---------------------------------------------------------------------------

let globalPauseCache = { value: false, fetchedAt: 0 };

// Set the global pause flag (BotState row in Notion) and refresh the cache so
// it takes effect immediately on this instance.
async function setGlobalPause(paused) {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: { property: 'Type', rich_text: { equals: 'BotState' } },
      page_size: 1,
    });
    if (response.results.length > 0) {
      await notion.pages.update({
        page_id: response.results[0].id,
        properties: { Paused: { checkbox: paused } },
      });
    } else {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          Type: { rich_text: [{ text: { content: 'BotState' } }] },
          Paused: { checkbox: paused },
        },
      });
    }
    globalPauseCache = { value: paused, fetchedAt: Date.now() };
  } catch (err) {
    console.error('❗ Error setting global pause state in Notion:', err);
  }
}

async function getGlobalPauseState() {
  if (Date.now() - globalPauseCache.fetchedAt < 60 * 1000) return globalPauseCache.value;
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: { property: 'Type', rich_text: { equals: 'BotState' } },
      page_size: 1,
    });
    const paused =
      response.results.length > 0 &&
      response.results[0].properties['Paused']?.checkbox === true;
    globalPauseCache = { value: paused, fetchedAt: Date.now() };
    return paused;
  } catch (err) {
    console.error('❗ Error reading pause state from Notion:', err);
    return globalPauseCache.value;
  }
}

// ---------------------------------------------------------------------------
// Per-conversation human takeover
// ---------------------------------------------------------------------------

function pauseKey(pageId, userId) {
  return `paused:${pageId}:${userId}`;
}

async function pauseConversation(pageId, userId) {
  await kvSet(pauseKey(pageId, userId), '1', HUMAN_TAKEOVER_HOURS * 3600);
}

async function resumeConversation(pageId, userId) {
  await kvDelete(pauseKey(pageId, userId));
}

async function isConversationPaused(pageId, userId) {
  return (await kvGet(pauseKey(pageId, userId))) !== null;
}

// ---------------------------------------------------------------------------
// Messenger send helpers
// ---------------------------------------------------------------------------

async function callSendAPI(pageAccessToken, payload) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❗ Messenger Send API error:', response.status, errorText);
    }
  } catch (err) {
    console.error('❗ Messenger Send API network error:', err.message);
  }
}

async function sendSenderAction(recipientId, action, pageAccessToken) {
  await callSendAPI(pageAccessToken, {
    recipient: { id: recipientId },
    sender_action: action,
  });
}

// Split long text at paragraph/sentence boundaries so every chunk fits
// Messenger's 2000-char limit (messages over the limit are silently rejected).
function splitMessage(text, limit = MESSAGE_CHAR_LIMIT) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf('။', limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendMessage(recipientId, message, pageAccessToken, { quickReplies } = {}) {
  const chunks = splitMessage(message);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const messagePayload = { text: chunks[i] };
    if (isLast && quickReplies) messagePayload.quick_replies = quickReplies;
    await callSendAPI(pageAccessToken, {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: messagePayload,
    });
  }
}

// Notify the page admin about a new order. Uses a MESSAGE_TAG send so it works
// outside the 24-hour messaging window (admin should still message the page
// occasionally; the order is always in Notion regardless).
async function notifyAdmin(pageId, pageAccessToken, text) {
  const adminPsid = adminPsids[pageId];
  if (!adminPsid) {
    console.warn(`⚠️ No ADMIN_PSID configured for page ${pageId} — order noti skipped.`);
    return;
  }
  for (const chunk of splitMessage(text)) {
    await callSendAPI(pageAccessToken, {
      recipient: { id: adminPsid },
      messaging_type: 'MESSAGE_TAG',
      tag: 'ACCOUNT_UPDATE',
      message: { text: chunk },
    });
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function formatOrderSummary(order, orderId, price) {
  return [
    `✅ Order တင်ပြီးပါပြီခင်ဗျ။`,
    ``,
    `Order နံပါတ်: ${orderId}`,
    `ပစ္စည်း: ${order.product} x ${order.quantity}`,
    `ဈေးနှုန်း: ${price || 'Admin မှ အတည်ပြုပေးပါမည်'}`,
    `အမည်: ${order.name}`,
    `ဖုန်း: ${order.phone}`,
    `လိပ်စာ: ${order.address}`,
    `ငွေချေနည်း: ${order.payment}`,
    ``,
    `Admin က မကြာခင် ဆက်သွယ်ပြီး အတည်ပြုပေးပါမယ်ခင်ဗျာ။ ကျေးဇူးတင်ပါတယ် 🙏`,
  ].join('\n');
}

function formatAdminNotification(order, orderId, price, senderId) {
  return [
    `🛒 Order အသစ်ရောက်ပါပြီ — ${orderId}`,
    ``,
    `ပစ္စည်း: ${order.product} x ${order.quantity}`,
    `ဈေးနှုန်း: ${price || '⚠️ စာရင်းထဲမတွေ့ပါ — စစ်ဆေးပေးပါ'}`,
    `Customer: ${order.name} (${order.phone})`,
    `လိပ်စာ: ${order.address}`,
    `ငွေချေနည်း: ${order.payment}`,
    order.note ? `မှတ်ချက်: ${order.note}` : null,
    ``,
    `Notion "Bonanza Orders" ထဲမှာ Pending status ဖြင့် သိမ်းထားပါပြီ။`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

// Returns the confirmation text to send the customer, or null if no valid
// order was found in the reply.
async function handleOrderBlock(order, senderId, pageId, pageAccessToken) {
  const problems = validateOrder(order);
  if (problems.length > 0) {
    console.warn(`⚠️ Order block rejected (missing/invalid: ${problems.join(', ')})`);
    return null;
  }

  const orderId = generateOrderId();
  const price = lookupPrice(order.product);

  try {
    await createOrderInNotion(order, { orderId, price, senderId, pageId });
  } catch (err) {
    console.error('❗ Order create failed:', err.message);
    return (
      'တောင်းပန်ပါတယ်ခင်ဗျ — order စနစ်ထဲ သိမ်းရာမှာ အနည်းငယ် အဆင်မပြေဖြစ်သွားပါတယ်။ ' +
      'ဖုန်း 09954454499 သို့ တိုက်ရိုက်ဆက်သွယ်ပေးပါခင်ဗျာ။'
    );
  }

  await notifyAdmin(pageId, pageAccessToken, formatAdminNotification(order, orderId, price, senderId));
  return formatOrderSummary(order, orderId, price);
}

// Latest order status injected into the system prompt so the bot can answer
// "order ဘယ်ရောက်နေပြီလဲ" from real data instead of guessing.
async function buildOrderContext(senderId) {
  if (!ordersEnabled()) return null;
  const latest = await getLatestOrderForUser(senderId);
  if (!latest) return null;
  return (
    `### Customer's Existing Order (order status မေးလျှင် ဤအချက်ဖြင့်သာဖြေပါ):\n` +
    `- Order နံပါတ်: ${latest.orderId}\n` +
    `- ပစ္စည်း: ${latest.product} x ${latest.quantity}\n` +
    `- အခြေအနေ: ${latest.statusMyanmar}`
  );
}

// ---------------------------------------------------------------------------
// Attachments: download customer-sent images so Gemini can look at them
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function downloadImages(attachments) {
  const images = [];
  for (const att of attachments || []) {
    if (att.type !== 'image' || !att.payload?.url) continue;
    if (images.length >= 3) break;
    try {
      const response = await fetch(att.payload.url);
      if (!response.ok) continue;
      const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_IMAGE_BYTES) continue;
      images.push({ mimeType, data: buffer.toString('base64') });
    } catch (err) {
      console.error('❗ Image download error:', err.message);
    }
  }
  return images;
}

// ---------------------------------------------------------------------------
// Notion chat log
// ---------------------------------------------------------------------------

async function saveChatToNotion(senderId, userMessage, botReply, pageId) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' });
  const safeUserMsg = userMessage.length > 2000 ? userMessage.substring(0, 1990) + '...' : userMessage;
  const safeBotReply = botReply.length > 2000 ? botReply.substring(0, 1990) + '...' : botReply;

  try {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Timestamp: { title: [{ text: { content: timestamp } }] },
        'User Message': { rich_text: [{ text: { content: safeUserMsg } }] },
        'Bot Reply': { rich_text: [{ text: { content: safeBotReply } }] },
        'Sender ID': { rich_text: [{ text: { content: senderId } }] },
        'Page ID': { rich_text: [{ text: { content: pageId } }] },
      },
    });
  } catch (err) {
    console.error('❗ Notion Save Error:', err.message);
  }
}

// Most-recent 12 rows by real creation time (descending), then reversed to
// chronological order — so Gemini sees the latest context, not the oldest.
async function getUserHistoryFromNotion(senderId) {
  const history = [];
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: { property: 'Sender ID', rich_text: { equals: senderId } },
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 12,
    });

    for (const page of response.results.reverse()) {
      const userMsg = page.properties['User Message']?.rich_text?.[0]?.text?.content;
      const botReply = page.properties['Bot Reply']?.rich_text?.[0]?.text?.content;
      if (userMsg) history.push({ role: 'user', parts: [{ text: userMsg }] });
      if (botReply) history.push({ role: 'model', parts: [{ text: botReply }] });
    }
  } catch (error) {
    console.error('❗ Error retrieving history from Notion:', error);
  }
  return history;
}

// ---------------------------------------------------------------------------
// Event processing
// ---------------------------------------------------------------------------

async function processMessagingEvent(event, pageId, pageAccessToken) {
  // Echo = a message the Page itself sent. If it wasn't sent by this bot app,
  // a human (admin) typed it from the Page inbox.
  if (event.message?.is_echo) {
    const appId = event.message.app_id ? String(event.message.app_id) : '';
    const botAppId = process.env.FB_APP_ID ? String(process.env.FB_APP_ID) : null;
    const isHumanReply = botAppId ? appId !== botAppId : !appId || appId === PAGE_INBOX_APP_ID;
    const customerId = event.recipient?.id;
    console.log(
      `↩️ Echo received: app_id=${appId || 'none'}, FB_APP_ID=${botAppId || 'unset'}, human=${isHumanReply}`
    );
    if (!isHumanReply || !customerId) return;

    // Dedup echo deliveries too, so redelivered events can't double-fire
    const echoMid = event.message.mid;
    if (echoMid) {
      const firstTime = await kvSetIfNotExists(`mid:${echoMid}`, '1', 24 * 3600);
      if (!firstTime) return;
    }

    // Human reply from the Page inbox → pause this conversation; announce the takeover
    // in the chat only on the first reply (not on every follow-up message)
    const alreadyPaused = await isConversationPaused(pageId, customerId);
    await pauseConversation(pageId, customerId);
    if (!alreadyPaused) {
      await sendMessage(
        customerId,
        `👨‍💼 Admin ဝင်ရောက်ဖြေကြားပေးနေပါပြီခင်ဗျ။ Bot အလိုအလျောက်ဖြေကြားမှုကို ခေတ္တရပ်ထားပါတယ်။`,
        pageAccessToken
      );
    }
    console.log(`👤 Human takeover: paused ${customerId} for ${HUMAN_TAKEOVER_HOURS}h`);
    return;
  }

  const senderId = event.sender?.id;
  if (!senderId) return;

  const messageText = event.message?.text?.trim();
  const quickReplyPayload = event.message?.quick_reply?.payload;
  const attachments = event.message?.attachments;
  const mid = event.message?.mid;

  // Deduplicate: Facebook redelivers events when the webhook responds slowly.
  // Claiming the mid exactly once prevents duplicate replies to the customer.
  if (mid) {
    const firstTime = await kvSetIfNotExists(`mid:${mid}`, '1', 24 * 3600);
    if (!firstTime) {
      console.log(`↩️ Duplicate delivery skipped: ${mid}`);
      return;
    }
  }

  // Customer asked to talk to the admin → pause the bot for this conversation
  if (quickReplyPayload === 'TALK_TO_HUMAN') {
    await pauseConversation(pageId, senderId);
    await sendMessage(
      senderId,
      '👨‍💼 ဟုတ်ကဲ့ခင်ဗျ။ Admin ထံ လွှဲပြောင်းပေးလိုက်ပါပြီ။ သိချင်တာလေးတွေ ရေးထားခဲ့ပေးပါ — Admin က မကြာခင် ကိုယ်တိုင်ပြန်လည် ဖြေကြားပေးပါမယ်ခင်ဗျာ။ 🙏',
      pageAccessToken
    );
    return;
  }

  // Reveal the sender's PSID so the admin can set ADMIN_PSID_* env vars.
  // Harmless for customers — it only shows their own ID.
  if (messageText?.toLowerCase() === 'adminid') {
    await sendMessage(
      senderId,
      `🆔 Your PSID for this page:\n${senderId}\n\nAdmin ဖြစ်ပါက ဤနံပါတ်ကို Vercel env (ADMIN_PSID_...) တွင်ထည့်ပါ။`,
      pageAccessToken
    );
    return;
  }

  // Admin control channel: the admin's own conversation with the page
  // (senderId matches ADMIN_PSID_*). Commands here control the WHOLE bot and
  // are invisible to customers.
  if (senderId === adminPsids[pageId]) {
    if (messageText?.toLowerCase() === 'pausebot') {
      await setGlobalPause(true);
      await sendMessage(
        senderId,
        '🤖 Bot တစ်ခုလုံး ရပ်လိုက်ပါပြီ။ Customer အားလုံးကို လူကိုယ်တိုင်သာ ဖြေရပါမည်။ ပြန်ဖွင့်ရန် resumebot ဟုရိုက်ပါ။',
        pageAccessToken
      );
      return;
    }
    if (messageText?.toLowerCase() === 'resumebot') {
      await setGlobalPause(false);
      await sendMessage(
        senderId,
        '🤖 Bot တစ်ခုလုံး ပြန်ဖွင့်လိုက်ပါပြီ။ အလိုအလျောက်ဖြေကြားမှုများ ပြန်လည်စတင်ပါပြီ။',
        pageAccessToken
      );
      return;
    }
  }

  // Globally paused by admin → complete silence for customers
  if (await getGlobalPauseState()) return;

  // Manual per-conversation controls (testing / bringing the bot back early)
  if (messageText?.toLowerCase() === 'resumebot') {
    await resumeConversation(pageId, senderId);
    await sendMessage(senderId, '🤖 Bot ပြန်လည်စတင်ပါပြီ။ မေးခွန်းများ မေးနိုင်ပါပြီခင်ဗျ။', pageAccessToken);
    return;
  }
  if (messageText?.toLowerCase() === 'pausebot') {
    await pauseConversation(pageId, senderId);
    await sendMessage(senderId, '🤖 ဒီစကားဝိုင်းအတွက် Bot ကို ခဏရပ်ထားပါပြီ။', pageAccessToken);
    return;
  }

  // Paused per-conversation by human takeover → stay quiet
  if (await isConversationPaused(pageId, senderId)) return;

  // Download any photos the customer sent so Gemini can look at them
  const images = await downloadImages(attachments);

  if (!messageText && images.length === 0) {
    // Sticker/audio/file etc. — acknowledge politely instead of staying silent
    if (attachments?.length) {
      await sendMessage(
        senderId,
        'ဖိုင်လေး လက်ခံရရှိပါတယ်ခင်ဗျ။ စာသားဖြင့် မေးခွန်းလေးပါ ရေးပေးပါဦးနော် — ပိုပြီးတိကျစွာ ကူညီပေးနိုင်ပါမယ်ခင်ဗျာ။ 😊',
        pageAccessToken,
        { quickReplies: QUICK_REPLIES }
      );
    }
    return;
  }

  await sendSenderAction(senderId, 'mark_seen', pageAccessToken);
  await sendSenderAction(senderId, 'typing_on', pageAccessToken);

  const [userHistory, orderContext] = await Promise.all([
    getUserHistoryFromNotion(senderId),
    buildOrderContext(senderId),
  ]);
  const question =
    messageText ||
    'Customer က ပုံပို့ထားပါတယ်။ ပုံကိုကြည့်ပြီး သင့်တော်သလို ကူညီဖြေကြားပေးပါ။';

  let reply;
  let order = null;
  try {
    const result = await askGemini({
      question,
      history: userHistory,
      images,
      channel: 'messenger',
      extraContext: orderContext,
    });
    // Strip the machine-readable [ORDER] block before the customer sees it
    const parsed = parseOrderBlock(result.reply);
    reply = parsed.cleanReply || result.reply;
    order = parsed.order;
  } catch (error) {
    console.error('❗ Gemini error:', error);
    reply = error.status === 503 || error.status === 429 ? BUSY_MESSAGE : NETWORK_ERROR_MESSAGE;
  }

  // Send to Messenger first so a Notion error can't block the customer's reply
  await sendMessage(senderId, reply, pageAccessToken, { quickReplies: QUICK_REPLIES });

  // Customer confirmed an order → save to Notion, confirm to customer, noti admin
  if (order && ordersEnabled()) {
    const confirmation = await handleOrderBlock(order, senderId, pageId, pageAccessToken);
    if (confirmation) {
      await sendMessage(senderId, confirmation, pageAccessToken, { quickReplies: QUICK_REPLIES });
      reply += '\n\n' + confirmation;
    }
  }

  await saveChatToNotion(senderId, question, reply, pageId);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const rawBody = await readRawBody(req);

  // Reject requests that don't carry a valid Facebook signature
  if (process.env.FB_APP_SECRET) {
    const signature = req.headers['x-hub-signature-256'];
    if (!verifySignature(rawBody, signature, process.env.FB_APP_SECRET)) {
      console.error('❗ Invalid webhook signature — request rejected.');
      return res.status(403).send('Invalid signature');
    }
  } else {
    console.warn('⚠️ FB_APP_SECRET not set — webhook signature verification is OFF.');
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (body.object !== 'page') {
    return res.status(404).send('Not a page event');
  }

  for (const entry of body.entry || []) {
    const pageId = entry.id;
    const pageAccessToken = pageTokens[pageId];
    if (!pageAccessToken) {
      console.error(`No access token found for Page ID: ${pageId}`);
      continue;
    }

    // Process every messaging event in the batch, not just the first one
    for (const event of entry.messaging || []) {
      try {
        await processMessagingEvent(event, pageId, pageAccessToken);
      } catch (err) {
        console.error('❗ Error processing messaging event:', err);
      }
    }
  }

  return res.status(200).send('EVENT_RECEIVED');
}
