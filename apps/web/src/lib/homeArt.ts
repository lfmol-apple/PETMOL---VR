/**
 * Artes dos cards da Home / Cuidados (criadas pelo dono). Importadas como ativo do Next em vez de
 * ficarem em /public: o arquivo sai com hash no nome (/_next/static/media/…) e é servido com cache
 * "imutável" pelo nginx — em /public o nginx manda `no-store` e a arte era baixada de novo a cada
 * abertura do app.
 */
import alimentacao from '@/assets/home/alimentacao-tigela.webp';
import banho from '@/assets/home/cuidados-pets-banho.webp';
import vacina from '@/assets/home/vacina-ampolas-seringa.webp';
import loja from '@/assets/home/loja-cart-ossos.webp';
import antipulgas from '@/assets/home/cuidados-antipulgas.webp';
import coleira from '@/assets/home/cuidados-coleira.webp';
import medicacao from '@/assets/home/cuidados-medicacao.webp';
import vermifugo from '@/assets/home/vermifugo-produto.webp';
import petshops from '@/assets/home/cuidados-petshops.webp';

export const HOME_ART = {
  alimentacao: alimentacao.src,
  banho: banho.src,
  vacina: vacina.src,
  loja: loja.src,
  antipulgas: antipulgas.src,
  coleira: coleira.src,
  medicacao: medicacao.src,
  vermifugo: vermifugo.src,
  petshops: petshops.src,
} as const;
