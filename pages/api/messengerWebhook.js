import fetch from 'node-fetch';
import { Client } from '@notionhq/client';

let paused = false;

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
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
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;
        const messageText = webhookEvent.message?.text;

        if (!messageText) return res.status(200).send('No message text');

        if (messageText.toLowerCase() === 'pausebot') {
          paused = true;
          await sendMessage(senderId, '🤖 Bot paused. Human takeover active.');
          return res.status(200).send('Paused');
        }
        if (messageText.toLowerCase() === 'resumebot') {
          paused = false;
          await sendMessage(senderId, '🤖 Bot resumed. Automatic replies active.');
          return res.status(200).send('Resumed');
        }

        if (paused) return res.status(200).send('Paused - no reply sent');

        // ✅ Typing effect starts here
        await sendTypingAction(senderId);
        await new Promise(resolve => setTimeout(resolve, 1500));

        // ✅ Retrieve user's previous chat history from Notion
        const userHistory = await getUserHistoryFromNotion(senderId);

        // ✅ Send message to Gemini with retrieved history
        const geminiResponse = await fetch(`${process.env.SITE_URL}/api/gemini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: messageText, history: userHistory })
        });

        const data = await geminiResponse.json();
        const reply = data.reply || 'မဖြေပေးနိုင်ပါ။';

        await sendMessage(senderId, reply);

        // ✅ Save this interaction to Notion with senderId
        await saveChatToNotion(senderId, messageText, reply);
      }
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Not Found');
    }
  }

  return res.status(405).send('Method Not Allowed');
}

async function sendTypingAction(recipientId) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: 'typing_on'
    })
  });
}

async function sendMessage(recipientId, message) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message }
    })
  });
}

async function saveChatToNotion(senderId, userMessage, botReply) {
  const timestamp = new Date().toLocaleString();
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
      page_size: 20 // Retrieve last 20 entries to limit payload
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
