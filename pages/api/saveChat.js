import { Client } from '@notionhq/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const notion = new Client({ auth: process.env.NOTION_API_KEY });
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
      console.error("Notion API Key or Database ID not set in environment variables.");
      return res.status(500).json({ error: "Server configuration error: Notion credentials missing." });
    }

    const { userMessage, botReply } = req.body;

    if (!userMessage || !botReply) {
      return res.status(400).json({ error: 'Missing userMessage or botReply' });
    }

    const timestamp = new Date().toLocaleString(); // Format date and time for readability

    // Append a new page (row) to the Notion database
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        // The first column 'Timestamp' is the Title property in your Notion database.
        // It must be sent using the 'title' key, not 'rich_text'.
        'Timestamp': { // This name must EXACTLY match your Notion database's Title column name.
          title: [
            {
              type: 'text',
              text: {
                content: timestamp // The actual date and time will be the title of the page
              }
            }
          ]
        },
        'User Message': { // This is a regular Text property
          type: 'rich_text',
          rich_text: [{ type: 'text', text: { content: userMessage } }]
        },
        'Bot Reply': { // This is a regular Text property
          type: 'rich_text',
          rich_text: [{ type: 'text', text: { content: botReply } }]
        },
      },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving chat to Notion:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
