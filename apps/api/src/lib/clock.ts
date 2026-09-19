/**
 * D-16: all time-dependent logic goes through an injectable Clock instead of
 * calling `Date.now()`/`new Date()` directly, so tests can control "now".
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  set(date: Date): void {
    this.current = date;
  }
}
