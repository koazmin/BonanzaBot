import fetch from 'node-fetch';

let paused = false;

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;

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

        const geminiResponse = await fetch(`${process.env.SITE_URL}/api/gemini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: messageText, history: [] })
        });

        const data = await geminiResponse.json();
        const reply = data.reply || 'မဖြေပေးနိုင်ပါ။';

        await sendMessage(senderId, reply);
      }
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Not Found');
    }
  }

  return res.status(405).send('Method Not Allowed');
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
