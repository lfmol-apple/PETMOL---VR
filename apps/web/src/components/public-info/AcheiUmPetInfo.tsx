import Link from 'next/link';
import { H2, P, PublicOnly, UL } from './PublicOnly';

/**
 * Texto público de /achei-um-pet. Cada afirmação vem do que a tela faz hoje (app/achei-um-pet/page.tsx):
 * lista de alertas (ativos/todos), "Vi ou encontrei este pet", vídeo-prova só para quem está com o pet,
 * busca por foto (IA, prioriza até 30 km com localização, não confirma sozinha) e avistamento para cruzar depois.
 */
export function AcheiUmPetInfo() {
  return (
    <PublicOnly label="Como funciona o Achei um pet">
      <H2>Achei um pet: como funciona</H2>
      <P>
        Esta página reúne os alertas de pets perdidos registrados no PETMOL e permite que quem viu ou encontrou um cão ou
        gato avise o tutor.
      </P>

      <H2>Ver os alertas</H2>
      <P>
        A lista mostra os alertas de pets perdidos e permite ver só os ativos ou todos. Cada alerta traz foto, nome, raça,
        região e a data em que o pet sumiu. O telefone do tutor não é exibido.
      </P>

      <H2>Se você reconhece um pet da lista</H2>
      <P>
        Toque em &ldquo;Vi ou encontrei este pet&rdquo;. Você informa o seu telefone ou WhatsApp (obrigatório), pode dizer onde
        está, usando a localização do aparelho ou o CEP, e acrescentar observações, como a cor da coleira. O tutor é
        notificado.
      </P>
      <P>
        Se você está com o pet agora, o PETMOL pede um vídeo curto, de 5 a 8 segundos, mostrando o animal, como prova.
        Quem apenas viu o pet não precisa enviar vídeo. O PETMOL entrega a prova ao tutor, que decide se libera contato.
      </P>

      <H2>Não sabe de qual alerta é? Use a foto</H2>
      <P>
        Tire uma foto do animal que você viu e a inteligência artificial do PETMOL procura os alertas mais parecidos. Se você
        permitir a localização, a busca prioriza alertas em até 30 km. O resultado não confirma nada sozinho: quem decide
        é o tutor. Se nenhum candidato aparecer, você pode registrar o avistamento, e o sistema cruza de novo quando surgir
        um alerta compatível na região.
      </P>

      <H2>Cuidados</H2>
      <UL>
        <li>Nunca peça nem aceite dinheiro ou PIX para devolver um animal. O PETMOL não cobra por isso.</li>
        <li>Combine sempre um local público e seguro para a entrega.</li>
      </UL>

      <H2>Quer saber mais?</H2>
      <UL>
        <li>
          <Link href="/guias/achei-um-cachorro-o-que-fazer" className="font-bold text-[#0056D2] underline-offset-2 hover:underline">
            Achei um cachorro na rua: o que fazer
          </Link>
        </li>
        <li>
          Seu pet sumiu?{' '}
          <Link href="/reportar-pet-perdido" className="font-bold text-[#0056D2] underline-offset-2 hover:underline">
            Reporte um pet perdido
          </Link>{' '}
          ou leia{' '}
          <Link href="/guias/pet-perdido-o-que-fazer-nas-primeiras-horas" className="font-bold text-[#0056D2] underline-offset-2 hover:underline">
            o que fazer nas primeiras horas
          </Link>
          .
        </li>
      </UL>
    </PublicOnly>
  );
}
