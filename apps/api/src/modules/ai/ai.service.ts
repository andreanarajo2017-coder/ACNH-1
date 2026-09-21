import { and, eq, isNull } from 'drizzle-orm';
import type { AiRateLimiter } from '../../lib/ai-rate-limiter.js';
import type { Clock } from '../../lib/clock.js';
import type { Db } from '../../db/client.js';
import {
  aiInteractions,
  categories,
  events,
  inboxItems,
  itemRelations,
  people,
  tasks,
  users,
} from '../../db/schema.js';
import { ApiError, NotFoundError, ValidationError } from '../../lib/errors.js';
import type { LlmProvider } from '../../lib/llm/provider.js';
import { LlmProviderError, LlmTimeoutError, LlmValidationError } from '../../lib/llm/provider.js';
import { buildAiContext, type AiContext } from './ai.context.js';
import { buildSystemPrompt } from './ai.prompt.js';
import {
  llmRawOutputSchema,
  type Clarification,
  type CommitBody,
  type CommitResponse,
  type LlmParsedItem,
  type LlmRelation,
  type ParseRequestBody,
  type ParseResponse,
} from './ai.schemas.js';
import {
  applyAnswer,
  buildClarifications,
  normalizeItem,
  relationsAmong,
} from './ai.validation.js';
import { createEventBodySchema } from '../events/events.schemas.js';
import { createPersonBodySchema } from '../people/people.schemas.js';
import { createTaskBodySchema } from '../tasks/tasks.schemas.js';

const PARSE_TIMEOUT_MS = 15_000;
const PARSE_MAX_OUTPUT_TOKENS = 2000;
const PARSE_TTL_MS = 30 * 60 * 1000;

interface StoredInteraction {
  referenceNow: string; // ISO with offset — the "now" items were resolved against (R-04).
  items: LlmParsedItem[];
  relations: LlmRelation[];
  clarifications: Clarification[];
  committed?: CommitResponse;
}

function computeStatus(
  items: LlmParsedItem[],
): 'ready' | 'needs_clarification' | 'no_actionable_items' {
  if (items.length === 0) return 'no_actionable_items';
  if (items.some((item) => item.missing_fields.length > 0)) return 'needs_clarification';
  return 'ready';
}

export class AiService {
  constructor(
    private db: Db,
    private clock: Clock,
    private llmProvider: LlmProvider,
    private providerName: string,
    private rateLimiter: AiRateLimiter,
  ) {}

  async parse(userId: string, body: ParseRequestBody): Promise<ParseResponse> {
    if (body.text != null) {
      return this.parseNew(userId, body.text, body.captured_at);
    }
    return this.continueParse(userId, body.parse_id!, body.answers!);
  }

  private async parseNew(
    userId: string,
    text: string,
    capturedAt?: string,
  ): Promise<ParseResponse> {
    await this.rateLimiter.check(userId);

    const referenceNow = capturedAt ? new Date(capturedAt) : this.clock.now();
    const context = await this.buildContext(userId, referenceNow);
    const system = buildSystemPrompt(context);

    const start = Date.now();
    let items: LlmParsedItem[] = [];
    let relations: LlmRelation[] = [];
    let status: 'ready' | 'needs_clarification' | 'no_actionable_items' | 'error' = 'error';
    let model = this.providerName;
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;

    try {
      const result = await this.llmProvider.generateStructured({
        system,
        messages: [{ role: 'user', content: text }],
        schema: llmRawOutputSchema,
        timeoutMs: PARSE_TIMEOUT_MS,
        maxOutputTokens: PARSE_MAX_OUTPUT_TOKENS,
      });
      model = result.model;
      tokensIn = result.usage.inputTokens;
      tokensOut = result.usage.outputTokens;

      items = result.data.items.map((item) => normalizeItem(item, referenceNow));
      const refs = new Set(items.map((item) => item.ref));
      relations = relationsAmong(result.data.relations, refs);
      status = computeStatus(items);
    } catch (err) {
      if (
        err instanceof LlmTimeoutError ||
        err instanceof LlmProviderError ||
        err instanceof LlmValidationError
      ) {
        status = 'error';
      } else {
        throw err;
      }
    }

    const clarifications = items.flatMap((item) => buildClarifications(item));
    const latencyMs = Date.now() - start;
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + PARSE_TTL_MS);

    const stored: StoredInteraction = {
      referenceNow: context.now,
      items,
      relations,
      clarifications,
    };

    const [row] = await this.db
      .insert(aiInteractions)
      .values({
        userId,
        inputText: text,
        outputJson: stored,
        status,
        provider: this.providerName,
        model,
        latencyMs,
        tokensIn,
        tokensOut,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.toParseResponse(row!.id, status, stored, expiresAt);
  }

  private async continueParse(
    userId: string,
    parseId: string,
    answers: { clarification_id: string; value: string }[],
  ): Promise<ParseResponse> {
    const row = await this.findOwnedInteraction(userId, parseId);
    const now = this.clock.now();
    if (row.expiresAt < now) {
      throw new ApiError(422, 'parse_expired', 'This parse has expired; start a new capture.');
    }
    if (row.status === 'committed') {
      throw new ApiError(409, 'already_committed', 'This parse was already committed.');
    }

    const stored = row.outputJson as StoredInteraction;
    const context = { now: stored.referenceNow } as AiContext;

    let items = stored.items;
    for (const answer of answers) {
      const clarification = stored.clarifications.find((c) => c.id === answer.clarification_id);
      if (!clarification) {
        throw new ValidationError(`Unknown clarification_id: ${answer.clarification_id}`);
      }
      items = items.map((item) =>
        item.ref === clarification.item_ref
          ? applyAnswer(item, clarification, answer.value, context)
          : item,
      );
    }
    items = items.map((item) => normalizeItem(item, new Date(stored.referenceNow)));
    const refs = new Set(items.map((item) => item.ref));
    const relations = relationsAmong(stored.relations, refs);
    const status = computeStatus(items);
    const clarifications = items.flatMap((item) => buildClarifications(item));

    const nextStored: StoredInteraction = { ...stored, items, relations, clarifications };

    await this.db
      .update(aiInteractions)
      .set({ outputJson: nextStored, status, updatedAt: now })
      .where(eq(aiInteractions.id, parseId));

    return this.toParseResponse(parseId, status, nextStored, row.expiresAt);
  }

  async commit(userId: string, parseId: string, body: CommitBody): Promise<CommitResponse> {
    const row = await this.findOwnedInteraction(userId, parseId);
    const now = this.clock.now();

    if (row.status === 'committed') {
      const stored = row.outputJson as StoredInteraction;
      if (!stored.committed) {
        throw new ApiError(
          500,
          'internal_error',
          'Interaction marked committed with no stored result.',
        );
      }
      return stored.committed; // AC-F04-07: idempotent replay, no new rows.
    }
    if (row.expiresAt < now) {
      throw new ApiError(422, 'parse_expired', 'This parse has expired; start a new capture.');
    }
    if (body.items.some((item) => item.kind === 'shopping_item')) {
      // F09 (listas de compras) is P1/M9 — no shopping_lists/shopping_items
      // table exists yet. See docs/decisions.md.
      throw new ApiError(
        422,
        'shopping_lists_not_available',
        'Shopping items cannot be committed yet (P1, M9).',
      );
    }
    const blocked = body.items.filter((item) => item.missing_fields.length > 0);
    if (blocked.length > 0) {
      throw new ApiError(
        422,
        'unresolved_clarifications',
        `Items with unresolved clarifications cannot be committed: ${blocked.map((i) => i.ref).join(', ')}`,
      );
    }

    const result = await this.db.transaction(async (tx) => {
      const createdPeople: { ref: string; id: string; name: string }[] = [];
      const nameToPersonId = new Map<string, string>();

      for (const draft of body.create_people ?? []) {
        const personBody = createPersonBodySchema.parse({
          name: draft.name,
          relationship: draft.relationship,
        });
        const [personRow] = await tx
          .insert(people)
          .values({
            userId,
            name: personBody.name,
            relationship: personBody.relationship,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        nameToPersonId.set(personBody.name.trim().toLowerCase(), personRow!.id);
        createdPeople.push({ ref: draft.name, id: personRow!.id, name: personBody.name });
      }

      const ownedPersonIds = new Set(
        (
          await tx
            .select({ id: people.id })
            .from(people)
            .where(and(eq(people.userId, userId), isNull(people.deletedAt)))
        ).map((r) => r.id),
      );
      const ownedCategoryIds = new Set(
        (
          await tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.userId, userId))
        ).map((r) => r.id),
      );

      const refToId = new Map<string, { type: 'task' | 'event'; id: string }>();
      const createdTasks: { ref: string; id: string }[] = [];
      const createdEvents: { ref: string; id: string }[] = [];

      for (const item of body.items) {
        const personId = this.resolvePersonId(item, ownedPersonIds, nameToPersonId);
        const categoryId =
          item.category_id && ownedCategoryIds.has(item.category_id) ? item.category_id : undefined;

        if (item.kind === 'task') {
          const taskBody = createTaskBodySchema.parse({
            title: item.title,
            description: item.notes,
            priority: item.priority,
            category_id: categoryId,
            person_id: personId,
            location_text: item.location_text,
            due_date: item.due_date,
            due_at: item.due_at,
            estimated_minutes: item.estimated_minutes,
            recurrence_rule: item.recurrence_rule,
          });
          const [taskRow] = await tx
            .insert(tasks)
            .values({
              userId,
              title: taskBody.title,
              description: taskBody.description ?? null,
              ...(taskBody.priority ? { priority: taskBody.priority } : {}),
              categoryId: taskBody.category_id ?? null,
              personId: taskBody.person_id ?? null,
              locationText: taskBody.location_text ?? null,
              dueDate: taskBody.due_date ?? null,
              dueAt: taskBody.due_at ? new Date(taskBody.due_at) : null,
              estimatedMinutes: taskBody.estimated_minutes ?? null,
              recurrenceRule: taskBody.recurrence_rule ?? null,
              source: 'ai',
              aiInteractionId: parseId,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          refToId.set(item.ref, { type: 'task', id: taskRow!.id });
          createdTasks.push({ ref: item.ref, id: taskRow!.id });
        } else {
          const eventBody = createEventBodySchema.parse({
            title: item.title,
            all_day: item.all_day,
            start_at: item.start_at,
            end_at: item.end_at,
            start_date: item.start_date,
            location_text: item.location_text,
            person_id: personId,
            category_id: categoryId,
            recurrence_rule: item.recurrence_rule,
          });
          const [eventRow] = await tx
            .insert(events)
            .values({
              userId,
              title: eventBody.title,
              allDay: eventBody.all_day ?? false,
              startAt: eventBody.all_day
                ? null
                : eventBody.start_at
                  ? new Date(eventBody.start_at)
                  : null,
              endAt: eventBody.end_at ? new Date(eventBody.end_at) : null,
              startDate: eventBody.all_day ? (eventBody.start_date ?? null) : null,
              locationText: eventBody.location_text ?? null,
              personId: eventBody.person_id ?? null,
              categoryId: eventBody.category_id ?? null,
              recurrenceRule: eventBody.recurrence_rule ?? null,
              source: 'app',
              aiInteractionId: parseId,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          refToId.set(item.ref, { type: 'event', id: eventRow!.id });
          createdEvents.push({ ref: item.ref, id: eventRow!.id });
        }
      }

      let relationsCreated = 0;
      for (const relation of body.relations) {
        const from = refToId.get(relation.from);
        const to = refToId.get(relation.to);
        if (!from || !to) continue; // dropped item (e.g. shopping_item) or unknown ref.
        await tx.insert(itemRelations).values({
          userId,
          fromType: from.type,
          fromId: from.id,
          toType: to.type,
          toId: to.id,
          relationType: relation.type,
          createdAt: now,
          updatedAt: now,
        });
        relationsCreated++;
      }

      if (body.inbox_item_id) {
        await tx
          .update(inboxItems)
          .set({ status: 'processed', aiInteractionId: parseId, updatedAt: now })
          .where(
            and(
              eq(inboxItems.id, body.inbox_item_id),
              eq(inboxItems.userId, userId),
              isNull(inboxItems.deletedAt),
            ),
          );
      }

      const commitResponse: CommitResponse = {
        parse_id: parseId,
        created: {
          tasks: createdTasks,
          events: createdEvents,
          people: createdPeople.map(({ id, name }) => ({ id, name })),
        },
        relations_created: relationsCreated,
      };

      const stored = row.outputJson as StoredInteraction;
      await tx
        .update(aiInteractions)
        .set({
          status: 'committed',
          outputJson: { ...stored, committed: commitResponse },
          updatedAt: now,
        })
        .where(eq(aiInteractions.id, parseId));

      return commitResponse;
    });

    return result;
  }

  private resolvePersonId(
    item: LlmParsedItem,
    ownedPersonIds: Set<string>,
    nameToPersonId: Map<string, string>,
  ): string | undefined {
    if (item.person_id && ownedPersonIds.has(item.person_id)) return item.person_id;
    if (item.person_name_unresolved) {
      return nameToPersonId.get(item.person_name_unresolved.trim().toLowerCase());
    }
    return undefined;
  }

  private async buildContext(userId: string, now: Date): Promise<AiContext> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const peopleRows = await this.db
      .select({
        id: people.id,
        name: people.name,
        aliases: people.aliases,
        relationship: people.relationship,
      })
      .from(people)
      .where(and(eq(people.userId, userId), isNull(people.deletedAt)));
    const categoryRows = await this.db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId));

    return buildAiContext({
      now,
      timezone: user?.timezone ?? 'America/Argentina/Buenos_Aires',
      locale: user?.locale ?? 'es-AR',
      people: peopleRows,
      categories: categoryRows,
    });
  }

  private async findOwnedInteraction(userId: string, parseId: string) {
    const rows = await this.db
      .select()
      .from(aiInteractions)
      .where(and(eq(aiInteractions.id, parseId), eq(aiInteractions.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('Parse not found.');
    return row;
  }

  private toParseResponse(
    parseId: string,
    status: 'ready' | 'needs_clarification' | 'no_actionable_items' | 'error',
    stored: StoredInteraction,
    expiresAt: Date,
  ): ParseResponse {
    return {
      parse_id: parseId,
      status,
      items: stored.items,
      relations: stored.relations,
      clarifications: stored.clarifications,
      suggestions: [],
      expires_at: expiresAt.toISOString(),
    };
  }
}
