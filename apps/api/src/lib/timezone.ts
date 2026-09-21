// Reads the UTC offset (in minutes, e.g. -180 for Buenos Aires) that
// `timeZone` observes at `date` — DST-aware since it asks Intl for the
// offset at that specific instant rather than a fixed constant.
function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(raw);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

// Inverse of formatting a Date in a timezone (ai.context.ts's
// formatIsoWithOffset): given a calendar date + local wall-clock time in
// `timeZone`, returns the UTC instant. Used for task defaults (F13:
// "tareas solo con fecha → 09:00 locales del día de vencimiento").
//
// One pass at the DST offset (computed from a first guess that treats the
// wall-clock value as if it were already UTC) — off by the DST delta only
// for times that fall inside a transition's ambiguous/skipped window,
// which doesn't matter at reminder-scheduling precision.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!, 0);
  const offset = offsetMinutesAt(new Date(guess), timeZone);
  return new Date(guess - offset * 60_000);
}

// "HH:MM" wall-clock time of `date` in `timeZone` — used for quiet-hours
// and daily-summary-time comparisons (F16).
export function localTimeHHMM(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

// "YYYY-MM-DD" calendar date of `date` in `timeZone` — used as the day
// component of once-a-day dedupe keys (overdue_task, daily_summary).
export function localDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

// True when `time` ("HH:MM") falls inside the [start, end) quiet-hours
// window, which may wrap past midnight (the default 22:00–07:00).
export function isWithinQuietHours(time: string, start: string, end: string): boolean {
  if (start <= end) return time >= start && time < end;
  return time >= start || time < end;
}
