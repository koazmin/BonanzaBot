import { Client } from '@notionhq/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const notion = new Client({ auth: process.env.NOTION_API_KEY }); // Your Notion integration token
    const databaseId = process.env.NOTION_DATABASE_ID; // Your Notion database ID

    if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
      console.error("Notion API Key or Database ID not set in environment variables.");
      return res.status(500).json({ error: "Server configuration error: Notion credentials missing." });
    }

    const { userMessage, botReply } = req.body;

    if (!userMessage || !botReply) {
      return res.status(400).json({ error: 'Missing userMessage or botReply' });
    }

    const timestamp = new Date().toISOString();

    // Append a new page (row) to the Notion database
    // Make sure the 'properties' names below match the exact column names in your Notion database
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        'Timestamp': { // Match this to your Notion database column name (e.g., 'Date' or 'Created Time')
          type: 'rich_text', // Or 'date' if you set it up as a Date property in Notion
          rich_text: [{ type: 'text', text: { content: timestamp } }]
        },
        'User Message': { // Match this to your Notion database column name
          type: 'rich_text',
          rich_text: [{ type: 'text', text: { content: userMessage } }]
        },
        'Bot Reply': { // Match this to your Notion database column name
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
