// Answer length and tone, picked by the user in Settings.
// Used by both the API route (prompt text) and the page (option labels),
// so keep this file free of server-only code.

export type AnswerLength = "short" | "medium" | "detailed";
export type Tone = "simple" | "technical" | "fun";

type Option = { label: string; hint: string; prompt: string };

export const LENGTHS: Record<AnswerLength, Option & { maxTokens: number }> = {
  short: {
    label: "Short",
    hint: "One crisp line per field",
    prompt: "Keep every field to one short sentence.",
    maxTokens: 500,
  },
  medium: {
    label: "Medium",
    hint: "A sentence or two",
    prompt: "Keep every field to one or two sentences.",
    maxTokens: 800,
  },
  detailed: {
    label: "Detailed",
    hint: "Specifics, names and numbers",
    prompt: "Give every field two to four sentences with concrete specifics: names, numbers, examples.",
    maxTokens: 1300,
  },
};

export const TONES: Record<Tone, Option> = {
  simple: {
    label: "Simple",
    hint: "Plain words, no jargon",
    prompt: "Use plain, everyday language a non-expert understands. Avoid jargon.",
  },
  technical: {
    label: "Technical",
    hint: "Precise, names tools and methods",
    prompt: "Use precise, technical language and name specific tools, methods and metrics.",
  },
  fun: {
    label: "Fun",
    hint: "Playful, but still useful",
    prompt: "Write with playful energy and a little wit, but keep every point concrete and useful.",
  },
};

export const LENGTH_KEYS = Object.keys(LENGTHS) as AnswerLength[];
export const TONE_KEYS = Object.keys(TONES) as Tone[];

export function isLength(value: unknown): value is AnswerLength {
  return typeof value === "string" && value in LENGTHS;
}

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && value in TONES;
}

// One line added to every prompt so outputs match the user's settings.
export function styleInstruction(length: AnswerLength, tone: Tone) {
  return `Writing style: ${LENGTHS[length].prompt} ${TONES[tone].prompt}`;
}
