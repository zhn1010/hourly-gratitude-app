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
