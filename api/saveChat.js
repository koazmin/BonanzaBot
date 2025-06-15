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
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      console.error('❗ SPREADSHEET_ID is missing.');
      return res.status(500).json({ error: 'Server configuration error: Missing Spreadsheet ID.' });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString();

    console.log('➡️ Writing to Spreadsheet:');
    console.log('Spreadsheet ID:', spreadsheetId);
    console.log('Sheet Range:', 'Sheet1!A1'); // Change if necessary
    console.log('Data:', [now, userMessage, botReply]);

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[now, userMessage, botReply]],
      },
    });

    console.log('✅ Google Sheets Response:', response.data);
    return res.status(200).json({ message: 'Chat saved successfully', result: response.data });
  } catch (error) {
    console.error('❗ Google Sheets API Error:', error);
    return res.status(500).json({ error: JSON.stringify(error, null, 2) });
  }
}
