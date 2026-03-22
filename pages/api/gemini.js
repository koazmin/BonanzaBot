export default async function handler(req, res) {
  const { question, history } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    return res.status(500).json({ error: "Server configuration error: API Key is missing." });
  }

  const SYSTEM_PROMPT = `မင်္ဂလာပါ။ Bonanza အတွက် ကူညီပေးမယ့် Assistant ဖြစ်ပါတယ်။

### Role & Tone:
Role: You are an expert assistant working for Bonanza E-Reader Store, a seller specializing in Boox e-readers. Your job is to provide advanced, accurate, and up-to-date information only about Boox products, help users choose the right Boox device, explain technical details, compare models, and assist with troubleshooting.
Language: ✅ Always respond in Burmese as a male assistant. (မြန်မာလိုသာဖြေပါ။) Never user the word ရှင် or ရှင့်
Tone: Use a knowledgeable, expert-friendly, and sales-focused tone. Be warm, clear, and trustworthy when helping Burmese-speaking customers explore or buy Boox products.

### Store Information:
- **Location:** "ရန်ကင်းစင်တာ ပထမထပ်မှာ ဆိုင်ဖွင့်ထားပါတယ်။ လောလောဆယ်တော့ အခက်အပိုင်းတချို့ရှိလို့ ခဏပိတ်ထားပါတယ်။ ပြန်ဖွင့်မယ့်ရက်ကို Facebook page မှာကြေငြာပါ့မယ်"
- **Contact:** Facebook: https://www.facebook.com/BonanzaEreaderStore, Phone: 09954454499

### Product Availability & Prices:
- Go 6: 160 USD (In stock)
- Go 10.3: 410 USD (In stock)
- Note Max: 690 USD (In stock)
- Note Air 4C / Go Color 7 / Tab Ultra C Pro: Out of stock (Pre-order ~1 month)

(Note: Remaining original instructions omitted for brevity, keep your full prompt text here)`;

  try {
    // We move SYSTEM_PROMPT out of fullContents to save quota
    let fullContents = [];

    if (history && Array.isArray(history)) {
      // Clean history to ensure no system prompt duplicates exist
      fullContents = history.filter(msg => 
        msg.parts?.[0]?.text !== SYSTEM_PROMPT && 
        msg.role !== 'system'
      );
    }

    // Add current user question
    fullContents.push({ role: "user", parts: [{ text: question }] });

    // MODEL UPDATED: changed to gemini-2.5-flash-lite
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { // This is the modern way to handle the prompt
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: fullContents,
          generationConfig: {
            maxOutputTokens: 2000,
            temperature: 0.7,
          },
          // Note: Grounding (Google Search) can consume more quota. 
          // If errors persist, try removing this tools block.
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

    // Update history for the next turn
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
