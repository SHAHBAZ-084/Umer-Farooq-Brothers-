import { ScheduleFrequency } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { advanceScheduleDate } from './schedules.service';

describe('advanceScheduleDate', () => {
  it('advances hourly / daily / weekly', () => {
    const start = new Date('2026-09-13T10:00:00.000Z');
    expect(advanceScheduleDate(start, ScheduleFrequency.HOURLY).toISOString()).toBe(
      '2026-09-13T11:00:00.000Z',
    );
    expect(advanceScheduleDate(start, ScheduleFrequency.DAILY).toISOString()).toBe(
      '2026-09-14T10:00:00.000Z',
    );
    expect(advanceScheduleDate(start, ScheduleFrequency.WEEKLY).toISOString()).toBe(
      '2026-09-20T10:00:00.000Z',
    );
  });

  it('advances monthly and yearly', () => {
    const start = new Date('2026-01-31T08:00:00.000Z');
    const month = advanceScheduleDate(start, ScheduleFrequency.MONTHLY);
    expect(month.getUTCFullYear()).toBe(2026);
    expect(month.getUTCMonth()).toBe(2); // March (JS Date rolls Jan 31 + 1 month)
    const year = advanceScheduleDate(start, ScheduleFrequency.YEARLY);
    expect(year.toISOString()).toBe('2027-01-31T08:00:00.000Z');
  });
});
