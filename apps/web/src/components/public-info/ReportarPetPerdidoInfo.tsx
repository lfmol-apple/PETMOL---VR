import Link from 'next/link';
import { H2, P, PublicOnly, UL } from './PublicOnly';

/**
 * Texto público de /reportar-pet-perdido. Cada afirmação vem da tela atual (app/reportar-pet-perdido/page.tsx):
 * formulário sem conta, campos pedidos, "Registro ativo" com página pública sem mostrar o contato do reportante,
 * e a seção "Acompanhamento > Possíveis contatos".
 */
export function ReportarPetPerdidoInfo() {
  return (
    <PublicOnly label="Como funciona o reporte de pet perdido">
      <H2>Reportar pet perdido: como funciona</H2>
      <P>
        Este formulário serve para divulgar um pet perdido sem criar conta no PETMOL. Ele é indicado quando uma instituição,
        um vizinho ou outra pessoa precisa divulgar o desaparecimento de um animal.
      </P>

      <H2>O que você informa</H2>
      <UL>
        <li>Uma foto do pet.</li>
        <li>A espécie: cachorro, gato ou outro.</li>
        <li>O nome ou uma identificação do pet.</li>
        <li>A raça ou o porte.</li>
        <li>Características visíveis, como cor, manchas, coleira e comportamento.</li>
        <li>A última região em que o pet foi visto. O formulário pede para não informar endereço sensível.</li>
        <li>O seu contato, para acompanhar o alerta.</li>
      </UL>

      <H2>Depois do registro</H2>
      <P>
        O alerta fica ativo e ganha uma página pública, que pode ser compartilhada sem mostrar o seu contato. Na seção
        Acompanhamento, você vê os possíveis contatos recebidos: o local informado por quem viu o pet, as observações e se
        foram enviadas fotos ou vídeo.
      </P>
      <P>Quem já usa o aplicativo PETMOL pode criar o alerta pelo recurso Pet Sumido.</P>

      <H2>Quer saber mais?</H2>
      <UL>
        <li>
          <Link href="/guias/pet-perdido-o-que-fazer-nas-primeiras-horas" className="font-bold text-[#0056D2] underline-offset-2 hover:underline">
            Pet perdido: o que fazer nas primeiras horas
          </Link>
        </li>
        <li>
          <Link href="/guias/gato-fugiu-de-casa-volta-sozinho-o-que-fazer" className="font-bold text-[#0056D2] underline-offset-2 hover:underline">
            Gato fugiu de casa: volta sozinho? O que fazer
          </Link>
        </li>
        <li>
          Viu ou encontrou um pet?{' '}
          <Link href="/achei-um-pet" className="font-bold text-[#0056D2] underline-offset-2 hover:underline">
            Veja os alertas e avise o tutor
          </Link>
          .
        </li>
      </UL>
    </PublicOnly>
  );
}
