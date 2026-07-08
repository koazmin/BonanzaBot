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
| `NOTION_ORDERS_DB_ID` | Order များသိမ်းမည့် "Bonanza Orders" database ID။ **ထည့်မှသာ order-taking feature ပွင့်မည်။** |
| `ADMIN_PSID_EREADER` / `ADMIN_PSID_GADGETS` | Order noti လက်ခံမည့် admin ၏ Messenger PSID (page တစ်ခုချင်းစီအတွက် သီးသန့်)။ Page ကို `adminid` ဟု message ပို့လျှင် မိမိ PSID ကို bot က ပြန်ပြောပြမည်။ |

## Order-Taking Feature

Customer က Messenger မှ "ဝယ်မယ်" ပြောလျှင် bot က **အမည်၊ ဖုန်း၊ လိပ်စာ၊ ပစ္စည်း၊ အရေအတွက်၊ ငွေချေနည်း** တို့ကို စကားပြောရင်း မေးယူပြီး၊ customer အတည်ပြုမှသာ:

1. Notion **"Bonanza Orders"** database ထဲ `Pending` status ဖြင့် သိမ်းသည် (ဈေးနှုန်းကို bot ၏ inventory စာရင်းမှသာ ယူသည် — model ခန့်မှန်းဈေး မသုံးပါ)
2. Customer ထံ Order နံပါတ်ပါသော အတည်ပြုစာ ပို့သည်
3. Admin ထံ Messenger မှ order အသေးစိတ် noti ပို့သည်

Customer က နောက်မှ "order ဘယ်ရောက်နေပြီလဲ" မေးလျှင် Notion ထဲက Status (Pending/Confirmed/Shipped/Delivered/Cancelled) ကိုကြည့်ပြီး ဖြေသည် — Status ကို Notion ထဲမှာ ပြောင်းပေးရုံပါ။

### Setup (တစ်ကြိမ်သာ)

1. Orders database က ဆောက်ပြီးသားဖြစ်သည်: [Bonanza Orders](https://app.notion.com/p/ed596b2a051948ae95cdca002ca2344c)။ ၎င်း database ကိုဖွင့်ပြီး ⋯ menu → **Connections** → bot ၏ integration (chat log နှင့်တူတူ) ကို ချိတ်ပေးပါ။
2. Vercel တွင် `NOTION_ORDERS_DB_ID=ed596b2a051948ae95cdca002ca2344c` ထည့်ပါ။
3. Page တစ်ခုချင်းစီကို မိမိ personal Facebook account မှ **`adminid`** ဟု message ပို့ပါ — bot ကပြန်ပြောသော PSID ကို `ADMIN_PSID_EREADER` / `ADMIN_PSID_GADGETS` တွင်ထည့်ပါ။
4. Admin noti ပုံမှန်ရောက်စေရန် admin account မှ page ကို ရံဖန်ရံခါ message ပို့ထားပါ (Facebook ၏ messaging window policy ကြောင့်)။ Noti ရောက်/မရောက် မသေချာလျှင်လည်း order တိုင်း Notion ထဲမှာ အမြဲရှိသည်။

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

- **Admin command (အလွယ်ဆုံး)**: Page inbox ထဲမှ မည်သည့် customer စကားဝိုင်းတွင်မဆို **`pausebot`** ဟုရိုက်လျှင် bot တစ်ခုလုံးရပ်မည်၊ **`resumebot`** ဟုရိုက်လျှင် ပြန်ဖွင့်မည်။ Admin (page အနေဖြင့် inbox မှရိုက်သူ) သာ ဤ command ဖြင့် တစ်ခုလုံးထိန်းနိုင်သည် — customer များရိုက်လျှင် သူတို့စကားဝိုင်းတစ်ခုတည်းသာ သက်ရောက်သည်။
- **စကားဝိုင်းတစ်ခုချင်း (human takeover)**: Page inbox မှ လူကိုယ်တိုင် reply ပြန်လိုက်ရုံဖြင့် အဲဒီ customer အတွက် bot အလိုအလျောက်ရပ်ပြီး chat ထဲတွင် "👤 တာဝန်ရှိသူ ကိုယ်တိုင်ဝင်ရောက်ဖြေကြားပေးနေပါပြီ" ဟု ပေါ်မည်။ Customer ကလည်း "လူနဲ့ပြောမယ် 👤" ခလုတ်နှိပ်၍ တောင်းဆိုနိုင်သည်။
- **Backup kill-switch**: Notion chat log database ထဲက `BotState` row ၏ **Paused** checkbox ဖြင့်လည်း ရပ်/ဖွင့် လုပ်နိုင်သည် (`pausebot`/`resumebot` command များသည် ဤ checkbox ကိုပင် ပြောင်းပေးခြင်းဖြစ်သည်)။

## Development

```bash
npm install
npm run dev
```
