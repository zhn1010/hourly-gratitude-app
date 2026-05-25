export {};

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const webhookUrl = process.env.WEBHOOK_URL;

if (!botToken || !webhookSecret || !webhookUrl) {
  console.error("Required env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_URL");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${webhookUrl.replace(/\/$/, "")}/telegram/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false
  })
});

const body = await response.json();
if (!response.ok) {
  console.error(body);
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
