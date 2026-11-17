import { fireEvent, screen } from '@testing-library/react';

/** Campanhas são SÓ de link: nos testes que criam uma campanha pela tela, cola e confere um link de produto. */
export async function addProductLink(url = 'https://amzn.to/abc') {
  fireEvent.change(screen.getByLabelText(/Link do produto/), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferir' }));
  await screen.findByText(/Loja reconhecida/);
}
