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
        property: "Type", // 👈 Add a column in Notion called "Type"
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
      // Update existing page
      await notion.pages.update({
        page_id: response.results[0].id,
        properties: {
          Paused: { checkbox: paused }
        }
      });
    } else {
      // Create new page
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

        // ✅ Pause command
        if (messageText.toLowerCase() === 'pausebot') {
          await setPauseState(true);
          await sendMessage(senderId, '🤖 Bot paused. Human takeover active.', pageAccessToken);
          return res.status(200).send('Paused');
        }

        // ✅ Resume command
        if (messageText.toLowerCase() === 'resumebot') {
          await setPauseState(false);
          await sendMessage(senderId, '🤖 Bot resumed. Automatic replies active.', pageAccessToken);
          return res.status(200).send('Resumed');
        }

        // ✅ Check pause state
        if (await getPauseState()) {
          return res.status(200).send('Paused - no reply sent');
        }

        // ✅ Typing action
        await sendTypingAction(senderId, pageAccessToken);
        await new Promise(resolve => setTimeout(resolve, 1500));

        // ✅ Get conversation history
        const userHistory = await getUserHistoryFromNotion(senderId);

        // ✅ Call Gemini AI
        const geminiResponse = await fetch(`${process.env.SITE_URL}/api/gemini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: messageText, history: userHistory })
        });

        const data = await geminiResponse.json();
        const reply = data.reply || 'မဖြေပေးနိုင်ပါ။';

        await sendMessage(senderId, reply, pageAccessToken);

        await saveChatToNotion(senderId, messageText, reply, pageId);
      }
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Not Found');
    }
  }

  return res.status(405).send('Method Not Allowed');
}

// ✅ Send typing
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

// ✅ Send message
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

// ✅ Save chats
async function saveChatToNotion(senderId, userMessage, botReply, pageId) {
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Yangon" });
  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Timestamp: { title: [{ text: { content: timestamp } }] },
      "User Message": { rich_text: [{ text: { content: userMessage } }] },
      "Bot Reply": { rich_text: [{ text: { content: botReply } }] },
      "Sender ID": { rich_text: [{ text: { content: senderId } }] },
      "Page ID": { rich_text: [{ text: { content: pageId } }] }
    }
  });
}

// ✅ Retrieve conversation history
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
      page_size: 20
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
