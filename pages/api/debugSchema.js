// TEMPORARY: read formula expressions from the Products DB schema. Remove after use.
export default async function handler(req, res) {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${process.env.NOTION_PRODUCTS_DB_ID}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
      },
    }
  );
  const data = await response.json();
  const out = {};
  for (const [name, prop] of Object.entries(data.properties || {})) {
    out[name] = prop.type === 'formula' ? { type: 'formula', expression: prop.formula?.expression } : prop.type;
  }
  res.status(200).json({ status: response.status, properties: out });
}
