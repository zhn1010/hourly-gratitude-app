import type { OpenAiClient } from "../clients/openaiClient";
import type { AppConfig, StoredGratitudeEntry, StoredMemory } from "../types";
import {
  type MemoryExtractionResult,
  type NudgeResult,
  type PosterPlanResult,
  type ReactionResult,
  memoryExtractionSchema,
  nudgeSchema,
  posterPlanSchema,
  reactionSchema
} from "../llmSchemas";

export class LlmService {
  constructor(
    private readonly openAi: OpenAiClient,
    private readonly config: AppConfig
  ) {}

  async selectReaction(entryText: string, _todayEntries: StoredGratitudeEntry[]): Promise<string> {
    const prompt = [
      "Select exactly one Telegram emoji reaction for this gratitude message.",
      "All explanations and generated text outputs in this bot must be Persian, but this task must return only one emoji.",
      `Allowed reactions: ${this.config.allowedReactions.join(" ")}`,
      "Choose the most emotionally specific reaction, not the safest generic one.",
      "Use variety when the message gives a clear cue:",
      "- love, care, tenderness, affection -> 🥰 or ❤",
      "- friendship, support, being held, kindness -> 🥰, ❤, or 👏",
      "- success, completion, pride, progress -> 🎉, 💯, 👏, or 🔥",
      "- excitement, delight, surprise, wonder -> 🤩, 🎉, or 🔥",
      "- food, comfort, beauty, small joy -> 🥰, 🤩, ❤, or 👌",
      "- calm, relief, health, spiritual thanks, general thankfulness -> 🙏",
      "Do not overuse 🙏. Pick 🙏 only when it is clearly the best emotional fit.",
      "Return only an emoji from the allowed reactions list.",
      "",
      `Message: ${entryText}`
    ].join("\n");

    const result = await this.openAi.generateJson<ReactionResult>(prompt, "reaction_choice", reactionSchema, {
      model: this.config.openAiFastTextModel,
      reasoningEffort: "none",
      maxOutputTokens: 64,
      verbosity: "low"
    });
    return this.config.allowedReactions.includes(result.emoji) ? result.emoji : "🙏";
  }

  async createNudge(
    localHour: number,
    localMinute: number,
    todayEntries: StoredGratitudeEntry[],
    memories: StoredMemory[] = []
  ): Promise<string> {
    const prompt = [
      "Write one short Telegram nudge reminding the user to send one gratitude for the current hour.",
      "Output must always be Persian, regardless of the user's previous entries.",
      "Constraints: one sentence, no guilt, no markdown, no hashtags, under 180 characters.",
      `Current local time: ${String(localHour).padStart(2, "0")}:${String(localMinute).padStart(2, "0")} Europe/Berlin.`,
      "",
      formatMemories(memories, "Known user context"),
      "",
      formatEntries(lastEntries(todayEntries, 3), "Recent gratitude entries")
    ].join("\n");

    const result = await this.openAi.generateJson<NudgeResult>(prompt, "gratitude_nudge", nudgeSchema, {
      model: this.config.openAiFastTextModel,
      reasoningEffort: "none",
      maxOutputTokens: 96,
      verbosity: "low"
    });
    return cleanPersianSingleLine(result.message, fallbackNudge(localMinute));
  }

  async createPosterPlan(
    localDate: string,
    entries: StoredGratitudeEntry[],
    memories: StoredMemory[] = []
  ): Promise<PosterPlanResult> {
    const prompt = [
      "Create an end-of-day gratitude poster plan for a Telegram bot.",
      "All output fields must always be Persian, regardless of the user's entries.",
      "Make the visual direction fun, surprising, specific, and detailed.",
      "The poster should be some sort of visual timeline of the day's gratitude moments.",
      "The image prompt should be suitable for a vertical poster, rich in concrete visual details from the day, and should not include private Telegram metadata.",
      "Caption must be concise and suitable for Telegram.",
      `Local date: ${localDate}`,
      "",
      formatMemories(memories, "Known user context"),
      "",
      formatEntries(truncateEntryText(entries, 180), "Entries")
    ].join("\n");

    const result = await this.openAi.generateJson<PosterPlanResult>(prompt, "daily_poster_plan", posterPlanSchema, {
      model: this.config.openAiPosterTextModel,
      reasoningEffort: "none",
      maxOutputTokens: 1200,
      verbosity: "low"
    });
    return {
      summary: cleanPersianSingleLine(result.summary, fallbackSummary(entries)),
      image_prompt: cleanPersianMultiline(result.image_prompt, fallbackPosterPrompt(localDate, entries)),
      caption: cleanPersianSingleLine(result.caption, "امروز در سپاسگزاری.")
    };
  }

  async extractMemories(input: {
    messageText: string;
    localDate: string;
    existingMemories: StoredMemory[];
  }): Promise<MemoryExtractionResult> {
    const prompt = [
      "Extract durable personal memories from one Telegram gratitude message.",
      "Return only facts that are likely to help future personalization: family relationships, names, birthdays, important dates, preferences, constraints, projects, recurring routines, or meaningful milestones.",
      "Do not store ordinary one-off gratitude content unless it reveals a durable fact.",
      "Use concise English for internal memory facts, even if the user writes in another language.",
      "Ground relative dates against the current Europe/Berlin local date.",
      "If the user says a child is turning N years old on a date, infer the birth date.",
      "Treat phrasing like 'my daughter', 'my girl', or 'my little girl' as the user's child when the context is family or childhood.",
      "Use stable lowercase keys in the form category:subject:attribute, for example person:niki:relationship or person:niki:birth_date.",
      "If a new message corrects an existing memory, return the corrected fact with the same key.",
      "Do not guess sensitive facts, medical diagnoses, or anything unsupported by the message.",
      "Use confidence from 0 to 1. Return no facts when confidence is below 0.65.",
      "",
      `Current local date: ${input.localDate}`,
      "",
      formatMemories(input.existingMemories, "Existing memories"),
      "",
      `Message: ${input.messageText}`
    ].join("\n");

    return this.openAi.generateJson<MemoryExtractionResult>(prompt, "memory_extraction", memoryExtractionSchema, {
      model: this.config.openAiFastTextModel,
      reasoningEffort: "none",
      maxOutputTokens: 900,
      verbosity: "low"
    });
  }
}

export function fallbackReaction(): string {
  return "🙏";
}

export function fallbackNudge(minute: number): string {
  if (minute === 50) {
    return "هنوز وقت هست یک قدردانی کوچک برای این ساعت بنویسی.";
  }
  if (minute === 55) {
    return "پنج دقیقه مانده؛ یک جمله قدردانی برای این ساعت کافی است.";
  }
  return "آخرین فرصت کوتاه این ساعت: از چه چیزی قدردانی می‌کنی؟";
}

export function fallbackSummary(entries: StoredGratitudeEntry[]): string {
  if (entries.length === 0) {
    return "امروز هیچ قدردانی ثبت نشد.";
  }
  return `امروز ${entries.length} قدردانی ثبت شد.`;
}

export function fallbackPosterPrompt(localDate: string, entries: StoredGratitudeEntry[]): string {
  const fragments = entries.map((entry) => entry.text).join("; ");
  return [
    `پوستر عمودی شاد و سپاسگزارانه برای ${localDate}.`,
    "یک کلاژ بازیگوش و پرداخت‌شده با تایپوگرافی دست‌نویس، جزئیات انسانی گرم، و نمادهای کوچک و غافلگیرکننده بساز.",
    fragments ? `اشاره‌های تصویری انتزاعی به این موارد داشته باشد: ${fragments}` : "یک روز آرام را با فضایی برای قدردانی‌های فردا نشان بده.",
    "بدون لوگو، بدون اسکرین‌شات، بدون رابط کاربری تلگرام."
  ].join(" ");
}

function formatEntries(entries: StoredGratitudeEntry[], title: string): string {
  if (entries.length === 0) {
    return `${title}: none yet.`;
  }

  return [
    `${title}:`,
    ...entries.map((entry) => `- ${String(entry.local_hour).padStart(2, "0")}:00 ${entry.text}`)
  ].join("\n");
}

function formatMemories(memories: StoredMemory[], title: string): string {
  if (memories.length === 0) {
    return `${title}: none yet.`;
  }

  return [
    `${title}:`,
    ...memories.slice(0, 20).map((memory) => `- ${memory.memory_key}: ${memory.fact}`)
  ].join("\n");
}

function lastEntries(entries: StoredGratitudeEntry[], count: number): StoredGratitudeEntry[] {
  return entries.slice(-count);
}

function truncateEntryText(entries: StoredGratitudeEntry[], maxLength: number): StoredGratitudeEntry[] {
  return entries.map((entry) => ({
    ...entry,
    text: entry.text.length > maxLength ? `${entry.text.slice(0, maxLength).trimEnd()}...` : entry.text
  }));
}

function cleanSingleLine(value: string, fallback: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : fallback;
}

function cleanPersianSingleLine(value: string, fallback: string): string {
  const text = cleanSingleLine(value, fallback);
  return hasPersianText(text) ? text : fallback;
}

function cleanPersianMultiline(value: string, fallback: string): string {
  const text = value.trim();
  return text.length > 0 && hasPersianText(text) ? text : fallback;
}

function hasPersianText(value: string): boolean {
  return /[\u0600-\u06ff]/u.test(value);
}
