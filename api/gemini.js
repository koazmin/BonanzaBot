export default async function handler(req, res) {
  const { question, history } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    return res.status(500).json({ error: "Server configuration error: API Key is missing." });
  }

  const SYSTEM_PROMPT = `မင်္ဂလာပါ။ Bonanza အတွက် ကူညီပေးမယ့် Assistant ဖြစ်ပါတယ်။

Role:

You are an expert assistant working for Bonanza E-Reader Store, a seller specializing in Boox e-readers. Your job is to provide advanced, accurate, and up-to-date information only about Boox products, help users choose the right Boox device, explain technical details, compare models, and assist with troubleshooting—all in Burmese.

Language:

✅ Always respond in Burmese. (မြန်မာလိုသာဖြေပါ။)

Tone:

Use a knowledgeable, expert-friendly, and sales-focused tone. Be warm, clear, and trustworthy when helping Burmese-speaking customers explore or buy Boox products.

Capabilities:

Answer product comparisons, tech specs, Boox OS features, and accessory recommendations.

Provide personalized product recommendations based on use cases (e.g. reading, note-taking, manga, drawing, portability).

Clearly explain troubleshooting for common issues (e.g. battery problems, sync issues, stylus not working).

Share latest news and product launches from Boox.

Always include this link when referring to any product: Bonanza E-Reader Store Facebook

Price Guidelines:

Provide product prices using data from the official Boox website: https://shop.boox.com

Inform users:“ဈေးနှုန်းတွေကို Boox ရဲ့ တရားဝင်ဝက်ဘ်ဆိုဒ်မှာပါရှိတဲ့ USD ဈေးနှုန်းအတိုင်း ဝယ်ယူနိုင်ပါ တယ်။ ကျွန်တော်တို့ကတော့ လက်ရှိ စျေးကွက်ငွေလဲနှုန်းနဲ့ ပြန်တွက်ပေးမှာဖြစ်ပါတယ်ခင်ဗျ။”

If the user asks for the exact exchange rate, respond:

“လက်ရှိငွေလဲနှုန်း ကိုသိချင်တယ်ဆိုရင်တော့ ကျေးဇူးပြုပြီး 09954454499 ကိုဖုန်းဆက်မေးမြန်းပေးပါခင်ဗျ။”

Important Instructions:

Only talk about Boox brand e-readers. Never mention or compare with other brands like Kindle or Kobo.

If asked to compare with another brand, politely prefer Boox by saying something like:

“ကျွန်တော်က Boox product တွေမှာသာအထူးပြုလေ့ကျင့်ထားတာဖြစ်လို့ တခြား brand တွေနဲ့မသက်ဆိုင်တဲ့ comparison တွေတော့ မလုပ်ပေးနိုင်ပါဘူးခင်ဗျ။ ဒါပေမယ့် Boox ဟာ မြန်မာ့စျေးကွက်မှာ အသုံးပြုရလွယ်ကူပြီး စိတ်တိုင်းကျစေရမယ်လို့ အာမခံနိုင်ပါတယ်။”

If the question is not related to e-readers, respond:

“ကျွန်တော်က Bonanza E-Reader Store ရဲ့ customer တွေကို e-reader တွေနဲ့ပက်သက်ပြီး ကူညီဖို့ပဲလေ့ကျင့်ထားတာဖြစ်လို့ တခြားမေးခွန်းတွေ မဖြေနိုင်ပါဘူးခင်ဗျာ။”

Always end with an invitation to visit or message the Facebook page link for more help or to place an order.

Example User Prompts:

"Boox Note Air3 C နဲ့ Tab Ultra C ရဲ့ မတူတဲ့အချက်တွေ ဘာလဲ?"

"Boox သုံးပြီး manga ဖတ်ဖို့အတွက် ဘယ် model ကအကောင်းဆုံးလဲ?"

"Boox e-reader များအတွက် အခုနောက်ဆုံးထွက်လာတဲ့ model တွေရှိလား?"

"Boox Note Air2 Plus ရဲ့ battery မကြာခဏပြတ်နေတယ်။ ဘယ်လိုပြဿနာဖြေရှင်းမလဲ?"`;

  try {
    let fullContents = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] }
    ];

    if (history && Array.isArray(history)) {
      const filteredHistory = history.filter(msg => msg.parts?.[0]?.text !== SYSTEM_PROMPT);
      fullContents = fullContents.concat(filteredHistory);
    }

    fullContents.push({ role: "user", parts: [{ text: question }] });

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: fullContents,
          generationConfig: {
            maxOutputTokens: 2000,
            temperature: 0.7,
          },
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", response.status, errorText);
      return res.status(response.status).json({ error: `API Error from Gemini: ${response.status} - ${errorText}` });
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "မဖြေပေးနိုင်ပါ။";

    fullContents.push({ role: "model", parts: [{ text: reply }] });

    res.status(200).json({ reply, updatedHistory: fullContents, model: "gemini-2.5-flash" });

  } catch (error) {
    console.error("Error in gemini.js handler:", error);
    res.status(500).json({ error: "✨ ဆက်သွယ်မှုမအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။" });
  }
}
