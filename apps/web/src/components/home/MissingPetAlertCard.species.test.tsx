import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MissingPetAlertCard, type NearbyAlert } from './MissingPetAlertCard';

afterEach(cleanup);

const alert = (species: string | null): NearbyAlert => ({
  id: 'a1', pet_name: 'Bidu', species, last_seen_location: null, missing_date: null, missing_time: null,
  created_at: null, user_id: 'u1', photo_url: null, breed: null, characteristics: null, public_slug: null,
});

const show = (species: string | null) =>
  render(
    <MissingPetAlertCard
      alert={alert(species)} photoUrl={null} collapsed={false} onToggleCollapsed={vi.fn()}
      onViewCard={vi.fn()} onSeeThis={vi.fn()} onDismiss={vi.fn()} onReport={vi.fn()}
    />,
  );

describe('alerta de pet sumido por espécie', () => {
  it('cão e gato mantêm o texto de sempre', () => {
    show('dog');
    expect(screen.getByText(/Cachorro desaparecido/)).toBeTruthy();
    cleanup();
    show('cat');
    expect(screen.getByText(/Gato desaparecido/)).toBeTruthy();
  });
  it('coelho e cavalo falam o nome do bicho, não "Cachorro"', () => {
    show('rabbit');
    expect(screen.getByText(/Coelho desaparecido/)).toBeTruthy();
    expect(screen.queryByText(/Cachorro/)).toBeNull();
    cleanup();
    show('cavalo');
    expect(screen.getByText(/Cavalo desaparecido/)).toBeTruthy();
  });
  it('sem espécie informada: "Pet" (nunca presume cachorro)', () => {
    show(null);
    expect(screen.getByText(/Pet desaparecido/)).toBeTruthy();
  });
});
