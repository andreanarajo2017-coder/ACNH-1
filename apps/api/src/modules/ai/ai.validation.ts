import { randomUUID } from 'node:crypto';
import type { AiContext } from './ai.context.js';
import type { Clarification, LlmParsedItem, LlmRelation, ParsedItem } from './ai.schemas.js';

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// 8.4.6: strip control characters and anything that looks like an HTML tag;
// callers still enforce max lengths via the Zod schema.
export function sanitizeText<T extends string | undefined>(value: T): T {
  if (value == null) return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/<[^>]*>/g, '') as T;
}

function sanitizeItemText(item: LlmParsedItem): LlmParsedItem {
  return {
    ...item,
    title: sanitizeText(item.title),
    notes: sanitizeText(item.notes),
    location_text: sanitizeText(item.location_text),
    person_name_unresolved: sanitizeText(item.person_name_unresolved),
  };
}

// 8.4.3: RRULE valid within the supported subset — FREQ (required) +
// optional INTERVAL/BYDAY. Anything else (or a malformed rule) is dropped
// rather than blocking the whole item: a task without a recurrence is
// still useful; a task that can't be created at all isn't (R-02 still
// gates persistence — this only decides what survives to the preview).
const RRULE_PATTERN =
  /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=[1-9]\d*)?(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?$/;

export function normalizeRecurrenceRule(rule: string | undefined): string | undefined {
  if (rule == null) return undefined;
  return RRULE_PATTERN.test(rule) ? rule : undefined;
}

// 8.4.2 (R-01): the backend never trusts the LLM's missing_fields at face
// value — it re-derives what it can mechanically check itself (a required
// field is either present or it isn't) and takes the UNION with what the
// LLM reported. The union, not an override, because some gaps only the
// LLM's language understanding can detect — a "which_day" or "date"
// clarification means the date field is technically *present* (a
// placeholder the LLM filled in so the item stays a valid intermediate
// shape — see ai.prompt.ts's R-06 instructions) but not yet trustworthy.
export function deriveMissingFields(item: LlmParsedItem): string[] {
  const fields = new Set(item.missing_fields);
  if (!item.title || item.title.trim() === '') fields.add('title');

  if (item.kind === 'event') {
    const dateKnown = item.start_at != null || item.start_date != null;
    const timeOrAllDayKnown = item.start_at != null || item.all_day === true;
    if (!dateKnown) fields.add('date');
    else if (!timeOrAllDayKnown) fields.add('start_time');
  }

  return [...fields];
}

// 8.4.3/8.4.4: due_date XOR due_at, start_at <= end_at, past-date flagging.
// Business-rule violations are repaired defensively (drop the offending
// field) rather than failing the whole item — R-01 already guarantees
// nothing persists without the user reviewing the preview.
export function normalizeItem(item: LlmParsedItem, now: Date): LlmParsedItem {
  let next = sanitizeItemText(item);
  next.recurrence_rule = normalizeRecurrenceRule(next.recurrence_rule);

  if (next.due_date != null && next.due_at != null) {
    next = { ...next, due_date: undefined };
  }
  if (
    next.start_at != null &&
    next.end_at != null &&
    new Date(next.end_at) < new Date(next.start_at)
  ) {
    next = { ...next, end_at: undefined };
  }

  const missing_fields = deriveMissingFields(next);
  const flags = new Set(next.flags);
  // Only flag a resolved (not still-pending-clarification) date/time in the
  // past — a placeholder date behind a pending clarification isn't "the"
  // date yet, so it isn't a real in_past case.
  if (missing_fields.length === 0) {
    const instant = next.start_at ?? next.due_at;
    const dateOnly = next.start_date ?? next.due_date;
    const todayStr = now.toISOString().slice(0, 10);
    if (instant != null && new Date(instant) < now) flags.add('in_past');
    else if (dateOnly != null && dateOnly < todayStr) flags.add('in_past');
  }

  return { ...next, missing_fields, flags: [...flags] };
}

const CLARIFICATION_TEMPLATES: Record<
  string,
  { question: string; answer_type: Clarification['answer_type'] }
> = {
  title: { question: '¿Cuál es el título?', answer_type: 'text' },
  start_time: { question: '¿A qué hora es?', answer_type: 'time' },
  date: { question: '¿Qué día?', answer_type: 'date' },
};

function isoDatePart(iso: string): string {
  return iso.slice(0, 10);
}

function addDaysToIsoDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// R-06: "el lunes" said on a Monday, before it's decided whether that
// means today or next week — the LLM (see ai.prompt.ts) already resolved
// the *near* candidate (today) into the item's start_at/due_at as a
// placeholder; this builds the *far* candidate (+7 days, same time of
// day) so the user can pick between the two without either ever being
// invented silently.
function buildWhichDayClarification(item: LlmParsedItem): Clarification {
  const near = item.start_at ?? item.due_at;
  if (!near) {
    throw new Error('which_day clarification requires a placeholder start_at/due_at.');
  }
  const nearDateStr = isoDatePart(near);
  const farDateStr = addDaysToIsoDate(nearDateStr, 7);
  const farValue = farDateStr + near.slice(10);
  const farWeekday = WEEKDAYS_ES[new Date(farDateStr + 'T00:00:00Z').getUTCDay()];
  const [, month, day] = farDateStr.split('-');

  return {
    id: randomUUID(),
    item_ref: item.ref,
    field: 'which_day',
    question: `¿Hoy o el próximo ${farWeekday} ${day}/${month}?`,
    answer_type: 'choice',
    options: [
      { label: 'Hoy', value: near },
      { label: `El próximo ${farWeekday} ${day}/${month}`, value: farValue },
    ],
  };
}

export function buildClarifications(item: LlmParsedItem): Clarification[] {
  return item.missing_fields.map((field) => {
    if (field === 'which_day') return buildWhichDayClarification(item);
    const template = CLARIFICATION_TEMPLATES[field] ?? {
      question: `Falta un dato: ${field}`,
      answer_type: 'text' as const,
    };
    return {
      id: randomUUID(),
      item_ref: item.ref,
      field,
      question: template.question,
      answer_type: template.answer_type,
    };
  });
}

// Continuation (8.3's `answers`): apply one resolved clarification answer
// back onto its item. `which_day`/date-choice answers carry the full
// resolved value already (the option the user picked); `date`/`time`
// answers carry only the missing half and get combined with what the item
// already knew (see normalizeItem's placeholder convention above).
export function applyAnswer(
  item: LlmParsedItem,
  clarification: Clarification,
  value: string,
  context: AiContext,
): LlmParsedItem {
  const offset = context.now.slice(-6);
  const field = clarification.field;
  const targetField = item.kind === 'event' ? 'start_at' : 'due_at';
  let next = { ...item };

  if (clarification.answer_type === 'choice') {
    next = { ...next, [targetField]: value, start_date: undefined, due_date: undefined };
  } else if (field === 'start_time') {
    const dateStr = next.start_date ?? next.due_date;
    if (!dateStr)
      throw new Error(`Cannot apply a start_time answer: item ${item.ref} has no date.`);
    next = {
      ...next,
      [targetField]: `${dateStr}T${value}:00${offset}`,
      start_date: undefined,
      due_date: undefined,
    };
  } else if (field === 'date') {
    const placeholder = next.start_at ?? next.due_at;
    if (!placeholder)
      throw new Error(`Cannot apply a date answer: item ${item.ref} has no placeholder time.`);
    next = { ...next, [targetField]: value + placeholder.slice(10) };
  } else {
    next = { ...next, [field]: value } as LlmParsedItem;
  }

  return { ...next, missing_fields: next.missing_fields.filter((f) => f !== field) };
}

export function toClientItem(item: LlmParsedItem): ParsedItem {
  return item;
}

export function relationsAmong(relations: LlmRelation[], refs: Set<string>): LlmRelation[] {
  return relations.filter((r) => refs.has(r.from) && refs.has(r.to));
}
