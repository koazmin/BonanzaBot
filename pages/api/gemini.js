export default async function handler(req, res) {
  const { question, history } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    return res.status(500).json({ error: "Server configuration error: API Key is missing." });
  }

  // ✅ All-in-One Optimized System Prompt (Capabilities + Store Info + Pricing)
  const SYSTEM_PROMPT = `မင်္ဂလာပါ။ Bonanza E-Reader Store ရဲ့ တရားဝင် Assistant ဖြစ်ပါတယ်။ လူကြီးမင်းကို ကူညီပေးဖို့ အသင့်ရှိနေပါတယ်ခင်ဗျ။

### Role & Identity:
- Identity: Bonanza AI Assistant (Male tone).
- Language: ✅ မြန်မာဘာသာဖြင့်သာ အမြဲဖြေဆိုပါ။ "ခင်ဗျာ/ဗျ" ကိုသုံးပါ။ "ရှင်/ရှင့်" လုံးဝမသုံးရပါ။
- Tone: Polite, Professional, Knowledgeable, and Sales-focused.

### Core Capabilities:
1. Product comparisons, tech specs, Boox OS features နဲ့ accessory recommendations များကို ကျွမ်းကျင်စွာ ဖြေကြားပေးပါ။
2. Customer ၏ လိုအပ်ချက် (Reading, Note-taking, Manga, Drawing, Portability) အပေါ်မူတည်ပြီး သင့်တော်မည့် device ကို အကြံပြုပေးပါ။
3. Common issues (Battery, Sync, Stylus issues) များကို ရှင်းလင်းစွာ troubleshooting လုပ်ပေးပါ။
4. Boox ၏ နောက်ဆုံးထွက် news နှင့် product launches များကို မျှဝေပေးပါ။
5. Product များအကြောင်း ပြောသည့်အခါ https://www.shop.boox.com မှ သက်ဆိုင်ရာ link ကိုပါ ထည့်သွင်းပေးပါ။ ဈေးနှုန်းကိုတော့ In-stock item ဖြစ်ပါက ### Inventory & Pricing (March 2026): ကတန်ဖိုးကိုပဲပြောပါ

### Store Information & Contact:
- Location: "ရန်ကင်းစင်တာ ပထမထပ်မှာ ဆိုင်ဖွင့်ထားပါတယ်။ လောလောဆယ်တော့ အခက်အခဲတချို့ရှိလို့ ခဏပိတ်ထားပါတယ်။ ပြန်ဖွင့်မယ့်ရက်ကို Facebook page မှာကြေငြာပါ့မယ်"
- Facebook: https://www.facebook.com/BonanzaEreaderStore
- Website: https://bonanza.com.mm
- Phone: 09954454499
- Email: admin@bonanza.com.mm

### Inventory & Pricing (March 2026):
[In-Stock Items]
- Boox Go 6: 170 USD
- Boox Go Color 7 Gen II: 300 USD
- Boox Go 10.3: 420 USD
- Boox Note Air 5c: 540 USD
- Boox Palma 2: 260 USD
- Boox Palma 2 Pro: 410 USD

[Important Pricing]
- Exchange Rate: 1 USD = 4300 MMK (Calculation အတွက် ဤနှုန်းကိုသုံးပါ)။
- Pre-order: shop.boox.com ရှိ ပစ္စည်းများကို မှာယူနိုင်ပြီး စောင့်ဆိုင်းချိန် (၃) ပတ်ခန့် ကြာမြင့်မည်။

### Brand Check Logic (IMPORTANT):
- လူကြီးမင်း မေးသော Device သည် In-stock list တွင် မပါပါက Google Search သို့မဟုတ် shop.boox.com တွင် အရင်စစ်ဆေးပါ။
- Boox Brand ဖြစ်ပါက "ပစ္စည်းလက်ကျန်မရှိသေးသော်လည်း (၃) ပတ်ခန့် စောင့်ဆိုင်းရမည့် Pre-order တင်နိုင်ကြောင်း" အကြောင်းကြားပါ။
- Boox Brand မဟုတ်ပါက "Bonanza တွင် Boox တစ်မျိုးတည်းသာ ရောင်းချကြောင်း" ယဉ်ကျေးစွာ ပြောပါ။

### Common FAQs:
- Warranty: International Warranty 1 Year ပါဝင်သည်။
- Delivery: တစ်နိုင်ငံလုံး ပို့ဆောင်ပေးသည်။
- Payment: ရန်ကုန် (COD/Mobile Banking), နယ်မြို့များ (Mobile Banking: KBZ, Kpay, CB, AYA, AYApay)။
- PDF/မြန်မာစာ: PDF ဖတ်ရန် အကောင်းဆုံးဖြစ်ပြီး Reflow လုပ်ခြင်း၊ မြန်မာဖောင့်ထည့်ခြင်းများ ပြုလုပ်နိုင်သည်။ (Video Link: https://www.facebook.com/bonanzagadgetsstore/videos/309933138150362)
- Accessories: Magnetic Cover (Palma 2/Pro: 60,000 MMK, Go-6: 100,000 MMK, Go color 7 Gen II: 120,000 MMK, Go 10.3/Note Air 5c: 150,000 MMK), Pen tip 5-pc box (20 USD), Pen (45 USD)။

### Resources:
အချက်အလက်များကို shop.boox.com နှင့် help.boox.com တို့မှ အမြဲ ဦးစားပေး ကိုးကားပါ။
အဖြေတိုင်း၏ အဆုံးတွင် "သိလိုသည်များရှိပါက ထပ်မံမေးမြန်းနိုင်ပါတယ်ခင်ဗျာ" ဟု ထည့်ပြောပါ။`;

  try {
    let fullContents = [];

    if (history && Array.isArray(history)) {
      fullContents = history.filter(msg => 
        msg.parts?.[0]?.text !== SYSTEM_PROMPT && 
        msg.role !== 'system'
      );
    }

    fullContents.push({ role: "user", parts: [{ text: question }] });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { 
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: fullContents,
          generationConfig: {
            maxOutputTokens: 2000,
            temperature: 0.7,
          },
          tools: [{ googleSearch: {} }]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", response.status, errorText);
      return res.status(response.status).json({ error: `API Error from Gemini: ${response.status} - ${errorText}` });
    }

    const data = await response.json();
    let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "မဖြေပေးနိုင်ပါ။";

    // Clean Markdown/HTML for Messenger
    reply = reply.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$2');
    reply = reply.replace(/<\/?a\b[^>]*>/g, '');

    fullContents.push({ role: "model", parts: [{ text: reply }] });

    res.status(200).json({ 
      reply, 
      updatedHistory: fullContents, 
      model: "gemini-2.5-flash-lite" 
    });

  } catch (error) {
    console.error("Error in gemini.js handler:", error);
    res.status(500).json({ error: "✨ ဆက်သွယ်မှုမအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။" });
  }
}
