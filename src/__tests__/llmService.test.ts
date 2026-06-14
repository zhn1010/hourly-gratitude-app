import { describe, expect, it } from "vitest";
import { LlmService } from "../services/llmService";
import type { AppConfig, StoredGratitudeEntry } from "../types";

const config: AppConfig = {
  timezone: "Europe/Berlin",
  telegramBotToken: "token",
  telegramWebhookSecret: "secret",
  allowedTelegramUserId: 123,
  openAiApiKey: "key",
  openAiTextModel: "model",
  openAiFastTextModel: "fast-model",
  openAiPosterTextModel: "poster-model",
  openAiImageModel: "image",
  posterImageQuality: "medium",
  posterImageSize: "1024x1536",
  allowedReactions: ["❤️", "🙏", "👏", "🎉", "🤩", "🥰", "👌", "🫶", "💯", "🔥"]
};

describe("LlmService reaction selection", () => {
  it("prompts the model to avoid generic reaction defaults", async () => {
    let capturedPrompt = "";
    let capturedOptions: unknown;
    const service = new LlmService(
      {
        generateJson: async (prompt: string, _schemaName: string, _schema: unknown, options: unknown) => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return { emoji: "🎉" };
        }
      } as never,
      config
    );

    const emoji = await service.selectReaction("بالاخره پروژه تموم شد، خیلی خوشحالم!", []);

    expect(emoji).toBe("🎉");
    expect(capturedPrompt).toContain("All explanations and generated text outputs in this bot must be Persian");
    expect(capturedPrompt).toContain("Do not overuse 🙏");
    expect(capturedPrompt).toContain("success, completion, pride, progress -> 🎉");
    expect(capturedPrompt).toContain("excitement, delight, surprise, wonder -> 🤩");
    expect(capturedPrompt).not.toContain("Earlier today");
    expect(capturedOptions).toEqual({
      model: "fast-model",
      reasoningEffort: "none",
      maxOutputTokens: 64,
      verbosity: "low"
    });
  });

  it("falls back when the model returns an unsupported emoji", async () => {
    const service = new LlmService(
      {
        generateJson: async () => ({ emoji: "😇" })
      } as never,
      config
    );

    await expect(service.selectReaction("امروز بابت آرامش صبح ممنونم.", [])).resolves.toBe("🙏");
  });
});

describe("LlmService cost controls", () => {
  it("uses the fast text model and only recent entries for nudges", async () => {
    let capturedPrompt = "";
    let capturedOptions: unknown;
    const service = new LlmService(
      {
        generateJson: async (prompt: string, _schemaName: string, _schema: unknown, options: unknown) => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return { message: "یک یادداشت کوچک هم کافی است." };
        }
      } as never,
      config
    );

    await service.createNudge(14, 50, [
      entry(8, "first"),
      entry(9, "second"),
      entry(10, "third"),
      entry(11, "fourth")
    ]);

    expect(capturedPrompt).toContain("Recent gratitude entries");
    expect(capturedPrompt).toContain("Output must always be Persian");
    expect(capturedPrompt).not.toContain("Match the dominant language");
    expect(capturedPrompt).not.toContain("first");
    expect(capturedPrompt).toContain("second");
    expect(capturedPrompt).toContain("third");
    expect(capturedPrompt).toContain("fourth");
    expect(capturedOptions).toEqual({
      model: "fast-model",
      reasoningEffort: "none",
      maxOutputTokens: 96,
      verbosity: "low"
    });
  });

  it("uses Persian fallback text when generated nudge text is not Persian", async () => {
    const service = new LlmService(
      {
        generateJson: async () => ({ message: "A small note still counts." })
      } as never,
      config
    );

    await expect(service.createNudge(14, 50, [])).resolves.toBe("هنوز وقت هست یک قدردانی کوچک برای این ساعت بنویسی.");
  });

  it("uses the poster text model and truncates long poster entries", async () => {
    let capturedPrompt = "";
    let capturedOptions: unknown;
    const longText = "x".repeat(220);
    const service = new LlmService(
      {
        generateJson: async (prompt: string, _schemaName: string, _schema: unknown, options: unknown) => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return { summary: "خلاصه", image_prompt: "پوستر شاد", caption: "سپاسگزارم" };
        }
      } as never,
      config
    );

    await service.createPosterPlan("2026-06-08", [entry(8, longText)]);

    expect(capturedPrompt).toContain("All output fields must always be Persian");
    expect(capturedPrompt).toContain("some sort of visual timeline");
    expect(capturedPrompt).toContain(`${"x".repeat(180)}...`);
    expect(capturedPrompt).not.toContain("x".repeat(181));
    expect(capturedOptions).toEqual({
      model: "poster-model",
      reasoningEffort: "none",
      maxOutputTokens: 1200,
      verbosity: "low"
    });
  });
});

describe("LlmService memory extraction", () => {
  it("grounds durable memories to the local date", async () => {
    let capturedPrompt = "";
    let capturedOptions: unknown;
    const service = new LlmService(
      {
        generateJson: async (prompt: string, _schemaName: string, _schema: unknown, options: unknown) => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return {
            facts: [
              {
                key: "person:niki:birth_date",
                category: "person",
                subject: "Niki",
                fact: "Niki is the user's daughter and was born on 2023-06-15.",
                confidence: 0.92,
                source_quote: "tomorrow is my girl Niki 3 year old birth day"
              }
            ]
          };
        }
      } as never,
      config
    );

    const result = await service.extractMemories({
      messageText: "tomorrow is my girl Niki 3 year old birth day",
      localDate: "2026-06-14",
      existingMemories: []
    });

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.key).toBe("person:niki:birth_date");
    expect(capturedPrompt).toContain("Current local date: 2026-06-14");
    expect(capturedPrompt).toContain("If the user says a child is turning N years old on a date, infer the birth date.");
    expect(capturedPrompt).toContain("my daughter");
    expect(capturedPrompt).toContain("my girl");
    expect(capturedOptions).toEqual({
      model: "fast-model",
      reasoningEffort: "none",
      maxOutputTokens: 900,
      verbosity: "low"
    });
  });
});

function entry(hour: number, text: string): StoredGratitudeEntry {
  return {
    id: hour,
    telegram_update_id: hour,
    telegram_message_id: hour,
    chat_id: 123,
    user_id: 123,
    text,
    received_at_utc: `2026-06-08T${String(hour).padStart(2, "0")}:00:00.000Z`,
    local_date: "2026-06-08",
    local_hour: hour,
    reaction_emoji: null,
    created_at_utc: "2026-06-08T00:00:00.000Z"
  };
}
