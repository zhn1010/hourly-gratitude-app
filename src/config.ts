import type { AppConfig, Env } from "./types";

const DEFAULT_REACTIONS = ["❤️", "🙏", "👏", "🎉", "🤩", "🥰", "👌", "🫶", "💯", "🔥"];

export function getConfig(env: Env): AppConfig {
  const allowedTelegramUserId = Number(env.ALLOWED_TELEGRAM_USER_ID);
  if (!Number.isSafeInteger(allowedTelegramUserId)) {
    throw new Error("ALLOWED_TELEGRAM_USER_ID must be a numeric Telegram user ID");
  }

  if (env.TIMEZONE && env.TIMEZONE !== "Europe/Berlin") {
    throw new Error("Only TIMEZONE=Europe/Berlin is supported by this bot");
  }

  return {
    timezone: "Europe/Berlin",
    telegramBotToken: requireEnv(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN"),
    telegramWebhookSecret: requireEnv(env.TELEGRAM_WEBHOOK_SECRET, "TELEGRAM_WEBHOOK_SECRET"),
    allowedTelegramUserId,
    openAiApiKey: requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
    openAiTextModel: env.OPENAI_TEXT_MODEL ?? "gpt-5.2",
    openAiImageModel: env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    allowedReactions: parseReactions(env.TELEGRAM_ALLOWED_REACTIONS)
  };
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseReactions(value: string | undefined): string[] {
  const reactions = value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : DEFAULT_REACTIONS;
  return reactions.length > 0 ? reactions : DEFAULT_REACTIONS;
}
