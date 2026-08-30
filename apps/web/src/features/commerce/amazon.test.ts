import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditAmazonLink, buildAmazonLink, getAmazonTrackingId, isAmazonEnabled } from './amazon';

const PRODUCT = 'https://www.amazon.com.br/dp/B0EXAMPLE';

describe('features/commerce/amazon — Link Especial centralizado', () => {
  const original = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
    else process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = original;
  });

  it('SEM Tracking ID: desativado e não gera nenhum link (nunca cai para URL sem tag)', () => {
    expect(getAmazonTrackingId()).toBeNull();
    expect(isAmazonEnabled()).toBe(false);
    expect(buildAmazonLink({ url: PRODUCT })).toBeNull();
  });

  it('Tracking ID inválido é tratado como ausente', () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'sem-formato-de-tag';
    expect(getAmazonTrackingId()).toBeNull();
    expect(buildAmazonLink({ url: PRODUCT })).toBeNull();
  });

  it('COM Tracking ID válido: a URL final carrega tag=<trackingId>', () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'petmolfuturo-20';
    const link = buildAmazonLink({ url: PRODUCT });
    expect(link).not.toBeNull();
    const u = new URL(link as string);
    expect(u.searchParams.get('tag')).toBe('petmolfuturo-20');
    expect(u.searchParams.get('language')).toBe('pt_BR');
  });

  it('subId válido vira ascsubtag; subId inválido é ignorado', () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'petmolfuturo-20';
    expect(new URL(buildAmazonLink({ url: PRODUCT, subId: 'guia_racao' }) as string).searchParams.get('ascsubtag')).toBe('guia_racao');
    expect(new URL(buildAmazonLink({ url: PRODUCT, subId: 'inv$lido!' }) as string).searchParams.get('ascsubtag')).toBeNull();
  });

  it('recusa URL que não é amazon.com.br, http, ou malformada', () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'petmolfuturo-20';
    expect(buildAmazonLink({ url: 'https://www.amazon.com/dp/x' })).toBeNull();
    expect(buildAmazonLink({ url: 'http://www.amazon.com.br/dp/x' })).toBeNull();
    expect(buildAmazonLink({ url: 'not a url' })).toBeNull();
    expect(buildAmazonLink({ url: 'https://amazon.com.br.evil.com/dp/x' })).toBeNull();
  });

  it('auditAmazonLink identifica link sem tag como não-conforme', () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'petmolfuturo-20';
    const bad = auditAmazonLink('https://www.amazon.com.br/dp/B0X');
    expect(bad.ok).toBe(false);
    expect(bad.trackingIdInUrl).toBe(false);
    const good = auditAmazonLink(buildAmazonLink({ url: PRODUCT }) as string);
    expect(good.ok).toBe(true);
    expect(good.trackingIdInUrl).toBe(true);
  });

  it('auditAmazonLink acusa tag diferente da configurada', () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = 'petmolfuturo-20';
    const audit = auditAmazonLink('https://www.amazon.com.br/dp/B0X?tag=tag-antiga-21');
    expect(audit.ok).toBe(false);
    expect(audit.reason).toMatch(/diferente/i);
  });
});
