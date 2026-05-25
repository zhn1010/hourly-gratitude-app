// @ts-nocheck
import { OpenAiClient } from "../src/clients/openaiClient";
import { LlmService } from "../src/services/llmService";
import type { AppConfig, StoredGratitudeEntry } from "../src/types";

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

interface PersianSample {
  hour: number;
  theme: string;
  text: string;
}

interface PersianSamplesResult {
  samples: PersianSample[];
}

interface ReactionCheckResult {
  hour: number;
  theme: string;
  text: string;
  emoji: string;
}

const samplesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["samples"],
  properties: {
    samples: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hour", "theme", "text"],
        properties: {
          hour: { type: "integer", minimum: 8, maximum: 21 },
          theme: { type: "string" },
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
const localDate = process.env.REACTION_SAMPLE_DATE ?? getBerlinDate(new Date());
const sampleCount = Number(process.env.REACTION_SAMPLE_COUNT ?? 10);
const outDir = process.env.REACTION_SAMPLE_OUT_DIR ?? "tmp/reaction-sample";
const allowedReactions = (process.env.TELEGRAM_ALLOWED_REACTIONS ?? "❤️,🙏,👏,🎉,🤩,🥰,👌,🫶,💯,🔥")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const config: AppConfig = {
  timezone: "Europe/Berlin",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "sample-token",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "sample-secret",
  allowedTelegramUserId: Number(process.env.ALLOWED_TELEGRAM_USER_ID ?? 1),
  openAiApiKey,
  openAiTextModel: textModel,
  openAiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  allowedReactions
};

const openAi = new OpenAiClient(openAiApiKey, textModel, config.openAiImageModel);
const llm = new LlmService(openAi, config);

console.log(`Generating ${sampleCount} Persian gratitude samples with ${textModel}...`);
const sampleResult = await openAi.generateJson<PersianSamplesResult>(
  [
    "Generate Persian gratitude samples for testing emoji reaction selection.",
    `Return exactly ${sampleCount} samples.`,
    "Each sample should be natural, short, and emotionally distinct.",
    "Cover a mix of themes: love, relief, achievement, beauty, food, friendship, health, surprise, quiet peace, and excitement.",
    "Use hours from 8 through 21. Do not include markdown."
  ].join("\n"),
  "persian_reaction_samples",
  {
    ...samplesSchema,
    properties: {
      ...samplesSchema.properties,
      samples: {
        ...samplesSchema.properties.samples,
        minItems: sampleCount,
        maxItems: sampleCount
      }
    }
  }
);

const samples = sampleResult.samples.slice(0, sampleCount);
const entries: StoredGratitudeEntry[] = [];
const results: ReactionCheckResult[] = [];

for (const [index, sample] of samples.entries()) {
  const entry = toStoredEntry(sample, localDate, index);
  entries.push(entry);
  const emoji = await llm.selectReaction(sample.text, entries);
  entry.reaction_emoji = emoji;
  results.push({
    hour: sample.hour,
    theme: sample.theme,
    text: sample.text,
    emoji
  });
}

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(`${outDir}/reaction-results.json`, JSON.stringify(results, null, 2));

console.log("");
console.log("Reaction check results:");
for (const result of results) {
  console.log(`${String(result.hour).padStart(2, "0")}:00 ${result.emoji} [${result.theme}] ${result.text}`);
}
console.log("");
console.log(`Wrote ${outDir}/reaction-results.json`);

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
    throw new Error(`${name} is required. Set it in your shell, .env, or .dev.vars.`);
  }
  return value;
}

function toStoredEntry(sample: PersianSample, localDate: string, index: number): StoredGratitudeEntry {
  return {
    id: index + 1,
    telegram_update_id: 3000 + index,
    telegram_message_id: 4000 + index,
    chat_id: 1,
    user_id: 1,
    text: sample.text,
    received_at_utc: `${localDate}T${String(sample.hour).padStart(2, "0")}:00:00.000Z`,
    local_date: localDate,
    local_hour: sample.hour,
    reaction_emoji: null,
    created_at_utc: new Date().toISOString()
  };
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
