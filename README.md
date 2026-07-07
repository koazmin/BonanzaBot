# BonanzaBot

Bonanza E-Reader Store ရဲ့ Facebook Messenger + Web chat assistant (Gemini AI)။

## Environment Variables

### မဖြစ်မနေလိုအပ်သည် (ရှိပြီးသား)

| Variable | ရှင်းလင်းချက် |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key |
| `MESSENGER_VERIFY_TOKEN` | Webhook verify token |
| `PAGE_ID_EREADER` / `PAGE_ACCESS_TOKEN_EREADER` | E-reader page |
| `PAGE_ID_GADGETS` / `PAGE_ACCESS_TOKEN_GADGETS` | Gadgets page |
| `NOTION_API_KEY` / `NOTION_DATABASE_ID` | Chat log database |

### အသစ်ထည့်ရန် (recommended)

| Variable | ရှင်းလင်းချက် |
|---|---|
| `FB_APP_SECRET` | Facebook App → Settings → Basic → App Secret။ ထည့်ထားမှ webhook request အတုများကို ပယ်ချနိုင်မည်။ မထည့်ရသေးလျှင် bot က ပုံမှန်အလုပ်လုပ်နေမည် (warning log သာထွက်မည်)။ |
| `FB_APP_ID` | Facebook App ID။ Human takeover detection ပိုတိကျစေရန်။ |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | [Upstash](https://upstash.com) free Redis။ Message dedup နှင့် human-takeover pause အတွက်။ မထည့်လျှင် in-memory fallback ဖြင့် အလုပ်လုပ်မည် (serverless instance တစ်ခုအတွင်းသာ မှတ်မိမည်)။ |
| `NOTION_PRODUCTS_DB_ID` | ဈေးနှုန်းစာရင်း Notion database (အောက်တွင်ကြည့်ပါ)။ မထည့်လျှင် code ထဲက fallback စာရင်းကို သုံးမည်။ |
| `HUMAN_TAKEOVER_HOURS` | လူကိုယ်တိုင် reply ပြန်ပြီးနောက် bot ငြိမ်နေမည့် နာရီ (default: 6) |

## Products Database (Notion) — ဈေးနှုန်း redeploy မလုပ်ဘဲ ပြင်နည်း

Notion တွင် database အသစ်တစ်ခုဆောက်ပြီး column များ:

- **Name** (Title) — ပစ္စည်းအမည် ဥပမာ `Boox Palma 2`
- **Price** (Number သို့မဟုတ် Text) — MMK ဈေး ဥပမာ `1225500`
- **InStock** (Checkbox) — check = လက်ကျန်ရှိ၊ uncheck = Pre-order
- **Category** (Select, optional) — `Accessory` ဟုထည့်လျှင် Accessories အုပ်စုထဲဝင်မည်
- **Note** (Text, optional) — ထပ်ဆောင်းမှတ်ချက်

Database ကို integration နှင့် share လုပ်ပြီး ID ကို `NOTION_PRODUCTS_DB_ID` တွင်ထည့်ပါ။ Bot သည် ၁၀ မိနစ်တစ်ခါ cache refresh လုပ်သည် — Notion မှာဈေးပြင်လိုက်လျှင် အများဆုံး ၁၀ မိနစ်အတွင်း bot က ဈေးအသစ်ပြောမည်။

## Facebook Webhook Setup

Meta Developer Console → Messenger → Webhooks တွင် subscribe လုပ်ရမည့် fields:

- `messages` (ရှိပြီးသား)
- `message_echoes` — **အသစ်ထည့်ရန်**။ Page inbox မှ လူကိုယ်တိုင် reply ပြန်လျှင် bot က အလိုအလျောက် အဲဒီစကားဝိုင်းအတွက် `HUMAN_TAKEOVER_HOURS` ကြာ ငြိမ်နေမည်။

## Bot ရပ်ခြင်း / ပြန်ဖွင့်ခြင်း

- **စကားဝိုင်းတစ်ခုချင်း**: Page inbox မှ လူကိုယ်တိုင် reply ပြန်လိုက်ရုံဖြင့် အဲဒီ customer အတွက် bot အလိုအလျောက်ရပ်မည်။ Customer ကလည်း "လူနဲ့ပြောမယ် 👤" ခလုတ်နှိပ်၍ တောင်းဆိုနိုင်သည်။
- **တစ်ခုလုံးရပ်ရန် (kill-switch)**: Notion chat log database ထဲက `BotState` row ၏ **Paused** checkbox ကို check လုပ်ပါ (ခြောက်လုံးပြန်ဖွင့်ရန် uncheck)။ Chat ထဲမှ `pausebot` command ဖြင့် တစ်ခုလုံးရပ်၍ **မရတော့ပါ** — ယခင်က မည်သည့် customer မဆို bot တစ်ခုလုံးကို ရပ်နိုင်နေသောကြောင့် ဖြုတ်ထားသည်။

## Development

```bash
npm install
npm run dev
```
