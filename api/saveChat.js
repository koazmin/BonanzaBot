import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userMessage, botReply } = req.body;
  if (!userMessage || !botReply) {
    return res.status(400).json({ error: 'Missing userMessage or botReply' });
  }

  try {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId || !client_email || !private_key) {
      console.error('❗ Missing env variables.');
      return res.status(500).json({ error: 'Server configuration error: Missing Spreadsheet ID or Service Account credentials.' });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email,
        private_key,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString();

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[now, userMessage, botReply]],
      },
    });

    return res.status(200).json({ message: 'Chat saved successfully', result: response.data });
  } catch (error) {
    console.error('❗ Google Sheets API Error:', error);
    return res.status(500).json({ error: JSON.stringify(error, null, 2) });
  }
}
