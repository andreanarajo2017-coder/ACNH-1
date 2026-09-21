import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LlmProviderError, LlmTimeoutError, LlmValidationError } from './provider.js';
import type {
  GenerateStructuredRequest,
  GenerateStructuredResult,
  LlmProvider,
} from './provider.js';

// D-04: the adapter against Anthropic's API, using structured outputs
// (`output_config.format`) so the response is guaranteed-parseable JSON —
// the model never has "instructions" of its own beyond `system`; the
// caller's `messages` are always plain user/assistant turns (8.1).
export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;

  constructor(
    apiKey: string,
    // Sonnet 5, not Opus: this is a bounded structured-extraction task
    // (section 8), not open-ended reasoning — cost/latency (10.1: p95 < 5s)
    // matter more here. Configurable; see docs/decisions.md (Q-02 is still
    // open on provider/budget).
    private model = 'claude-sonnet-5',
  ) {
    // 8.1: "1 reintento ante timeout/5xx" — the SDK already retries
    // 408/409/429/5xx and network errors; the repair-on-invalid-output
    // retry below is a separate, additional attempt.
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
  }

  async generateStructured<T>(
    req: GenerateStructuredRequest<T>,
  ): Promise<GenerateStructuredResult<T>> {
    const jsonSchema = zodToJsonSchema(req.schema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
    delete jsonSchema.$schema;

    const request = {
      model: this.model,
      max_tokens: req.maxOutputTokens,
      system: req.system,
      messages: req.messages,
      output_config: { format: { type: 'json_schema' as const, schema: jsonSchema } },
    };

    let response;
    try {
      response = await this.client.messages.create(request, { timeout: req.timeoutMs });
    } catch (err) {
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        throw new LlmTimeoutError();
      }
      throw new LlmProviderError(err instanceof Error ? err.message : String(err));
    }

    let parsed = this.tryParse(response, req);
    if (!parsed.success) {
      // 8.1: one repair attempt, feeding the validation error back.
      const repairRequest = {
        ...request,
        messages: [
          ...req.messages,
          { role: 'assistant' as const, content: this.textOf(response) },
          {
            role: 'user' as const,
            content: `Tu respuesta anterior no cumplió el schema requerido: ${parsed.error}. Respondé de nuevo con JSON que sí valide contra el schema, nada más.`,
          },
        ],
      };
      let repairResponse;
      try {
        repairResponse = await this.client.messages.create(repairRequest, {
          timeout: req.timeoutMs,
        });
      } catch (err) {
        if (err instanceof Anthropic.APIConnectionTimeoutError) throw new LlmTimeoutError();
        throw new LlmProviderError(err instanceof Error ? err.message : String(err));
      }
      parsed = this.tryParse(repairResponse, req);
      if (!parsed.success) throw new LlmValidationError(parsed.error);
      response = repairResponse;
    }

    return {
      data: parsed.data,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }

  private textOf(response: Anthropic.Message): string {
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return textBlock?.text ?? '';
  }

  private tryParse<T>(
    response: Anthropic.Message,
    req: GenerateStructuredRequest<T>,
  ): { success: true; data: T } | { success: false; error: string } {
    const text = this.textOf(response);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { success: false, error: 'response text is not valid JSON' };
    }
    const result = req.schema.safeParse(raw);
    if (!result.success) return { success: false, error: result.error.message };
    return { success: true, data: result.data };
  }
}
