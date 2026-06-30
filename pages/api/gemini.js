export const config = {
  runtime: 'edge', // Vercel Cold Starts နှင့် Timeout ကာကွယ်ရန် Edge Runtime သို့ ပြောင်းလဲထားပါသည်
};

export default async function handler(req, res) {
  // Edge Runtime တွင် Standard Request/Response Object ကို သုံးရသဖြင့် req.json() ဖြင့် Body ဖတ်ပါသည်
  const body = await req.json().catch(() => ({}));
  const { question, history } = body;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    return new Response(
      JSON.stringify({ error: "Server configuration error: API Key is missing." }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ✅ All-in-One Optimized System Prompt (Capabilities + Store Info + Pricing)[span_0](start_span)[span_0](end_span)
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
6. Accessories များ (ဥပမာ Magnetic Case) ကိုတော့သီးသန့်ထပ်ဝယ်ရပါမယ်

### Store Information & Contact:
- Location: "ရန်ကင်းစင်တာ ပထမထပ်မှာ ဆိုင်ဖွင့်ထားပါတယ်။ လောလောဆယ်တော့ အခက်အခဲတချို့ရှိလို့ ခဏပိတ်ထားပါတယ်။ ပြန်ဖွင့်မယ့်ရက်ကို Facebook page မှာကြေငြာပါ့မယ်"
- Facebook: https://www.facebook.com/BonanzaEreaderStore
- Website: https://bonanza.com.mm
- Phone: 09954454499
- Email: admin@bonanza.com.mm

### Inventory & Pricing (March 2026):
[In-Stock Items]
- Boox Go 6: 170 USD
- Boox Go Color 7 Gen II: 290 USD
- Boox Go 10.3: 420 USD
- Boox Note Air 5c: 540 USD
- Boox Palma 2: 260 USD
- Boox Palma 2 Pro: 410 USD

[Important Pricing]
- Exchange Rate: 1 USD = 4350 MMK (Calculation အတွက် ဤနှုန်းကိုသုံးပါ)။
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
      ); //[span_1](start_span)[span_1](end_span)
    }

    fullContents.push({ role: "user", parts: [{ text: question }] }); //[span_2](start_span)[span_2](end_span)

    // ✅ Exponential Backoff & Retry Logic for Gemini Server Traffic Errors
    let response;
    let retries = 3;
    let delay = 1000; 

    for (let i = 0; i < retries; i++) {
      try {
        // 🚀 Gemini 3.5 Flash Model အသစ်သို့ Endpoint ပြောင်းလဲထားပါသည်
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`,
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
              tools: [{ googleSearch: {} }] //[span_3](start_span)[span_3](end_span)
            })
          }
        );

        // 503 Busy သို့မဟုတ် 429 Rate Limit ဖြစ်ခဲ့လျှင် ခဏစောင့်ပြီး အလိုအလျောက် ပြန်ကြိုးစားပါမည်
        if (response.status === 503 || response.status === 429) {
          console.warn(`Gemini API returned status ${response.status}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; 
            continue;
          }
        }
        break; 
      } catch (fetchErr) {
        if (i === retries - 1) throw fetchErr;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error after retries:", response.status, errorText);
      
      // 503 High Demand ဖြစ်နေပါက Customer ကို ယဉ်ကျေးပျူငှာသော စာသားပြပါမည်
      if (response.status === 503) {
        return new Response(
          JSON.stringify({
            reply: "✨ လူကြီးမင်းခင်ဗျာ... လက်ရှိမှာ မေးခွန်းမေးမြန်းသူ အလွန်များပြားနေပါသဖြင့် စနစ်က ခဏတာ အလုပ်များနေပါတယ်။ မိနစ်အနည်းငယ် စောင့်ဆိုင်းပြီးမှ ပြန်လည်မေးမြန်းပေးပါရန် မေတ္တာရပ်ခံအပ်ပါတယ်ခင်ဗျာ။",
            updatedHistory: fullContents,
            model: "fallback-handler"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `API Error from Gemini: ${response.status} - ${errorText}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "မဖြေပေးနိုင်ပါ။"; //[span_4](start_span)[span_4](end_span)

    // Clean Markdown/HTML for Messenger[span_5](start_span)[span_5](end_span)
    reply = reply.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$2'); //[span_6](start_span)[span_6](end_span)
    reply = reply.replace(/<\/?a\b[^>]*>/g, ''); //[span_7](start_span)[span_7](end_span)

    fullContents.push({ role: "model", parts: [{ text: reply }] }); //[span_8](start_span)[span_8](end_span)

    return new Response(
      JSON.stringify({ 
        reply, 
        updatedHistory: fullContents, 
        model: "gemini-3.5-flash" 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in gemini.js handler:", error);
    return new Response(
      JSON.stringify({ 
        reply: "✨ လူကြီးမင်းခင်ဗျာ... လောလောဆယ် ဆက်သွယ်မှု ကွန်ရက် အနည်းငယ် အဆင်မပြေဖြစ်နေလို့ပါ။ ခေတ္တစောင့်ဆိုင်းပြီး ပြန်လည်မေးမြန်းပေးပါဦးခင်ဗျာ။",
        updatedHistory: history || [],
        model: "fail-safe"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}
