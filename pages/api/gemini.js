import { askGemini, BUSY_MESSAGE, NETWORK_ERROR_MESSAGE } from '../../lib/gemini';

export const config = {
  runtime: 'edge', // Vercel Cold Starts နှင့် Timeout ကာကွယ်ရန် Edge Runtime ဖြစ်သည်
};

export default async function handler(req) {
  const body = await req.json().catch(() => ({}));
  const { question, history } = body;

  if (!question || typeof question !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing question' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { reply, updatedHistory, model } = await askGemini({ question, history });
    return new Response(JSON.stringify({ reply, updatedHistory, model }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in gemini.js handler:', error);

    const isBusy = error.status === 503 || error.status === 429;
    return new Response(
      JSON.stringify({
        reply: isBusy ? BUSY_MESSAGE : NETWORK_ERROR_MESSAGE,
        updatedHistory: history || [],
        model: isBusy ? 'fallback-handler' : 'fail-safe',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
