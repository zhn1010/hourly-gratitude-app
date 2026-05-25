import { describe, expect, it } from "vitest";
import { LlmService } from "../services/llmService";
import type { AppConfig } from "../types";

const config: AppConfig = {
  timezone: "Europe/Berlin",
  telegramBotToken: "token",
  telegramWebhookSecret: "secret",
  allowedTelegramUserId: 123,
  openAiApiKey: "key",
  openAiTextModel: "model",
  openAiImageModel: "image",
  allowedReactions: ["❤️", "🙏", "👏", "🎉", "🤩", "🥰", "👌", "🫶", "💯", "🔥"]
};

describe("LlmService reaction selection", () => {
  it("prompts the model to avoid generic reaction defaults", async () => {
    let capturedPrompt = "";
    const service = new LlmService(
      {
        generateJson: async (prompt: string) => {
          capturedPrompt = prompt;
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
