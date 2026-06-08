export interface Env {
  DB: D1Database;
  POSTERS: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  ALLOWED_TELEGRAM_USER_ID: string;
  TIMEZONE?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_FAST_TEXT_MODEL?: string;
  OPENAI_POSTER_TEXT_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
  POSTER_IMAGE_QUALITY?: string;
  POSTER_IMAGE_SIZE?: string;
  TELEGRAM_ALLOWED_REACTIONS?: string;
}

export type PosterImageQuality = "low" | "medium" | "high" | "auto";

export interface AppConfig {
  timezone: "Europe/Berlin";
  telegramBotToken: string;
  telegramWebhookSecret: string;
  allowedTelegramUserId: number;
  openAiApiKey: string;
  openAiTextModel: string;
  openAiFastTextModel: string;
  openAiPosterTextModel: string;
  openAiImageModel: string;
  posterImageQuality: PosterImageQuality;
  posterImageSize: string;
  allowedReactions: string[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: {
    id: number;
    type: string;
  };
  from?: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    language_code?: string;
  };
  text?: string;
  caption?: string;
}

export interface StoredGratitudeEntry {
  id: number;
  telegram_update_id: number;
  telegram_message_id: number;
  chat_id: number;
  user_id: number;
  text: string;
  received_at_utc: string;
  local_date: string;
  local_hour: number;
  reaction_emoji: string | null;
  created_at_utc: string;
}

export interface TelegramMessageResult {
  message_id: number;
}

export interface NudgeRecordInput {
  localDate: string;
  localHour: number;
  localMinute: number;
  chatId: number;
  prompt: string;
  messageText: string;
  telegramMessageId: number | null;
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string;
}

export interface DailyPosterInput {
  localDate: string;
  chatId: number;
  summary: string;
  imagePrompt: string;
  r2Key: string | null;
  telegramMessageId: number | null;
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string;
}
