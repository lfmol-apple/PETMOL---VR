import { describe, expect, it } from 'vitest';
import { filterParams } from './analyticsApi';

describe('filterParams', () => {
  it('drops empty / undefined values so the URL never carries fake filters', () => {
    expect(filterParams({ period_days: 30, platform: '', state: 'MG' })).toEqual({
      period_days: 30, platform: '', app_version: undefined, os: undefined, state: 'MG', city: undefined,
    });
  });

  it('passes period_days through untouched (including undefined = "all time")', () => {
    expect(filterParams({}).period_days).toBeUndefined();
    expect(filterParams({ period_days: 7 }).period_days).toBe(7);
  });
});
