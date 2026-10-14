// TEMPORARY: inspect the raw "Final Price MMK" formula shape. Remove after use.
export default async function handler(req, res) {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${process.env.NOTION_PRODUCTS_DB_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 4 }),
    }
  );
  const data = await response.json();
  res.status(200).json(
    (data.results || []).map((p) => ({
      name: (p.properties?.Name?.title || []).map((t) => t.plain_text).join(''),
      finalPrice: p.properties?.['Final Price MMK'],
      priceUsd: p.properties?.['Price USD'],
    }))
  );
}
