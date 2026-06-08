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
          return { message: "A small note still counts." };
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

  it("uses the poster text model and truncates long poster entries", async () => {
    let capturedPrompt = "";
    let capturedOptions: unknown;
    const longText = "x".repeat(220);
    const service = new LlmService(
      {
        generateJson: async (prompt: string, _schemaName: string, _schema: unknown, options: unknown) => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return { summary: "summary", image_prompt: "prompt", caption: "caption" };
        }
      } as never,
      config
    );

    await service.createPosterPlan("2026-06-08", [entry(8, longText)]);

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
