import { describe, expect, it } from "vitest";
import { NudgeService } from "../services/nudgeService";
import type { AppConfig } from "../types";

const config: AppConfig = {
  timezone: "Europe/Berlin",
  telegramBotToken: "token",
  telegramWebhookSecret: "secret",
  allowedTelegramUserId: 123,
  openAiApiKey: "key",
  openAiTextModel: "model",
  openAiImageModel: "image",
  allowedReactions: ["🙏"]
};

describe("NudgeService", () => {
  it("does not send when the hour already has an entry", async () => {
    const sent: string[] = [];
    const service = new NudgeService(
      {
        hasEntryForHour: async () => true,
        reserveNudge: async () => {
          throw new Error("should not reserve");
        }
      } as never,
      { sendMessage: async (_chatId: number, text: string) => sent.push(text) } as never,
      { createNudge: async () => "hello" } as never,
      config
    );

    await service.sendNudgeIfNeeded("2026-05-25", 11, 50);

    expect(sent).toEqual([]);
  });

  it("does not send if the nudge was already reserved", async () => {
    const sent: string[] = [];
    const service = new NudgeService(
      {
        hasEntryForHour: async () => false,
        reserveNudge: async () => false
      } as never,
      { sendMessage: async (_chatId: number, text: string) => sent.push(text) } as never,
      { createNudge: async () => "hello" } as never,
      config
    );

    await service.sendNudgeIfNeeded("2026-05-25", 11, 50);

    expect(sent).toEqual([]);
  });

  it("sends a deterministic fallback if LLM nudge generation fails", async () => {
    const sent: string[] = [];
    let completedStatus = "";
    const service = new NudgeService(
      {
        hasEntryForHour: async () => false,
        reserveNudge: async () => true,
        getEntriesForDate: async () => [],
        completeNudge: async (input: { status: string }) => {
          completedStatus = input.status;
        }
      } as never,
      {
        sendMessage: async (_chatId: number, text: string) => {
          sent.push(text);
          return { message_id: 44 };
        }
      } as never,
      { createNudge: async () => { throw new Error("llm down"); } } as never,
      config
    );

    await service.sendNudgeIfNeeded("2026-05-25", 11, 55);

    expect(sent).toEqual(["Five minutes left to catch this hour with one grateful note."]);
    expect(completedStatus).toBe("sent");
  });
});
