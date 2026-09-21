import { z } from 'zod';
import { relationshipSchema } from '../people/people.schemas.js';
import { prioritySchema } from '../tasks/tasks.schemas.js';

// --- Section 8.3: the raw shape the LLM (real or fake) produces. ---
// R-01: the LLM never decides a required field is "fine to skip" — it
// reports what it could and couldn't determine via missing_fields, but it's
// the backend (ai.validation.ts) that turns that into a blocking
// Clarification and that re-derives missing_fields itself rather than
// trusting the LLM's self-report (8.4.2).

export const llmItemKindSchema = z.enum(['event', 'task', 'shopping_item']);

export const llmRelationTypeSchema = z.enum(['after', 'before', 'related']);

// A handful of sentinel field names the backend knows how to turn into a
// Clarification question (ai.validation.ts's CLARIFICATION_TEMPLATES).
export const missingFieldSchema = z.enum(['title', 'date', 'start_time', 'which_day']);

export const llmParsedItemSchema = z.object({
  ref: z.string().min(1).max(10),
  kind: llmItemKindSchema,
  title: z.string().max(200).default(''),
  // event
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  all_day: z.boolean().optional(),
  // Doubles as a scratch "date known, time still pending" slot for a
  // non-all-day event — see ai.validation.ts's applyAnswer for why this
  // never reaches the domain `events` table in that shape.
  start_date: z.string().optional(),
  // task (due_date XOR due_at)
  due_date: z.string().optional(),
  due_at: z.string().optional(),
  estimated_minutes: z.number().int().positive().max(1440).optional(),
  // shopping_item (P1 — see ADR)
  list_hint: z.string().max(100).optional(),
  quantity: z.string().max(50).optional(),
  // common
  person_id: z.string().optional(),
  person_name_unresolved: z.string().max(100).optional(),
  category_id: z.string().optional(),
  location_text: z.string().max(200).optional(),
  priority: prioritySchema.optional(),
  recurrence_rule: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  missing_fields: z.array(z.string()).default([]),
  inferred_fields: z.array(z.string()).default([]),
  flags: z.array(z.enum(['in_past'])).default([]),
  source_span: z.string().max(500).optional(),
});
export type LlmParsedItem = z.infer<typeof llmParsedItemSchema>;

export const llmRelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: llmRelationTypeSchema,
});
export type LlmRelation = z.infer<typeof llmRelationSchema>;

// What generateStructured() is asked to produce (8.4.1: "esquema Zod
// estricto — rechaza o descarta campos desconocidos"; unknown top-level
// keys are dropped by not using .passthrough(), unknown item fields too).
export const llmRawOutputSchema = z.object({
  items: z.array(llmParsedItemSchema).max(10),
  relations: z.array(llmRelationSchema).default([]),
});
export type LlmRawOutput = z.infer<typeof llmRawOutputSchema>;

// --- Section 8.3: client-facing contract. ---

export const clarificationSchema = z.object({
  id: z.string(),
  item_ref: z.string(),
  field: z.string(),
  question: z.string(),
  answer_type: z.enum(['time', 'date', 'choice', 'text']),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});
export type Clarification = z.infer<typeof clarificationSchema>;

// The client-facing shape is the same as the raw LLM output shape — the
// backend only ever adds/removes items from missing_fields, it doesn't
// change the item's structure.
export const parsedItemSchema = llmParsedItemSchema;
export type ParsedItem = LlmParsedItem;

export const parseStatusSchema = z.enum([
  'ready',
  'needs_clarification',
  'no_actionable_items',
  'error',
]);

export const parseResponseSchema = z.object({
  parse_id: z.string().uuid(),
  status: parseStatusSchema,
  items: z.array(parsedItemSchema),
  relations: z.array(llmRelationSchema),
  clarifications: z.array(clarificationSchema),
  suggestions: z.array(z.unknown()), // P1 — never populated in M4/M5.
  expires_at: z.string(),
});
export type ParseResponse = z.infer<typeof parseResponseSchema>;

export const parseAnswerSchema = z.object({
  clarification_id: z.string(),
  value: z.string().min(1).max(200),
});

export const parseRequestBodySchema = z
  .object({
    text: z.string().min(1).max(1000).optional(),
    parse_id: z.string().uuid().optional(),
    answers: z.array(parseAnswerSchema).optional(),
    captured_at: z.string().datetime({ offset: true }).optional(),
    inbox_item_id: z.string().uuid().optional(),
  })
  .refine((body) => body.text != null || (body.parse_id != null && body.answers != null), {
    message: 'Provide text for a new parse, or parse_id + answers to continue one.',
  });
export type ParseRequestBody = z.infer<typeof parseRequestBodySchema>;

export const parseIdParamsSchema = z.object({ parse_id: z.string().uuid() });

export const commitBodySchema = z.object({
  items: z.array(parsedItemSchema).min(1).max(10),
  relations: z.array(llmRelationSchema).default([]),
  create_people: z
    .array(z.object({ name: z.string().min(1).max(100), relationship: relationshipSchema }))
    .optional(),
  create_shopping_lists: z.array(z.object({ name: z.string().min(1).max(100) })).optional(),
  inbox_item_id: z.string().uuid().optional(),
});
export type CommitBody = z.infer<typeof commitBodySchema>;

export const commitResponseSchema = z.object({
  parse_id: z.string().uuid(),
  created: z.object({
    tasks: z.array(z.object({ ref: z.string(), id: z.string().uuid() })),
    events: z.array(z.object({ ref: z.string(), id: z.string().uuid() })),
    people: z.array(z.object({ name: z.string(), id: z.string().uuid() })),
  }),
  relations_created: z.number(),
});
export type CommitResponse = z.infer<typeof commitResponseSchema>;
