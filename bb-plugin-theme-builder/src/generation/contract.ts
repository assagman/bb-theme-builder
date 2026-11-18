import { z } from "zod";
import { idSchema, paletteSchema } from "../theme/schema.ts";

export const GENERATION_TIMEOUT_MS = 180000;
export const POLL_INTERVAL_MS = 1000;
export const REASONING_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
  "ultracode",
] as const;
const MAX_SELECTION_LENGTH = 200;
// Long enough for a mood plus a few anchor colors; short enough to keep the model prompt focused and bounded.
export const MAX_DESCRIPTION_LENGTH = 600;
// Control, format (bidi, zero-width), and line/paragraph separator characters could forge or hide prompt structure, so only visible text and plain newlines pass.
const CONTROL_CHARACTERS = /(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
// Summaries are rendered as one plain line, so newlines are stripped too, unlike the brief filter above.
const SUMMARY_CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
/** Upper bound on an agent summary; the chat shows it as one short line. */
export const MAX_SUMMARY_LENGTH = 200;
/** Each AI reply and each user message is one checkpoint pair; 40 turns keep 20 checkpoints, as the design caps them. */
export const MAX_CHAT_TURNS = 40;
/** The page pings this often while open, and the sweeper runs on the same beat. */
export const PING_INTERVAL_MS = 60_000;
/** No ping for this long means the page was closed, so the session is ended to avoid an orphan agent thread. */
export const PAGE_CLOSED_MS = 5 * 60_000;
/** No user message for this long means the user left an open page, so the session is ended. */
export const IDLE_MS = 30 * 60_000;
/** One agent turn keeps the one-shot generation deadline, so chat replies are not slower to fail than before. */
export const TURN_TIMEOUT_MS = GENERATION_TIMEOUT_MS;
// Exported so local generation rejects exactly the accents the schema rejects.
export const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/;
const selectionString = z.string().min(1).max(MAX_SELECTION_LENGTH);
export const accentSchema = z
  .string()
  .regex(ACCENT_PATTERN)
  .transform((value) => value.toLowerCase());
// The natural-language brief is optional so plain Randomize keeps working; blank input collapses to null.
export const descriptionSchema = z
  .string()
  .max(MAX_DESCRIPTION_LENGTH)
  .transform((value) => value.replace(CONTROL_CHARACTERS, " ").trim())
  .transform((value) => (value === "" ? null : value));
export const selectionSchema = z.strictObject({
  providerId: selectionString,
  model: selectionString,
  reasoningLevel: z.enum(REASONING_LEVELS),
  serviceTier: z.enum(["default", "fast"]).optional(),
});
export const generatedPaletteSchema = z.strictObject({
  light: paletteSchema,
  dark: paletteSchema,
});
/** Agent summaries are untrusted model text; strip hidden characters and cap length so the chat can only show a short plain line. */
export const summarySchema = z
  .string()
  .transform((value) =>
    Array.from(value.replace(SUMMARY_CONTROL_CHARACTERS, " ").trim())
      .slice(0, MAX_SUMMARY_LENGTH)
      .join("")
      .trim(),
  );
/** Follow-up messages pass the same sanitizer as the first brief, but an empty message has nothing to send, so blank input is rejected. */
export const chatMessageSchema = descriptionSchema.pipe(z.string());
/** One chat line; user turns carry the hand-edited palette sent with them, agent turns carry their checkpoint palette. */
export const chatTurnSchema = z.strictObject({
  role: z.enum(["user", "agent"]),
  text: z.string().max(MAX_DESCRIPTION_LENGTH),
  palette: generatedPaletteSchema.nullable(),
  at: z.iso.datetime(),
});
/** What the page renders; `running` and `error` describe only the latest turn. */
export const chatStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({
    kind: z.literal("open"),
    sessionId: idSchema,
    selection: selectionSchema,
    accent: accentSchema.nullable(),
    turns: z.array(chatTurnSchema).max(MAX_CHAT_TURNS),
    running: z.boolean(),
    error: z.string().nullable(),
  }),
]);
const sessionIdInput = z.strictObject({ sessionId: idSchema });
/** Chat RPC surface; it sits beside the one-shot methods until the client stops using them. */
export const chatMethods = {
  chatStart: {
    input: z.strictObject({
      requestId: idSchema,
      selection: selectionSchema,
      accent: accentSchema.nullable(),
      description: descriptionSchema.nullable().default(null),
      palette: generatedPaletteSchema.nullable(),
    }),
    output: chatStateSchema,
  },
  chatSend: {
    input: z.strictObject({
      sessionId: idSchema,
      requestId: idSchema,
      text: chatMessageSchema,
      palette: generatedPaletteSchema,
    }),
    output: chatStateSchema,
  },
  chatGet: { input: z.strictObject({}), output: chatStateSchema },
  chatStop: { input: sessionIdInput, output: chatStateSchema },
  chatEnd: {
    input: sessionIdInput,
    output: z.strictObject({ kind: z.literal("none") }),
  },
  chatPing: { input: sessionIdInput, output: z.strictObject({}) },
};
export const generationInputSchema = z.strictObject({
  requestId: idSchema,
  selection: selectionSchema,
  accent: accentSchema.nullable(),
  description: descriptionSchema.nullable().default(null),
});
export const generationResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("running") }),
  z.strictObject({ kind: z.literal("ready"), palette: generatedPaletteSchema }),
  z.strictObject({ kind: z.literal("cancelled") }),
  z.strictObject({ kind: z.literal("failed"), message: z.string() }),
]);
export const generationMethods = {
  getGenerationSelection: {
    input: z.strictObject({}),
    output: selectionSchema.nullable(),
  },
  startGeneration: {
    input: generationInputSchema,
    output: generationResultSchema,
  },
  getGeneration: {
    input: z.strictObject({ requestId: idSchema }),
    output: generationResultSchema,
  },
  cancelGeneration: {
    input: z.strictObject({ requestId: idSchema }),
    output: z.strictObject({}),
  },
};
export type GenerationSelection = z.infer<typeof selectionSchema>;
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type GeneratedPalette = z.infer<typeof generatedPaletteSchema>;
/** One chat line as stored and rendered. */
export type ChatTurn = z.infer<typeof chatTurnSchema>;
/** Chat state returned by every chat RPC. */
export type ChatState = z.infer<typeof chatStateSchema>;
/** Validated input of the first chat message. */
export type ChatStartInput = z.infer<typeof chatMethods.chatStart.input>;
/** Validated input of a follow-up chat message. */
export type ChatSendInput = z.infer<typeof chatMethods.chatSend.input>;
