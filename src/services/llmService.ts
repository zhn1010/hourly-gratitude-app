import type { OpenAiClient } from "../clients/openaiClient";
import type { AppConfig, StoredGratitudeEntry } from "../types";
import {
  type NudgeResult,
  type PosterPlanResult,
  type ReactionResult,
  nudgeSchema,
  posterPlanSchema,
  reactionSchema
} from "../llmSchemas";

export class LlmService {
  constructor(
    private readonly openAi: OpenAiClient,
    private readonly config: AppConfig
  ) {}

  async selectReaction(entryText: string, todayEntries: StoredGratitudeEntry[]): Promise<string> {
    const prompt = [
      "Select exactly one Telegram emoji reaction for this gratitude message.",
      `Allowed reactions: ${this.config.allowedReactions.join(" ")}`,
      "Prefer emotionally fitting, gentle reactions. Match the user's language/culture only through the emoji choice.",
      "",
      `Message: ${entryText}`,
      "",
      formatEntries(todayEntries, "Earlier today")
    ].join("\n");

    const result = await this.openAi.generateJson<ReactionResult>(prompt, "reaction_choice", reactionSchema);
    return this.config.allowedReactions.includes(result.emoji) ? result.emoji : "🙏";
  }

  async createNudge(localHour: number, localMinute: number, todayEntries: StoredGratitudeEntry[]): Promise<string> {
    const prompt = [
      "Write one short Telegram nudge reminding the user to send one gratitude for the current hour.",
      "Constraints: one sentence, no guilt, no markdown, no hashtags, under 180 characters.",
      "Match the dominant language of today's entries. If unclear, use English.",
      `Current local time: ${String(localHour).padStart(2, "0")}:${String(localMinute).padStart(2, "0")} Europe/Berlin.`,
      "",
      formatEntries(todayEntries, "Today's gratitude entries so far")
    ].join("\n");

    const result = await this.openAi.generateJson<NudgeResult>(prompt, "gratitude_nudge", nudgeSchema);
    return cleanSingleLine(result.message, fallbackNudge(localMinute));
  }

  async createPosterPlan(localDate: string, entries: StoredGratitudeEntry[]): Promise<PosterPlanResult> {
    const prompt = [
      "Create an end-of-day gratitude poster plan for a Telegram bot.",
      "Match the user's dominant language from the entries. Make the visual direction fun, surprising, specific, and detailed.",
      "The image prompt should be suitable for a vertical poster, rich in concrete visual details from the day, and should not include private Telegram metadata.",
      "Caption must be concise and suitable for Telegram.",
      `Local date: ${localDate}`,
      "",
      formatEntries(entries, "Entries")
    ].join("\n");

    const result = await this.openAi.generateJson<PosterPlanResult>(prompt, "daily_poster_plan", posterPlanSchema);
    return {
      summary: cleanSingleLine(result.summary, fallbackSummary(entries)),
      image_prompt: result.image_prompt.trim() || fallbackPosterPrompt(localDate, entries),
      caption: cleanSingleLine(result.caption, "Today in gratitude.")
    };
  }
}

export function fallbackReaction(): string {
  return "🙏";
}

export function fallbackNudge(minute: number): string {
  if (minute === 50) {
    return "A small gratitude from this hour is still welcome.";
  }
  if (minute === 55) {
    return "Five minutes left to catch this hour with one grateful note.";
  }
  return "Last tiny window for this hour: what is one thing you appreciated?";
}

export function fallbackSummary(entries: StoredGratitudeEntry[]): string {
  if (entries.length === 0) {
    return "No gratitude entries were recorded today.";
  }
  return `Today included ${entries.length} gratitude ${entries.length === 1 ? "entry" : "entries"}.`;
}

export function fallbackPosterPrompt(localDate: string, entries: StoredGratitudeEntry[]): string {
  const fragments = entries.map((entry) => entry.text).join("; ");
  return [
    `A vertical joyful gratitude poster for ${localDate}.`,
    "Create a playful, polished collage with hand-lettered typography, warm human details, and surprising small visual symbols.",
    fragments ? `Include abstract visual references to: ${fragments}` : "Show a quiet day with space for tomorrow's grateful moments.",
    "No logos, no screenshots, no Telegram UI."
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

function cleanSingleLine(value: string, fallback: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : fallback;
}
