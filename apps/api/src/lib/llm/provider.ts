import type { z } from 'zod';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateStructuredRequest<T> {
  system: string;
  messages: LlmMessage[];
  // `Input = any` (not defaulted to `T`) so TS infers `T` from the schema's
  // *output* type at call sites — zod schemas with `.default()` fields have
  // an Input narrower than Output, and the default `ZodType<T>` (Input = T)
  // would otherwise make inference pick the input shape instead.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  timeoutMs: number;
  maxOutputTokens: number;
}

export interface GenerateStructuredResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

/**
 * D-04: interface decoupled from any concrete LLM — AiService only depends
 * on this, so swapping providers never touches it. `schema` doubles as the
 * spec's "JSON Schema" contract (8.1): a provider with real structured
 * output derives a JSON Schema from it (see AnthropicProvider);
 * FakeProvider ignores it and replays a fixture. Using a Zod schema
 * directly — instead of a raw JSON Schema object — matches this codebase's
 * Zod-everywhere convention (D-02) and lets the caller get back validated,
 * typed data instead of `unknown`.
 */
export interface LlmProvider {
  generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<GenerateStructuredResult<T>>;
}

export class LlmTimeoutError extends Error {
  constructor(message = 'LLM request timed out.') {
    super(message);
    this.name = 'LlmTimeoutError';
  }
}

export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

// The provider produced a response, but it didn't validate against the
// requested schema even after the one repair attempt (8.1).
export class LlmValidationError extends Error {
  constructor(message = 'LLM output did not validate against the schema.') {
    super(message);
    this.name = 'LlmValidationError';
  }
}
