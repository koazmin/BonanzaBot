import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = '1cufIXyD0NSVgoBU66dzIjs61kVgWWldxZGxS25rcRNc';
    const range = 'Sheet1!A:C'; // Timestamp | User Message | Bot Reply

    const { userMessage, botReply } = req.body;

    if (!userMessage || !botReply) {
      return res.status(400).json({ error: 'Missing userMessage or botReply' });
    }

    const timestamp = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[timestamp, userMessage, botReply]],
      },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving chat:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
