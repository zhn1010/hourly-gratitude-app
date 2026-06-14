import { logError, logInfo } from "../logger";
import type { Repository } from "../repository";
import type { MemoryFactInput } from "../types";
import type { LlmService } from "./llmService";

const MIN_CONFIDENCE = 0.65;

export class MemoryService {
  constructor(
    private readonly repository: Repository,
    private readonly llm: LlmService
  ) {}

  async captureFromMessage(input: {
    userId: number;
    messageId: number;
    text: string;
    localDate: string;
    receivedAtUtc: string;
    nowIso: string;
  }): Promise<void> {
    try {
      const existingMemories = await this.repository.getMemoriesForUser(input.userId);
      const extraction = await this.llm.extractMemories({
        messageText: input.text,
        localDate: input.localDate,
        existingMemories
      });

      const facts = extraction.facts
        .map((fact): MemoryFactInput | null => {
          const key = normalizeMemoryKey(fact.key);
          const category = cleanText(fact.category, 40);
          const subject = cleanText(fact.subject, 80);
          const factText = cleanText(fact.fact, 500);
          const sourceText = cleanText(fact.source_quote || input.text, 280);
          const confidence = Number(fact.confidence);

          if (!key || !category || !subject || !factText || !Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
            return null;
          }

          return {
            userId: input.userId,
            key,
            category,
            subject,
            fact: factText,
            confidence: clamp(confidence, 0, 1),
            sourceText,
            sourceMessageId: input.messageId,
            observedAtUtc: input.receivedAtUtc,
            nowIso: input.nowIso
          };
        })
        .filter((fact): fact is MemoryFactInput => fact !== null);

      for (const fact of facts) {
        await this.repository.upsertMemoryFact(fact);
      }

      if (facts.length > 0) {
        logInfo("memories_captured", { count: facts.length, messageId: input.messageId });
      }
    } catch (error) {
      logError("memory_capture_failed", error, { messageId: input.messageId });
    }
  }
}

function normalizeMemoryKey(value: string): string | null {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:_]+|[-:_]+$/g, "")
    .slice(0, 120);

  return key.length >= 3 ? key : null;
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
