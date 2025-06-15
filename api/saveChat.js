import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userMessage, botReply } = req.body;

  if (!userMessage || !botReply) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const now = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[now, userMessage, botReply]],
      },
    });

    return res.status(200).json({ message: 'Chat saved successfully' });
  } catch (error) {
    console.error('Google Sheets API Error:', error);
    return res.status(500).json({ error: 'Failed to save chat to Google Sheets' });
  }
}
