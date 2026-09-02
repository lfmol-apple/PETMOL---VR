import { PRODUCT_COLLECTIONS, type ProductCollection } from '@/features/guides/productCollections';

/**
 * "Produtos selecionados pelo PETMOL" — seção editorial dos Guias.
 *
 * FASE 1: cada núcleo é um bloco editorial com "Seleções em preparação".
 * Não renderiza produto, link, preço, rating nem badge — porque ainda não
 * existem. Quando a Fase 2 preencher `collection.items`, esta seção passa a
 * listar os produtos; até lá, mostra o placeholder.
 */
function CollectionCard({ collection }: { collection: ProductCollection }) {
  const hasItems = collection.items.length > 0;
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-[18px]">
          {collection.icon}
        </span>
        <h3 className="text-[15px] font-black text-slate-900">{collection.label}</h3>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-slate-500">{collection.description}</p>
      {hasItems ? (
        <ul className="mt-3 space-y-1.5">
          {collection.items.map((item) => (
            <li key={item.name} className="text-[13px] font-semibold text-slate-800">
              {item.name}
              <span className="block text-[12px] font-normal text-slate-500">{item.editorialNote}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Seleções em preparação
        </span>
      )}
    </div>
  );
}

export function ProductSelectionSection() {
  return (
    <section aria-labelledby="produtos-selecionados" className="mt-12">
      <h2
        id="produtos-selecionados"
        className="text-[13px] font-black uppercase tracking-wide text-slate-400"
      >
        Produtos selecionados pelo PETMOL
      </h2>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-slate-500">
        Além dos nossos guias, selecionamos produtos que podem facilitar a rotina com cães e gatos.
        As recomendações são organizadas por necessidade e aparecem junto ao conteúdo editorial
        relacionado.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCT_COLLECTIONS.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} />
        ))}
      </div>
      <p className="mt-4 text-[12px] text-slate-400">
        Em breve: recomendações selecionadas pelo PETMOL, com um resumo editorial de cada item.
      </p>
    </section>
  );
}
