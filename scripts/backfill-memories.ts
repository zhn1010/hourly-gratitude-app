// @ts-nocheck
import { OpenAiClient } from "../src/clients/openaiClient";
import { LlmService } from "../src/services/llmService";
import type { AppConfig, MemoryFactInput, PosterImageQuality, StoredGratitudeEntry, StoredMemory } from "../src/types";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

interface ProposedMemory {
  status: "new" | "update" | "unchanged";
  userId: number;
  key: string;
  category: string;
  subject: string;
  fact: string;
  previousFact: string | null;
  confidence: number;
  sourceText: string;
  sourceMessageId: number;
  sourceEntryId: number;
  observedAtUtc: string;
  localDate: string;
}

interface BackfillFile {
  generatedAtUtc: string;
  database: string;
  target: "local" | "remote";
  sourceEntryCount: number;
  proposedMemories: ProposedMemory[];
}

const fs = await importNodeModule("node:fs/promises");
const childProcess = await importNodeModule("node:child_process");

await loadDotEnv(".env");
await loadDotEnv(".dev.vars");

const args = parseArgs(process.argv.slice(2));
const database = args.database ?? process.env.MEMORY_BACKFILL_DATABASE ?? "gratitude_bot";
const target = args.local ? "local" : "remote";
const outDir = args.outDir ?? process.env.MEMORY_BACKFILL_OUT_DIR ?? "tmp/memory-backfill";
const jsonOut = args.out ?? `${outDir}/proposed-memories.json`;
const markdownOut = args.markdownOut ?? `${outDir}/proposed-memories.md`;

if (args.apply) {
  const inputPath = args.input ?? process.env.MEMORY_BACKFILL_INPUT ?? jsonOut;
  await applyBackfill(inputPath);
} else {
  requireOpenAiExportConsent();
  await previewBackfill();
}

async function previewBackfill(): Promise<void> {
  const config = buildConfig();
  const openAi = new OpenAiClient(config.openAiApiKey, config.openAiTextModel, config.openAiImageModel);
  const llm = new LlmService(openAi, config);

  const entries = await loadGratitudeEntries();
  const existingMemories = await loadExistingMemories(config.allowedTelegramUserId);
  const memoryContext = new Map(existingMemories.map((memory) => [memory.memory_key, memory]));
  const proposed = new Map<string, ProposedMemory>();

  console.log(`Reading ${entries.length} gratitude entries from ${target} D1 database "${database}".`);
  console.log("Extracting durable memory candidates. This does not write to D1.");

  for (const entry of entries) {
    const extraction = await llm.extractMemories({
      messageText: entry.text,
      localDate: entry.local_date,
      existingMemories: Array.from(memoryContext.values())
    });

    for (const fact of extraction.facts) {
      const key = normalizeMemoryKey(fact.key);
      const category = cleanText(fact.category, 40);
      const subject = cleanText(fact.subject, 80);
      const factText = cleanText(fact.fact, 500);
      const sourceText = cleanText(fact.source_quote || entry.text, 280);
      const confidence = Number(fact.confidence);

      if (!key || !category || !subject || !factText || !Number.isFinite(confidence) || confidence < 0.65) {
        continue;
      }

      const existing = memoryContext.get(key);
      const status = !existing ? "new" : existing.fact === factText ? "unchanged" : "update";
      const candidate: ProposedMemory = {
        status,
        userId: entry.user_id,
        key,
        category,
        subject,
        fact: factText,
        previousFact: existing?.fact ?? null,
        confidence: clamp(confidence, 0, 1),
        sourceText,
        sourceMessageId: entry.telegram_message_id,
        sourceEntryId: entry.id,
        observedAtUtc: entry.received_at_utc,
        localDate: entry.local_date
      };

      proposed.set(`${entry.user_id}:${key}`, candidate);
      memoryContext.set(key, toStoredMemory(candidate));
    }
  }

  const file: BackfillFile = {
    generatedAtUtc: new Date().toISOString(),
    database,
    target,
    sourceEntryCount: entries.length,
    proposedMemories: Array.from(proposed.values()).filter((item) => item.status !== "unchanged")
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(jsonOut, JSON.stringify(file, null, 2));
  await fs.writeFile(markdownOut, renderMarkdown(file));

  console.log("");
  console.log(`Proposed memories: ${file.proposedMemories.length}`);
  console.log(`JSON review/apply file: ${jsonOut}`);
  console.log(`Markdown review file: ${markdownOut}`);
  console.log("");
  console.log(renderConsoleTable(file.proposedMemories));
  console.log("");
  console.log(`To apply after review: pnpm run memory:apply -- --input ${jsonOut}`);
}

async function applyBackfill(inputPath: string): Promise<void> {
  const raw = await fs.readFile(inputPath, "utf8");
  const file = JSON.parse(raw) as BackfillFile;
  const applicable = file.proposedMemories.filter((memory) => memory.status === "new" || memory.status === "update");
  const nowIso = new Date().toISOString();

  console.log(`Applying ${applicable.length} reviewed memories to ${target} D1 database "${database}".`);

  for (const memory of applicable) {
    await upsertMemoryFact({
      userId: memory.userId,
      key: memory.key,
      category: memory.category,
      subject: memory.subject,
      fact: memory.fact,
      confidence: memory.confidence,
      sourceText: memory.sourceText,
      sourceMessageId: memory.sourceMessageId,
      observedAtUtc: memory.observedAtUtc,
      nowIso
    });
  }

  console.log(`Applied ${applicable.length} memories.`);
}

async function loadGratitudeEntries(): Promise<StoredGratitudeEntry[]> {
  const where = [];
  if (args.sinceDate) {
    where.push(`local_date >= ${sqlQuote(args.sinceDate)}`);
  }
  const limit = Number(args.limit ?? process.env.MEMORY_BACKFILL_LIMIT ?? 500);
  const sql = `
    SELECT *
    FROM gratitude_entries
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY received_at_utc ASC
    LIMIT ${Number.isSafeInteger(limit) && limit > 0 ? limit : 500}
  `;

  return runD1Select<StoredGratitudeEntry>(sql);
}

async function loadExistingMemories(userId: number): Promise<StoredMemory[]> {
  try {
    return await runD1Select<StoredMemory>(`
      SELECT *
      FROM memories
      WHERE user_id = ${Number(userId)}
      ORDER BY updated_at_utc DESC
      LIMIT 200
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such table") || message.includes("memories")) {
      console.warn("Could not read memories table. Continuing preview with no existing memories.");
      return [];
    }
    throw error;
  }
}

async function upsertMemoryFact(input: MemoryFactInput): Promise<void> {
  await runD1Command(`
    INSERT INTO memories (
      user_id, memory_key, category, subject, fact, confidence, source_text,
      source_message_id, created_at_utc, updated_at_utc, last_observed_at_utc
    )
    VALUES (
      ${Number(input.userId)},
      ${sqlQuote(input.key)},
      ${sqlQuote(input.category)},
      ${sqlQuote(input.subject)},
      ${sqlQuote(input.fact)},
      ${Number(input.confidence)},
      ${sqlQuote(input.sourceText)},
      ${Number(input.sourceMessageId)},
      ${sqlQuote(input.nowIso)},
      ${sqlQuote(input.nowIso)},
      ${sqlQuote(input.observedAtUtc)}
    )
    ON CONFLICT(user_id, memory_key) DO UPDATE SET
      category = excluded.category,
      subject = excluded.subject,
      fact = excluded.fact,
      confidence = excluded.confidence,
      source_text = excluded.source_text,
      source_message_id = excluded.source_message_id,
      updated_at_utc = excluded.updated_at_utc,
      last_observed_at_utc = excluded.last_observed_at_utc
  `);
}

async function runD1Select<T>(sql: string): Promise<T[]> {
  const results = await runD1Command(sql);
  return extractD1Rows<T>(results);
}

async function runD1Command(sql: string): Promise<unknown> {
  const wranglerArgs = [
    "exec",
    "wrangler",
    "d1",
    "execute",
    database,
    target === "local" ? "--local" : "--remote",
    "--json",
    "--command",
    sql
  ];
  const output = await execFile("pnpm", wranglerArgs);
  return JSON.parse(output);
}

function extractD1Rows<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    const first = value[0] as { results?: T[] } | undefined;
    return first?.results ?? [];
  }

  if (value && typeof value === "object") {
    const object = value as { result?: Array<{ results?: T[] }>; results?: T[] };
    return object.results ?? object.result?.[0]?.results ?? [];
  }

  return [];
}

async function execFile(command: string, execArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(command, execArgs, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error([stderr, stdout, error.message].filter(Boolean).join("\n")));
        return;
      }
      resolve(stdout);
    });
  });
}

function buildConfig(): AppConfig {
  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const textModel = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.2";
  const fastTextModel = process.env.OPENAI_FAST_TEXT_MODEL ?? textModel;

  return {
    timezone: "Europe/Berlin",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "backfill-token",
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "backfill-secret",
    allowedTelegramUserId: Number(process.env.ALLOWED_TELEGRAM_USER_ID ?? 1),
    openAiApiKey,
    openAiTextModel: textModel,
    openAiFastTextModel: fastTextModel,
    openAiPosterTextModel: process.env.OPENAI_POSTER_TEXT_MODEL ?? textModel,
    openAiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    posterImageQuality: parsePosterImageQuality(process.env.POSTER_IMAGE_QUALITY),
    posterImageSize: process.env.POSTER_IMAGE_SIZE ?? "1024x1536",
    allowedReactions: (process.env.TELEGRAM_ALLOWED_REACTIONS ?? "❤️,🙏,👏,🎉,🤩,🥰,👌,🫶,💯,🔥")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  };
}

function parseArgs(values: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) {
      continue;
    }
    const key = toCamelCase(value.slice(2));
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function renderMarkdown(file: BackfillFile): string {
  const rows = file.proposedMemories.map((memory) => [
    memory.status,
    memory.key,
    memory.subject,
    memory.fact,
    String(memory.confidence.toFixed(2)),
    memory.localDate,
    String(memory.sourceMessageId),
    memory.sourceText
  ]);

  return [
    "# Proposed Memories",
    "",
    `Generated: ${file.generatedAtUtc}`,
    `Source entries scanned: ${file.sourceEntryCount}`,
    `Database target: ${file.target}/${file.database}`,
    "",
    "| Status | Key | Subject | Fact | Confidence | Date | Message | Source |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`),
    ""
  ].join("\n");
}

function renderConsoleTable(memories: ProposedMemory[]): string {
  if (memories.length === 0) {
    return "No new or updated memories proposed.";
  }

  return memories
    .map((memory, index) => {
      const prefix = `${index + 1}. [${memory.status}] ${memory.key} (${memory.confidence.toFixed(2)})`;
      const previous = memory.previousFact ? `\n   previous: ${memory.previousFact}` : "";
      return `${prefix}\n   fact: ${memory.fact}${previous}\n   source: ${memory.localDate} #${memory.sourceMessageId} ${memory.sourceText}`;
    })
    .join("\n\n");
}

async function loadDotEnv(path: string): Promise<void> {
  try {
    const content = await fs.readFile(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function toStoredMemory(memory: ProposedMemory): StoredMemory {
  return {
    id: 0,
    user_id: memory.userId,
    memory_key: memory.key,
    category: memory.category,
    subject: memory.subject,
    fact: memory.fact,
    confidence: memory.confidence,
    source_text: memory.sourceText,
    source_message_id: memory.sourceMessageId,
    created_at_utc: memory.observedAtUtc,
    updated_at_utc: memory.observedAtUtc,
    last_observed_at_utc: memory.observedAtUtc
  };
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

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Set it in your shell, .env, or .dev.vars.`);
  }
  return value;
}

function requireOpenAiExportConsent(): void {
  if (args.allowOpenaiExport || process.env.MEMORY_BACKFILL_ALLOW_OPENAI_EXPORT === "1") {
    return;
  }

  throw new Error(
    [
      "Preview reads historical gratitude entries and sends their text to OpenAI for memory extraction.",
      "Run again with --allow-openai-export only after you explicitly approve that data flow.",
      "Example: pnpm run memory:preview -- --allow-openai-export"
    ].join("\n")
  );
}

function parsePosterImageQuality(value: string | undefined): PosterImageQuality {
  const quality = value?.trim() || "medium";
  if (quality !== "low" && quality !== "medium" && quality !== "high" && quality !== "auto") {
    throw new Error("POSTER_IMAGE_QUALITY must be one of: low, medium, high, auto");
  }
  return quality as PosterImageQuality;
}

async function importNodeModule(specifier: string): Promise<any> {
  const importer = new Function("specifier", "return import(specifier)") as (value: string) => Promise<any>;
  return importer(specifier);
}
