import fetch from 'node-fetch';
import { Client } from '@notionhq/client';

const pageTokens = {
  [process.env.PAGE_ID_EREADER]: process.env.PAGE_ACCESS_TOKEN_EREADER,
  [process.env.PAGE_ID_GADGETS]: process.env.PAGE_ACCESS_TOKEN_GADGETS
};

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// ✅ Helper: get pause state from Notion
async function getPauseState() {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Type",
        rich_text: { equals: "BotState" }
      },
      page_size: 1
    });

    if (response.results.length > 0) {
      const paused = response.results[0].properties["Paused"]?.checkbox;
      return paused === true;
    }
  } catch (err) {
    console.error("❗ Error reading pause state from Notion:", err);
  }
  return false;
}

// ✅ Helper: set pause state in Notion
async function setPauseState(paused) {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Type",
        rich_text: { equals: "BotState" }
      },
      page_size: 1
    });

    if (response.results.length > 0) {
      await notion.pages.update({
        page_id: response.results[0].id,
        properties: {
          Paused: { checkbox: paused }
        }
      });
    } else {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          Type: { rich_text: [{ text: { content: "BotState" } }] },
          Paused: { checkbox: paused }
        }
      });
    }
  } catch (err) {
    console.error("❗ Error setting pause state in Notion:", err);
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Forbidden');
    }
  }

  if (req.method === 'POST') {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        if (!entry.messaging) continue;
        
        const pageId = entry.id;
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;
        const messageText = webhookEvent.message?.text;

        const pageAccessToken = pageTokens[pageId];
        if (!pageAccessToken) {
          console.error(`No access token found for Page ID: ${pageId}`);
          continue;
        }

        if (!messageText) return res.status(200).send('No message text');

        // ✅ Commands
        if (messageText.toLowerCase() === 'pausebot') {
          await setPauseState(true);
          await sendMessage(senderId, '🤖 Bot paused. Human takeover active.', pageAccessToken);
          return res.status(200).send('Paused');
        }

        if (messageText.toLowerCase() === 'resumebot') {
          await setPauseState(false);
          await sendMessage(senderId, '🤖 Bot resumed. Automatic replies active.', pageAccessToken);
          return res.status(200).send('Resumed');
        }

        if (await getPauseState()) {
          return res.status(200).send('Paused - no reply sent');
        }

        // ✅ Action & Processing
        await sendTypingAction(senderId, pageAccessToken);
        const userHistory = await getUserHistoryFromNotion(senderId);

        try {
          const geminiResponse = await fetch(`${process.env.SITE_URL}/api/gemini`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: messageText, history: userHistory })
          });

          const data = await geminiResponse.json();
          const reply = data.reply || 'မဖြေပေးနိုင်ပါ။';

          // ✅ ၁။ အရင်ဆုံး Messenger ကို စာပို့ပါ (Notion error ကြောင့် ရပ်မသွားစေရန်)
          await sendMessage(senderId, reply, pageAccessToken);

          // ✅ ၂။ ပြီးမှ Notion ထဲ သိမ်းပါ
          await saveChatToNotion(senderId, messageText, reply, pageId);

        } catch (error) {
          console.error("❗ Error in Gemini/Messenger flow:", error);
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }
  }
  return res.status(405).send('Method Not Allowed');
}

async function sendTypingAction(recipientId, pageAccessToken) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: 'typing_on'
    })
  });
}

async function sendMessage(recipientId, message, pageAccessToken) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message }
    })
  });
}

// ✅ ပြင်ဆင်ထားသော Notion Save Function
async function saveChatToNotion(senderId, userMessage, botReply, pageId) {
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Yangon" });
  
  // ✅ Notion ရဲ့ ၂၀၀၀ character limit မကျော်အောင် ဖြတ်ချခြင်း
  const safeUserMsg = userMessage.length > 2000 ? userMessage.substring(0, 1990) + "..." : userMessage;
  const safeBotReply = botReply.length > 2000 ? botReply.substring(0, 1990) + "..." : botReply;

  try {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Timestamp: { title: [{ text: { content: timestamp } }] },
        "User Message": { rich_text: [{ text: { content: safeUserMsg } }] },
        "Bot Reply": { rich_text: [{ text: { content: safeBotReply } }] },
        "Sender ID": { rich_text: [{ text: { content: senderId } }] },
        "Page ID": { rich_text: [{ text: { content: pageId } }] }
      }
    });
  } catch (err) {
    console.error("❗ Notion Save Error:", err.message);
  }
}

async function getUserHistoryFromNotion(senderId) {
  const history = [];
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'Sender ID',
        rich_text: { equals: senderId }
      },
      sorts: [{ property: 'Timestamp', direction: 'ascending' }],
      page_size: 10 // Quota ချွေတာရန် စာမျက်နှာ ၁၀ ခုခန့်သာ ယူပါ
    });

    for (const page of response.results) {
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
