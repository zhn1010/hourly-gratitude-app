// @ts-nocheck
import { OpenAiClient } from "../src/clients/openaiClient";
import { LlmService } from "../src/services/llmService";
import type { AppConfig, PosterImageQuality, StoredGratitudeEntry } from "../src/types";

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
};

declare const Buffer: {
  from(data: Uint8Array | string, encoding?: string): Uint8Array;
};

interface PersianGratitudeItem {
  hour: number;
  text: string;
}

interface PersianGratitudeResult {
  entries: PersianGratitudeItem[];
}

const generatedEntriesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entries"],
  properties: {
    entries: {
      type: "array",
      minItems: 14,
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hour", "text"],
        properties: {
          hour: { type: "integer", minimum: 8, maximum: 21 },
          text: { type: "string" }
        }
      }
    }
  }
};

const fs = await importNodeModule("node:fs/promises");
await loadDotEnv(".env");
await loadDotEnv(".dev.vars");

const openAiApiKey = requireEnv("OPENAI_API_KEY");
const textModel = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.2";
const fastTextModel = process.env.OPENAI_FAST_TEXT_MODEL ?? textModel;
const posterTextModel = process.env.OPENAI_POSTER_TEXT_MODEL ?? textModel;
const imageModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const localDate = process.env.POSTER_SAMPLE_DATE ?? getBerlinDate(new Date());
const outDir = process.env.POSTER_SAMPLE_OUT_DIR ?? "tmp/poster-sample";
const imageSize = process.env.POSTER_IMAGE_SIZE ?? "1024x1536";
const imageQuality = parsePosterImageQuality(process.env.POSTER_IMAGE_QUALITY);
const imageTimeoutMs = Number(process.env.POSTER_IMAGE_TIMEOUT_MS ?? 300_000);

const config: AppConfig = {
  timezone: "Europe/Berlin",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "sample-token",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "sample-secret",
  allowedTelegramUserId: Number(process.env.ALLOWED_TELEGRAM_USER_ID ?? 1),
  openAiApiKey,
  openAiTextModel: textModel,
  openAiFastTextModel: fastTextModel,
  openAiPosterTextModel: posterTextModel,
  openAiImageModel: imageModel,
  posterImageQuality: imageQuality,
  posterImageSize: imageSize,
  allowedReactions: ["❤️", "🙏", "👏", "🎉", "🤩", "🥰", "👌", "🫶", "💯", "🔥"]
};

const openAi = new OpenAiClient(openAiApiKey, textModel, imageModel);
const llm = new LlmService(openAi, config);

console.log(`Generating Persian sample gratitude entries for ${localDate} with ${textModel}...`);
const gratitudeResult = await openAi.generateJson<PersianGratitudeResult>(
  [
    "Generate fictional Persian gratitude messages for one day.",
    "Return exactly one entry for each hour from 8 through 21 inclusive.",
    "Each text must be natural Persian, specific, varied, realistic, and short enough for Telegram.",
    "Mix work, food, family, city, body, rest, small surprises, and quiet moments.",
    "Do not mention that the entries are fictional."
  ].join("\n"),
  "persian_hourly_gratitude_samples",
  generatedEntriesSchema
);

const entries = toStoredEntries(gratitudeResult.entries, localDate);

console.log("Generating poster plan through LlmService.createPosterPlan...");
const posterPlan = await llm.createPosterPlan(localDate, entries);

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(`${outDir}/entries.json`, JSON.stringify(entries, null, 2));
await fs.writeFile(`${outDir}/poster-plan.json`, JSON.stringify(posterPlan, null, 2));
await fs.writeFile(`${outDir}/poster-prompt.txt`, posterPlan.image_prompt);

console.log(`Wrote prompt files to ${outDir}`);
console.log(`Generating image with ${imageModel}, size ${imageSize}, timeout ${imageTimeoutMs}ms...`);
const image = await openAi.generatePosterImage(posterPlan.image_prompt, {
  size: imageSize,
  quality: config.posterImageQuality,
  timeoutMs: imageTimeoutMs,
  retries: 0
});

await fs.writeFile(`${outDir}/poster.png`, Buffer.from(image));

console.log(`Wrote sample poster output to ${outDir}`);
console.log(`Prompt: ${outDir}/poster-prompt.txt`);
console.log(`Image: ${outDir}/poster.png`);

async function loadDotEnv(path: string): Promise<void> {
  try {
    const content = await fs.readFile(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Set it in your shell or .dev.vars.`);
  }
  return value;
}

function parsePosterImageQuality(value: string | undefined): PosterImageQuality {
  const quality = value?.trim() || "medium";
  if (quality !== "low" && quality !== "medium" && quality !== "high" && quality !== "auto") {
    throw new Error("POSTER_IMAGE_QUALITY must be one of: low, medium, high, auto");
  }
  return quality;
}

function toStoredEntries(items: PersianGratitudeItem[], localDate: string): StoredGratitudeEntry[] {
  const byHour = new Map(items.map((item) => [item.hour, item.text.trim()]));
  const missing = [];
  for (let hour = 8; hour <= 21; hour += 1) {
    if (!byHour.get(hour)) {
      missing.push(hour);
    }
  }
  if (missing.length > 0) {
    throw new Error(`LLM did not generate entries for these hours: ${missing.join(", ")}`);
  }

  return Array.from({ length: 14 }, (_, index) => {
    const hour = index + 8;
    return {
      id: index + 1,
      telegram_update_id: 1000 + index,
      telegram_message_id: 2000 + index,
      chat_id: 1,
      user_id: 1,
      text: byHour.get(hour)!,
      received_at_utc: `${localDate}T${String(hour).padStart(2, "0")}:00:00.000Z`,
      local_date: localDate,
      local_hour: hour,
      reaction_emoji: null,
      created_at_utc: new Date().toISOString()
    };
  });
}

function getBerlinDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function importNodeModule(specifier: string): Promise<any> {
  const importer = new Function("specifier", "return import(specifier)") as (value: string) => Promise<any>;
  return importer(specifier);
}
