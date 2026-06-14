import { describe, expect, it } from "vitest";
import { MemoryService } from "../services/memoryService";
import type { MemoryFactInput } from "../types";

describe("MemoryService", () => {
  it("stores high-confidence durable facts and ignores weak facts", async () => {
    const stored: MemoryFactInput[] = [];
    const service = new MemoryService(
      {
        getMemoriesForUser: async () => [],
        upsertMemoryFact: async (input: MemoryFactInput) => stored.push(input)
      } as never,
      {
        extractMemories: async () => ({
          facts: [
            {
              key: "Person Niki Birth Date",
              category: "person",
              subject: "Niki",
              fact: "Niki is the user's daughter and was born on 2023-06-15.",
              confidence: 0.95,
              source_quote: "tomorrow is my girl Niki 3 year old birth day"
            },
            {
              key: "mood:today",
              category: "mood",
              subject: "today",
              fact: "The user felt good today.",
              confidence: 0.4,
              source_quote: "good day"
            }
          ]
        })
      } as never
    );

    await service.captureFromMessage({
      userId: 123,
      messageId: 10,
      text: "tomorrow is my girl Niki 3 year old birth day",
      localDate: "2026-06-14",
      receivedAtUtc: "2026-06-14T10:00:00.000Z",
      nowIso: "2026-06-14T10:00:01.000Z"
    });

    expect(stored).toEqual([
      {
        userId: 123,
        key: "person-niki-birth-date",
        category: "person",
        subject: "Niki",
        fact: "Niki is the user's daughter and was born on 2023-06-15.",
        confidence: 0.95,
        sourceText: "tomorrow is my girl Niki 3 year old birth day",
        sourceMessageId: 10,
        observedAtUtc: "2026-06-14T10:00:00.000Z",
        nowIso: "2026-06-14T10:00:01.000Z"
      }
    ]);
  });

  it("does not throw when memory extraction fails", async () => {
    const service = new MemoryService(
      {
        getMemoriesForUser: async () => []
      } as never,
      {
        extractMemories: async () => {
          throw new Error("llm unavailable");
        }
      } as never
    );

    await expect(
      service.captureFromMessage({
        userId: 123,
        messageId: 10,
        text: "Mahya started growing her first tooth.",
        localDate: "2026-06-14",
        receivedAtUtc: "2026-06-14T10:00:00.000Z",
        nowIso: "2026-06-14T10:00:01.000Z"
      })
    ).resolves.toBeUndefined();
  });
});
