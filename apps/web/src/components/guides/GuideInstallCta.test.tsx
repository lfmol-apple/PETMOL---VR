import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ native: false }));
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => mocks.native }));
vi.mock('@/components/landing/DownloadButton', () => ({
  DownloadButton: ({ placement }: { placement: string }) => <div data-testid="dl" data-placement={placement} />,
}));
import { GuideInstallCta } from './GuideInstallCta';

afterEach(() => { cleanup(); mocks.native = false; });

describe('GuideInstallCta', () => {
  it('na web mostra o convite com o texto da categoria e mede por guia', () => {
    render(<GuideInstallCta slug="quanto-tempo-dura-saco-de-racao" category="alimentacao" />);
    expect(screen.getByText('Saiba quando a ração vai acabar')).toBeTruthy();
    expect(screen.getByTestId('dl').getAttribute('data-placement')).toBe('guia-quanto-tempo-dura-saco-de-racao');
  });
  it('categorias sem texto próprio usam o texto padrão', () => {
    render(<GuideInstallCta slug="x" category="gatos" />);
    expect(screen.getByText('Cuide da rotina do seu pet no PETMOL')).toBeTruthy();
  });
  it('dentro do app nativo não aparece', () => {
    mocks.native = true;
    render(<GuideInstallCta slug="x" category="gatos" />);
    expect(screen.queryByTestId('dl')).toBeNull();
  });
});
