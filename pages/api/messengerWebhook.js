import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';
import { Client } from '@notionhq/client';

// ✅ Initialize Redis from environment variables
const redis = Redis.fromEnv();

// Map Page IDs to their Access Tokens
const pageTokens = {
  [process.env.PAGE_ID_EREADER]: process.env.PAGE_ACCESS_TOKEN_EREADER,
  [process.env.PAGE_ID_GADGETS]: process.env.PAGE_ACCESS_TOKEN_GADGETS,
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

        // ✅ PauseBot / ResumeBot (stored in Redis per page)
        if (messageText.toLowerCase() === 'pausebot') {
          await redis.set(`pause:${pageId}`, 'true');
          await sendMessage(senderId, '🤖 Bot paused. Human takeover active.', pageAccessToken);
          return res.status(200).send('Paused');
        }

        if (messageText.toLowerCase() === 'resumebot') {
          await redis.set(`pause:${pageId}`, 'false');
          await sendMessage(senderId, '🤖 Bot resumed. Automatic replies active.', pageAccessToken);
          return res.status(200).send('Resumed');
        }

        // ✅ Check pause state
        const isPaused = await redis.get(`pause:${pageId}`);
        if (isPaused === 'true') {
          return res.status(200).send('Paused - no reply sent');
        }

        // Typing indicator
        await sendTypingAction(senderId, pageAccessToken);
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Get chat history
        const userHistory = await getUserHistoryFromNotion(senderId, pageId);

        const geminiResponse = await fetch(`${process.env.SITE_URL}/api/gemini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: messageText, history: userHistory }),
        });

        const data = await geminiResponse.json();
        const reply = data.reply || 'မဖြေပေးနိုင်ပါ။';

        await sendMessage(senderId, reply, pageAccessToken);

        // Save to Notion
        await saveChatToNotion(senderId, messageText, reply, pageId);
      }

      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Not Found');
    }
  }

  return res.status(405).send('Method Not Allowed');
}

// Send typing indicator
async function sendTypingAction(recipientId, pageAccessToken) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: 'typing_on',
    }),
  });
}

// Send message
async function sendMessage(recipientId, message, pageAccessToken) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
    }),
  });
}

// Save logs to Notion
async function saveChatToNotion(senderId, userMessage, botReply, pageId) {
  const timestamp = new Date().toLocaleString();
  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Timestamp: {
        title: [
          {
            type: 'text',
            text: { content: timestamp },
          },
        ],
      },
      'User Message': {
        rich_text: [
          {
            type: 'text',
            text: { content: userMessage },
          },
        ],
      },
      'Bot Reply': {
        rich_text: [
          {
            type: 'text',
            text: { content: botReply },
          },
        ],
      },
      'Sender ID': {
        rich_text: [
          {
            type: 'text',
            text: { content: senderId },
          },
        ],
      },
      'Page ID': {
        rich_text: [
          {
            type: 'text',
            text: { content: pageId },
          },
        ],
      },
    },
  });
}
