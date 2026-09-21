import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AiContext } from '../../modules/ai/ai.context.js';
import { LlmProviderError } from './provider.js';
import type {
  GenerateStructuredRequest,
  GenerateStructuredResult,
  LlmProvider,
} from './provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../../test/fixtures/ai-parse');

interface Fixture {
  id: string;
  input: string;
  output: unknown;
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(FIXTURES_DIR, f), 'utf8')) as Fixture);
}

// Every `person_id` a fixture wants resolved is written as "$person:<name>"
// (a real id can't be hardcoded — it doesn't exist until the test creates
// that person). Resolved against the context block the system prompt
// embeds (see ai.prompt.ts) — the same context a real model would read.
function resolvePersonTokens(value: unknown, context: AiContext): unknown {
  if (typeof value === 'string' && value.startsWith('$person:')) {
    const name = value.slice('$person:'.length);
    const match = context.people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      throw new LlmProviderError(`FakeProvider: fixture references unknown person "${name}".`);
    }
    return match.id;
  }
  if (Array.isArray(value)) return value.map((v) => resolvePersonTokens(v, context));
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolvePersonTokens(v, context)]),
    );
  }
  return value;
}

function extractContext(system: string): AiContext {
  const match = system.match(/<context>([\s\S]*?)<\/context>/);
  if (!match) throw new LlmProviderError('FakeProvider: system prompt has no <context> block.');
  return JSON.parse(match[1]!) as AiContext;
}

/**
 * Deterministic, fixture-driven stand-in for a real LLM (8.1) — used in all
 * CI tests. Matches the last user message against
 * `test/fixtures/ai-parse/*.json` (G-01..G-14) by exact text and replays
 * its canned `output`, resolving `$person:<name>` tokens against the
 * context the caller embedded in the system prompt.
 */
export class FakeProvider implements LlmProvider {
  private fixtures = loadFixtures();

  async generateStructured<T>(
    req: GenerateStructuredRequest<T>,
  ): Promise<GenerateStructuredResult<T>> {
    const lastUserMessage = [...req.messages].reverse().find((m) => m.role === 'user');
    const text = lastUserMessage?.content.trim();
    const fixture = this.fixtures.find((f) => f.input.trim() === text);
    if (!fixture) {
      throw new LlmProviderError(
        `FakeProvider has no fixture for input: ${JSON.stringify(text)}. Add one to test/fixtures/ai-parse/.`,
      );
    }

    const context = extractContext(req.system);
    const resolved = resolvePersonTokens(fixture.output, context);
    const parsed = req.schema.safeParse(resolved);
    if (!parsed.success) {
      throw new LlmProviderError(
        `FakeProvider fixture ${fixture.id} does not match the requested schema: ${parsed.error.message}`,
      );
    }

    return {
      data: parsed.data,
      usage: {
        inputTokens: text?.length ?? 0,
        outputTokens: JSON.stringify(fixture.output).length,
      },
      model: 'fake-provider',
    };
  }
}
