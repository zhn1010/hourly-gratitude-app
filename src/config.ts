import type { AppConfig, Env, PosterImageQuality } from "./types";

const DEFAULT_REACTIONS = ["❤️", "🙏", "👏", "🎉", "🤩", "🥰", "👌", "🫶", "💯", "🔥"];
const POSTER_IMAGE_QUALITIES = new Set<PosterImageQuality>(["low", "medium", "high", "auto"]);

export function getConfig(env: Env): AppConfig {
  requireBindings(env);

  const allowedTelegramUserId = Number(env.ALLOWED_TELEGRAM_USER_ID);
  if (!Number.isSafeInteger(allowedTelegramUserId)) {
    throw new Error("ALLOWED_TELEGRAM_USER_ID must be a numeric Telegram user ID");
  }

  if (env.TIMEZONE && env.TIMEZONE !== "Europe/Berlin") {
    throw new Error("Only TIMEZONE=Europe/Berlin is supported by this bot");
  }

  const openAiTextModel = env.OPENAI_TEXT_MODEL ?? "gpt-5.2";

  return {
    timezone: "Europe/Berlin",
    telegramBotToken: requireEnv(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN"),
    telegramWebhookSecret: requireEnv(env.TELEGRAM_WEBHOOK_SECRET, "TELEGRAM_WEBHOOK_SECRET"),
    allowedTelegramUserId,
    openAiApiKey: requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
    openAiTextModel,
    openAiFastTextModel: env.OPENAI_FAST_TEXT_MODEL ?? openAiTextModel,
    openAiPosterTextModel: env.OPENAI_POSTER_TEXT_MODEL ?? openAiTextModel,
    openAiImageModel: env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    posterImageQuality: parsePosterImageQuality(env.POSTER_IMAGE_QUALITY),
    posterImageSize: env.POSTER_IMAGE_SIZE ?? "1024x1536",
    allowedReactions: parseReactions(env.TELEGRAM_ALLOWED_REACTIONS)
  };
}

function requireBindings(env: Env): void {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing. Set d1_databases[0].binding to \"DB\" in wrangler.jsonc and redeploy.");
  }

  if (!env.POSTERS) {
    throw new Error("R2 binding POSTERS is missing. Set r2_buckets[0].binding to \"POSTERS\" in wrangler.jsonc and redeploy.");
  }
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

function parsePosterImageQuality(value: string | undefined): PosterImageQuality {
  const quality = value?.trim() || "medium";
  if (!POSTER_IMAGE_QUALITIES.has(quality as PosterImageQuality)) {
    throw new Error("POSTER_IMAGE_QUALITY must be one of: low, medium, high, auto");
  }
  return quality as PosterImageQuality;
}
