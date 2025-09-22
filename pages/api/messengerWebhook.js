import fetch from 'node-fetch';
import { Client } from '@notionhq/client';

let paused = false;

// ✅ Map Page IDs to their Access Tokens
const pageTokens = {
  [process.env.PAGE_ID_EREADER]: process.env.PAGE_ACCESS_TOKEN_EREADER,
  [process.env.PAGE_ID_GADGETS]: process.env.PAGE_ACCESS_TOKEN_GADGETS
};

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

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
        // ✅ Get the Page ID for this event
        const pageId = entry.id;
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;
        const messageText = webhookEvent.message?.text;

        // ✅ Find the correct access token for the page
        const pageAccessToken = pageTokens[pageId];

        if (!pageAccessToken) {
          console.error(`No access token found for Page ID: ${pageId}`);
          continue; // Skip to the next event
        }
        
        if (!messageText) return res.status(200).send('No message text');

        if (messageText.toLowerCase() === 'pausebot') {
          paused = true;
          await sendMessage(senderId, '🤖 Bot paused. Human takeover active.', pageAccessToken);
          return res.status(200).send('Paused');
        }
        if (messageText.toLowerCase() === 'resumebot') {
          paused = false;
          await sendMessage(senderId, '🤖 Bot resumed. Automatic replies active.', pageAccessToken);
          return res.status(200).send('Resumed');
        }

        if (paused) return res.status(200).send('Paused - no reply sent');

        await sendTypingAction(senderId, pageAccessToken);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const userHistory = await getUserHistoryFromNotion(senderId);

        const geminiResponse = await fetch(`${process.env.SITE_URL}/api/gemini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: messageText, history: userHistory })
        });

        const data = await geminiResponse.json();
        const reply = data.reply || 'မဖြေပေးနိုင်ပါ။';

        await sendMessage(senderId, reply, pageAccessToken);

        await saveChatToNotion(senderId, messageText, reply, pageId); // Pass pageId to Notion
      }
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Not Found');
    }
  }

  return res.status(405).send('Method Not Allowed');
}

// ✅ Pass pageAccessToken to functions
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

// ✅ Add pageId to the Notion log
async function saveChatToNotion(senderId, userMessage, botReply, pageId) {
  // ✅ Always save timestamp in Myanmar local time
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' });

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      'Timestamp': {
        title: [{ type: 'text', text: { content: timestamp } }]
      },
      'User Message': {
        rich_text: [{ type: 'text', text: { content: userMessage } }]
      },
      'Bot Reply': {
        rich_text: [{ type: 'text', text: { content: botReply } }]
      },
      'Sender ID': {
        rich_text: [{ type: 'text', text: { content: senderId } }]
      },
      'Page ID': { // Add a new column in Notion called "Page ID"
        rich_text: [{ type: 'text', text: { content: pageId } }]
      }
    }
  });
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
