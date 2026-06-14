export interface ReactionResult {
  emoji: string;
}

export interface NudgeResult {
  message: string;
}

export interface PosterPlanResult {
  summary: string;
  image_prompt: string;
  caption: string;
}

export interface MemoryFactResult {
  key: string;
  category: string;
  subject: string;
  fact: string;
  confidence: number;
  source_quote: string;
}

export interface MemoryExtractionResult {
  facts: MemoryFactResult[];
}

export const reactionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["emoji"],
  properties: {
    emoji: { type: "string" }
  }
};

export const nudgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: { type: "string" }
  }
};

export const posterPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "image_prompt", "caption"],
  properties: {
    summary: { type: "string" },
    image_prompt: { type: "string" },
    caption: { type: "string" }
  }
};

export const memoryExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["facts"],
  properties: {
    facts: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "category", "subject", "fact", "confidence", "source_quote"],
        properties: {
          key: { type: "string" },
          category: { type: "string" },
          subject: { type: "string" },
          fact: { type: "string" },
          confidence: { type: "number" },
          source_quote: { type: "string" }
        }
      }
    }
  }
};
