const WEEKDAYS_ES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

export interface AiContextPerson {
  id: string;
  name: string;
  aliases: string[];
  relationship: string;
}

export interface AiContextCategory {
  id: string;
  name: string;
}

export interface AiContextDay {
  date: string; // YYYY-MM-DD
  weekday: string; // Spanish, lowercase
}

// 8.2: the minimum context sent to the model — no tasks, events, or other
// data that doesn't help interpret the capture (R-13's "ninguna respuesta
// de IA incluye datos de otro usuario" also means it never includes data
// the *current* user doesn't need for this).
export interface AiContext {
  now: string; // ISO with offset, in the user's timezone
  timezone: string;
  locale: string;
  upcoming_days: AiContextDay[];
  people: AiContextPerson[];
  categories: AiContextCategory[];
  shopping_lists: string[]; // P1 — always empty until M9.
}

// Renders `date` (a JS Date instant) as an ISO string with the *offset* of
// `timeZone`, not "Z" — Node's Date has no timezone concept of its own, so
// this reads the offset back out via Intl.
export function formatIsoWithOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const offset = get('timeZoneName').replace('GMT', '') || '+00:00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset}`;
}

// Calendar-only (Y-M-D) representation of `date` in `timeZone` — used for
// the 14-day table, where only the calendar day and its weekday matter,
// not the instant.
function localDateParts(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [y, m, d] = formatted.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

export function buildAiContext(params: {
  now: Date;
  timezone: string;
  locale: string;
  people: AiContextPerson[];
  categories: AiContextCategory[];
}): AiContext {
  const { y, m, d } = localDateParts(params.now, params.timezone);
  const anchor = new Date(Date.UTC(y, m - 1, d));

  const upcoming_days: AiContextDay[] = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(anchor);
    day.setUTCDate(day.getUTCDate() + i);
    upcoming_days.push({
      date: day.toISOString().slice(0, 10),
      weekday: WEEKDAYS_ES[day.getUTCDay()]!,
    });
  }

  return {
    now: formatIsoWithOffset(params.now, params.timezone),
    timezone: params.timezone,
    locale: params.locale,
    upcoming_days,
    // 8.2: máx. 50 personas.
    people: params.people.slice(0, 50),
    categories: params.categories,
    shopping_lists: [],
  };
}
