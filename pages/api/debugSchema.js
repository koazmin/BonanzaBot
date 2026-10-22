// TEMPORARY: verify the bot can read the Settings rollups. Remove after use.
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
      body: JSON.stringify({ page_size: 100 }),
    }
  );
  const data = await response.json();
  const rollup = (p) => p?.rollup?.number ?? null;
  res.status(200).json(
    (data.results || []).map((p) => ({
      name: (p.properties?.Name?.title || []).map((t) => t.plain_text).join(''),
      settingsLinked: (p.properties?.Settings?.relation || []).length,
      rate: rollup(p.properties?.['USD Rate']),
      shipping: rollup(p.properties?.['Shipping MMK']),
      final: p.properties?.['Final Price MMK']?.formula?.number ?? null,
    }))
  );
}
