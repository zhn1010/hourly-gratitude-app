import { fetchArrayBuffer, fetchJson } from "../httpClient";

interface OpenAiTextResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

interface OpenAiImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
}

export interface GeneratePosterImageOptions {
  size?: string;
  timeoutMs?: number;
  retries?: number;
}

export class OpenAiClient {
  constructor(
    private readonly apiKey: string,
    private readonly textModel: string,
    private readonly imageModel: string
  ) {}

  async generateJson<T>(input: string, schemaName: string, schema: Record<string, unknown>): Promise<T> {
    const response = await fetchJson<OpenAiTextResponse>(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.textModel,
          input,
          text: {
            format: {
              type: "json_schema",
              name: schemaName,
              schema,
              strict: true
            }
          }
        })
      },
      { timeoutMs: 45_000, retries: 2 }
    );

    const text = extractResponseText(response);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`OpenAI returned invalid JSON for ${schemaName}`);
    }
  }

  async generatePosterImage(prompt: string, options: GeneratePosterImageOptions = {}): Promise<Uint8Array> {
    const timeoutMs = options.timeoutMs ?? 180_000;
    const retries = options.retries ?? 1;

    const response = await fetchJson<OpenAiImageResponse>(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.imageModel,
          prompt,
          size: options.size ?? "1024x1536"
        })
      },
      { timeoutMs, retries }
    );

    const first = response.data?.[0];
    if (first?.b64_json) {
      return base64ToBytes(first.b64_json);
    }

    if (first?.url) {
      return new Uint8Array(await fetchArrayBuffer(first.url, { method: "GET" }, { timeoutMs, retries }));
    }

    throw new Error("OpenAI image response did not include b64_json or url data");
  }

  private headers(): Record<string, string> {
    return {
      "authorization": `Bearer ${this.apiKey}`,
      "content-type": "application/json"
    };
  }
}

function extractResponseText(response: OpenAiTextResponse): string {
  if (response.output_text) {
    return response.output_text;
  }

  const content = response.output?.flatMap((item) => item.content ?? []) ?? [];
  const text = content.find((item) => item.type === "output_text" || item.text)?.text;
  if (!text) {
    throw new Error("OpenAI response did not include output text");
  }
  return text;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
