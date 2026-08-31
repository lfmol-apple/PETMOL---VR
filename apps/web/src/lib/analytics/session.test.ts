import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('analytics session context', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('persiste anonymous_id em localStorage', async () => {
    const { getAnalyticsAnonymousId, analyticsAnonymousIdStorage } = await import('./session');
    const first = getAnalyticsAnonymousId();
    const second = getAnalyticsAnonymousId();
    expect(first).toBe(second);
    expect(analyticsAnonymousIdStorage).toBe('localStorage:petmol_analytics_anonymous_id');
    expect(localStorage.getItem('petmol_analytics_anonymous_id')).toBe(first);
  });

  it('reusa sessão ativa e cria nova após 30 minutos de inatividade', async () => {
    const { getAnalyticsSession, analyticsSessionDefinition } = await import('./session');
    const first = getAnalyticsSession(1_000);
    const second = getAnalyticsSession(1_000 + 10 * 60 * 1000);
    const third = getAnalyticsSession(1_000 + 41 * 60 * 1000);

    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(second.sessionId).toBe(first.sessionId);
    expect(third.started).toBe(true);
    expect(third.sessionId).not.toBe(first.sessionId);
    expect(analyticsSessionDefinition).toContain('30 minutos');
  });
});
