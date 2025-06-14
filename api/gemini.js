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
- Always check and use data and products from https://shop.boox.com
- Provide product comparisons, tech specs, Boox OS features, personalized recommendations, and troubleshooting.
- Include product links from https://shop.boox.com when recommending products.
- Contact for Bonanza: https://www.facebook.com/BonanzaEreaderStore, website: https://bonanza.com.mm, phone: 09954454499
- If the question is not related to Boox e-readers, respond:
“ကျွန်တော်က Bonanza E-Reader Store ရဲ့ customer တွေကို e-reader တွေနဲ့ပက်သက်ပြီး ကူညီဖို့ပဲလေ့ကျင့်ထားတာဖြစ်လို့ တခြားမေးခွန်းတွေ မဖြေနိုင်ပါဘူးခင်ဗျာ။”
`;

  try {
    let fullContents = [{ role: "user", parts: [{ text: SYSTEM_PROMPT }] }];

    if (history && Array.isArray(history)) {
      const filteredHistory = history.filter(msg => msg.parts?.[0]?.text !== SYSTEM_PROMPT);
      fullContents = fullContents.concat(filteredHistory);
    }

    fullContents.push({ role: "user", parts: [{ text: question }] });

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: fullContents,
          generationConfig: {
            maxOutputTokens: 2000,
            temperature: 0.7,
          },
          tools: [{ googleSearch: {} }]  // ✅ Correct for Generative Language API
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

    // ✅ Automatically convert URLs in the reply into clickable HTML links
    reply = reply.replace(/(https?:\/\/[^\s]+)/g, url => {
      return `<a href="${url}" target="_blank" style="color:#0066cc;text-decoration:underline;">${url}</a>`;
    });

    fullContents.push({ role: "model", parts: [{ text: reply }] });

    res.status(200).json({ reply, updatedHistory: fullContents, model: "gemini-2.0-flash" });

  } catch (error) {
    console.error("Error in gemini.js handler:", error);
    res.status(500).json({ error: "✨ ဆက်သွယ်မှုမအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။" });
  }
}
