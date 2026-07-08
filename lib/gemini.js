// Shared Gemini logic used by both the Messenger webhook and the web chat
// (/api/gemini). Works on both Node and Edge runtimes (fetch-only, no Node APIs).

const GEMINI_MODEL = 'gemini-3.5-flash';

// ---------------------------------------------------------------------------
// Inventory: loaded live from a Notion database when NOTION_PRODUCTS_DB_ID is
// set, so prices can be updated in Notion without redeploying. Falls back to
// the hardcoded list below. Cached in memory for 10 minutes.
// ---------------------------------------------------------------------------

const FALLBACK_INVENTORY = `### Inventory & Pricing (July 2026):
[In-Stock Items]
- Boox Go 6 : 731,000 MMK
- Boox Go 6 Gen II: 924,000 MMK
- Boox Go Color 7 Gen II: 1,320,000 MMK
- Boox Go 10.3 Gen II Lumi : 2,024,000 MMK
- Boox Note Air 5c: 2,376,000 MMK
- Boox Palma 2: 1,225,500 MMK
- Boox Palma 2 Pro: 1,804,000 MMK

[Accessories]
- Magnetic Cover: Palma 2/Pro 60,000 MMK, Go-6 100,000 MMK, Go Color 7 Gen II 120,000 MMK, Go 10.3/Note Air 5c 150,000 MMK
- Pen tip 5-pc box: 20 USD, Pen: 45 USD`;

let inventoryCache = { text: null, fetchedAt: 0 };
const INVENTORY_CACHE_MS = 10 * 60 * 1000;

// Last inventory text used in a prompt — parsed by lookupPrice() so order rows
// always carry the store's own price, never one the model made up.
let lastInventoryText = FALLBACK_INVENTORY;

export function lookupPrice(productName) {
  if (!productName) return null;
  const wanted = String(productName).toLowerCase().replace(/\s+/g, ' ').trim();
  let bestMatch = null;
  for (const line of lastInventoryText.split('\n')) {
    const match = line.match(/^-\s*(.+?)\s*:\s*([\d,]+)\s*(MMK|USD)/i);
    if (!match) continue;
    const name = match[1].toLowerCase().replace(/\s+/g, ' ').trim();
    const price = `${match[2]} ${match[3].toUpperCase()}`;
    if (name === wanted) return price;
    if (!bestMatch && (name.includes(wanted) || wanted.includes(name))) bestMatch = price;
  }
  return bestMatch;
}

function extractPlainText(richTextOrTitle) {
  if (!Array.isArray(richTextOrTitle)) return '';
  return richTextOrTitle.map((t) => t?.plain_text || '').join('').trim();
}

async function getInventoryBlock() {
  const productsDbId = process.env.NOTION_PRODUCTS_DB_ID;
  if (!productsDbId || !process.env.NOTION_API_KEY) return FALLBACK_INVENTORY;

  if (inventoryCache.text && Date.now() - inventoryCache.fetchedAt < INVENTORY_CACHE_MS) {
    lastInventoryText = inventoryCache.text;
    return inventoryCache.text;
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${productsDbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100 }),
    });
    if (!response.ok) throw new Error(`Notion products query failed: ${response.status}`);

    const data = await response.json();
    const inStock = [];
    const preOrder = [];
    const accessories = [];

    for (const page of data.results || []) {
      const props = page.properties || {};
      const name =
        extractPlainText(props['Name']?.title) || extractPlainText(props['Product']?.title);
      if (!name) continue;

      const priceNumber = props['Price']?.number;
      const priceText = extractPlainText(props['Price']?.rich_text);
      const price =
        priceNumber != null ? `${priceNumber.toLocaleString('en-US')} MMK` : priceText;
      const note = extractPlainText(props['Note']?.rich_text);
      const category = props['Category']?.select?.name || '';
      const available = props['InStock']?.checkbox;

      const line = `- ${name}: ${price}${note ? ` (${note})` : ''}`;
      if (/accessor/i.test(category)) accessories.push(line);
      else if (available === false) preOrder.push(line);
      else inStock.push(line);
    }

    if (inStock.length === 0 && preOrder.length === 0 && accessories.length === 0) {
      return FALLBACK_INVENTORY;
    }

    let text = '### Inventory & Pricing (live):\n[In-Stock Items]\n' + inStock.join('\n');
    if (preOrder.length) text += '\n\n[Pre-order Only]\n' + preOrder.join('\n');
    if (accessories.length) text += '\n\n[Accessories]\n' + accessories.join('\n');

    inventoryCache = { text, fetchedAt: Date.now() };
    lastInventoryText = text;
    return text;
  } catch (err) {
    console.error('❗ Inventory fetch error, using fallback list:', err.message);
    return inventoryCache.text || FALLBACK_INVENTORY;
  }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

// Order-taking instructions — only injected for the Messenger channel when the
// Orders database is configured. The [ORDER] block is machine-readable output
// that the webhook parses, validates, and strips before the customer sees it.
const ORDER_TAKING_SECTION = `
### Order Taking (VERY IMPORTANT):
- Customer က ဝယ်ယူလိုကြောင်းပြောလျှင် order လက်ခံပေးပါ။ လိုအပ်သောအချက်များ: (၁) အမည် (၂) ဖုန်းနံပါတ် (၃) ပို့ဆောင်ရမည့်လိပ်စာ (၄) ပစ္စည်းအမည် (Inventory စာရင်းထဲမှသာ) (၅) အရေအတွက် (၆) ငွေချေနည်း (ရန်ကုန်: COD သို့မဟုတ် Mobile Banking / နယ်: KBZ, KPay, CB, AYA, AYApay)။
- တစ်ကြိမ်လျှင် မေးခွန်း ၁-၂ ခုသာမေးပါ။ ရပြီးသားအချက်များကို ထပ်မမေးပါနှင့်။
- Pre-order ပစ္စည်းလည်း လက်ခံနိုင်သည် — စောင့်ဆိုင်းချိန် (၂) ပတ်ခန့်ကြာမည်ကို ကြိုတင်ပြောပါ။
- အချက်အလက်အားလုံးစုံလျှင် order အချက်အလက်အားလုံးကို စာရင်းချပြပြီး "အတည်ပြုပါသလားခင်ဗျ" ဟုမေးပါ။ ဤအဆင့်တွင် ORDER block မထည့်ရသေးပါ။
- Customer က ရှင်းလင်းစွာ အတည်ပြုပြီးမှသာ reply ၏ အဆုံးတွင် အောက်ပါ format အတိုင်း တစ်ကြောင်းတည်း ထည့်ပါ:
[ORDER]{"name":"အမည်","phone":"09xxxxxxxxx","address":"လိပ်စာ","product":"Boox Palma 2","quantity":1,"payment":"KPay","note":""}[/ORDER]
- product field တွင် Inventory စာရင်းထဲက အမည်အတိုင်း အတိအကျရေးပါ။
- ORDER block ကို customer မမြင်ရပါ — စနစ်ကဖတ်ရန်သာ။ Customer အတည်မပြုရသေးလျှင် လုံးဝမထည့်ပါနှင့်။
- ORDER block ထည့်သောအခါ customer-facing စာသားမှာ "ကျေးဇူးတင်ပါတယ်ခင်ဗျ" လောက်သာ တိုတိုရေးပါ — order နံပါတ်နှင့် အတည်ပြုစာကို စနစ်က သီးသန့်ပို့ပေးပါမည်။ Order နံပါတ်ကို ကိုယ်တိုင်လုံးဝ မတီထွင်ပါနှင့်။`;

async function buildSystemPrompt({ channel, extraContext } = {}) {
  const inventoryBlock = await getInventoryBlock();
  const includeOrdering = channel === 'messenger' && process.env.NOTION_ORDERS_DB_ID;

  return `မင်္ဂလာပါ။ Bonanza E-Reader Store ရဲ့ တရားဝင် Assistant ဖြစ်ပါတယ်။ လူကြီးမင်းကို ကူညီပေးဖို့ အသင့်ရှိနေပါတယ်ခင်ဗျ။

### Role & Identity:
- Identity: Bonanza AI Assistant (Male tone).
- Language: ✅ မြန်မာဘာသာဖြင့်သာ အမြဲဖြေဆိုပါ။ "ခင်ဗျာ/ဗျ" ကိုသုံးပါ။ "ရှင်/ရှင့်" လုံးဝမသုံးရပါ။
- Tone: Polite, Professional, Knowledgeable, and Sales-focused.
- Format: Messenger တွင် ဖတ်ရလွယ်အောင် စာပိုဒ်တိုတိုများဖြင့် ရေးပါ။ Markdown (**, ##, bullet symbols) မသုံးပါနှင့် — ရိုးရိုးစာသားနှင့် ဂဏန်းစဉ် (၁။ ၂။) သာသုံးပါ။

### Core Capabilities:
1. Product comparisons, tech specs, Boox OS features နဲ့ accessory recommendations များကို ကျွမ်းကျင်စွာ ဖြေကြားပေးပါ။
2. Customer ၏ လိုအပ်ချက် (Reading, Note-taking, Manga, Drawing, Portability) အပေါ်မူတည်ပြီး သင့်တော်မည့် device ကို အကြံပြုပေးပါ။
3. Common issues (Battery, Sync, Stylus issues) များကို ရှင်းလင်းစွာ troubleshooting လုပ်ပေးပါ။
4. Boox ၏ နောက်ဆုံးထွက် news နှင့် product launches များကို မျှဝေပေးပါ။
5. Product များအကြောင်း ပြောသည့်အခါ https://www.shop.boox.com မှ သက်ဆိုင်ရာ link ကိုပါ ထည့်သွင်းပေးပါ။
6. Accessories များ (ဥပမာ Magnetic Case) ကိုတော့ သီးသန့်ထပ်ဝယ်ရပါမယ်။
7. Customer က ပုံပို့လာပါက ပုံကိုသေချာကြည့်ပြီး ဖြေဆိုပါ (ဥပမာ - device ပုံ၊ error screenshot၊ ကြော်ငြာပုံ)။

### Pricing Rules (VERY IMPORTANT):
- ဈေးနှုန်းပြောရာတွင် အောက်ပါ Inventory & Pricing စာရင်းထဲက MMK ဈေးနှုန်းကိုသာ အတိအကျပြောပါ။
- shop.boox.com သို့မဟုတ် Google Search မှတွေ့သော USD ဈေးနှုန်းများကို လုံးဝ မကိုးကားရ၊ မပြောရပါ (Pen tip နှင့် Pen မှလွဲ၍)။
- စာရင်းထဲမပါသော ပစ္စည်း၏ ဈေးနှုန်းကို မခန့်မှန်းပါနှင့် — "ဈေးနှုန်းအတိအကျသိရှိရန် Page သို့ဆက်သွယ်ပေးပါ" ဟုပြောပါ။

### Store Information & Contact:
- Location: "ရန်ကင်းစင်တာ ပထမထပ်မှာ ဆိုင်ဖွင့်ထားပါတယ်။ လောလောဆယ်တော့ အခက်အခဲတချို့ရှိလို့ ခဏပိတ်ထားပါတယ်။ ပြန်ဖွင့်မယ့်ရက်ကို Facebook page မှာကြေငြာပါ့မယ်"
- Facebook: https://www.facebook.com/BonanzaEreaderStore
- Website: https://bonanza.com.mm
- Phone: 09954454499
- Email: admin@bonanza.com.mm

${inventoryBlock}

[Important Pricing]
- Pre-order: shop.boox.com ရှိ ပစ္စည်းများကို မှာယူနိုင်ပြီး စောင့်ဆိုင်းချိန် (၂) ပတ်ခန့် ကြာမြင့်မည်။

### Brand Check Logic (IMPORTANT):
- မေးသော Device သည် In-stock list တွင် မပါပါက Google Search သို့မဟုတ် shop.boox.com တွင် အရင်စစ်ဆေးပါ။
- Boox Brand ဖြစ်ပါက "ပစ္စည်းလက်ကျန်မရှိသေးသော်လည်း (၂) ပတ်ခန့် စောင့်ဆိုင်းရမည့် Pre-order တင်နိုင်ကြောင်း" အကြောင်းကြားပါ။
- Boox Brand မဟုတ်ပါက "Bonanza တွင် Boox တစ်မျိုးတည်းသာ ရောင်းချကြောင်း" ယဉ်ကျေးစွာ ပြောပါ။

### Common FAQs:
- Warranty: International Warranty 1 Year ပါဝင်သည်။
- Delivery: တစ်နိုင်ငံလုံး ပို့ဆောင်ပေးသည်။
- Payment: ရန်ကုန် (COD/Mobile Banking), နယ်မြို့များ (Mobile Banking: KBZ, Kpay, CB, AYA, AYApay)။
- PDF/မြန်မာစာ: PDF ဖတ်ရန် အကောင်းဆုံးဖြစ်ပြီး Reflow လုပ်ခြင်း၊ မြန်မာဖောင့်ထည့်ခြင်းများ ပြုလုပ်နိုင်သည်။ (Video Link: https://www.facebook.com/bonanzagadgetsstore/videos/309933138150362)

### Resources:
အချက်အလက်များကို shop.boox.com နှင့် help.boox.com တို့မှ အမြဲ ဦးစားပေး ကိုးကားပါ (ဈေးနှုန်းမှလွဲ၍)။
e-reader နဲ့မဆိုင်တဲ့ မေးခွန်းတွေမေးရင် 'ကျွန်တော်က Boox e-reader တွေနဲ့ပက်သက်ပြီး ဖြေဆိုဖို့ပဲ လေ့ကျင့်ထားတဲ့ Bonanza ရဲ့ agent ဖြစ်လို့ တခြားအကြောင်းအရာတွေကိုတော့ မဖြေနိုင်ပါဘူး ခင်ဗျာ' လို့ ယဉ်ကျေးစွာပြောပါ။
${
  includeOrdering
    ? ORDER_TAKING_SECTION
    : 'ဝယ်ယူရန်စိတ်ဝင်စားသော customer ကို Page သို့ဆက်သွယ်ရန် သို့မဟုတ် ဖုန်း 09954454499 သို့ခေါ်ဆိုရန် အားပေးပါ။'
}${extraContext ? `\n\n${extraContext}` : ''}`;
}

// ---------------------------------------------------------------------------
// Gemini call with retry/backoff. `images` is an optional array of
// { mimeType, data } (base64) objects, e.g. photos a customer sent.
// ---------------------------------------------------------------------------

export async function askGemini({ question, history, images, channel = 'web', extraContext }) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error('GEMINI_API_KEY environment variable is not set.');

  const SYSTEM_PROMPT = await buildSystemPrompt({ channel, extraContext });

  let fullContents = [];
  if (history && Array.isArray(history)) {
    fullContents = history.filter(
      (msg) => msg.parts?.[0]?.text !== SYSTEM_PROMPT && msg.role !== 'system'
    );
  }

  const userParts = [{ text: question }];
  if (Array.isArray(images)) {
    for (const img of images.slice(0, 3)) {
      userParts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
    }
  }
  fullContents.push({ role: 'user', parts: userParts });

  let response;
  let retries = 3;
  let delay = 1000;

  for (let i = 0; i < retries; i++) {
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: fullContents,
            generationConfig: {
              maxOutputTokens: 2000,
              // Low temperature: factual, consistent answers for prices/specs
              temperature: 0.3,
            },
            tools: [{ googleSearch: {} }],
          }),
        }
      );

      if (response.status === 503 || response.status === 429) {
        console.warn(
          `Gemini API returned status ${response.status}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`
        );
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
      }
      break;
    } catch (fetchErr) {
      if (i === retries - 1) throw fetchErr;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  let reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || 'မဖြေပေးနိုင်ပါ။';

  // Clean Markdown/HTML for Messenger
  reply = reply.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$2');
  reply = reply.replace(/<\/?a\b[^>]*>/g, '');
  reply = reply.replace(/\*\*([^*]+)\*\*/g, '$1');
  reply = reply.trim() || 'မဖြေပေးနိုင်ပါ။';

  // History for the next turn: store the text only (not image bytes)
  const updatedHistory = fullContents.slice(0, -1);
  updatedHistory.push({ role: 'user', parts: [{ text: question }] });
  updatedHistory.push({ role: 'model', parts: [{ text: reply }] });

  return { reply, updatedHistory, model: GEMINI_MODEL };
}

export const BUSY_MESSAGE =
  '✨ လူကြီးမင်းခင်ဗျာ... လက်ရှိမှာ မေးခွန်းမေးမြန်းသူ အလွန်များပြားနေပါသဖြင့် စနစ်က ခဏတာ အလုပ်များနေပါတယ်။ မိနစ်အနည်းငယ် စောင့်ဆိုင်းပြီးမှ ပြန်လည်မေးမြန်းပေးပါရန် မေတ္တာရပ်ခံအပ်ပါတယ်ခင်ဗျာ။';

export const NETWORK_ERROR_MESSAGE =
  '✨ လူကြီးမင်းခင်ဗျာ... လောလောဆယ် ဆက်သွယ်မှု ကွန်ရက် အနည်းငယ် အဆင်မပြေဖြစ်နေလို့ပါ။ ခေတ္တစောင့်ဆိုင်းပြီး ပြန်လည်မေးမြန်းပေးပါဦးခင်ဗျာ။';
