# Checklist — repositório público → privado

O repositório `lfmol-apple/PETMOL---VR` continua **público** hoje
(25/08/2026). Este documento não muda isso — é o checklist pra quando a
decisão de migrar for tomada, mais o resultado da auditoria de risco
atual feita nesta revisão.

## Auditoria de risco — estado hoje (repositório público)

- **Secrets commitados no histórico**: nenhum encontrado. `git grep` por
  padrões de chave (`AIzaSy`, `sk-proj-`, `sk-live-`, `AKIA...`) só bate
  num comentário de exemplo em `requirements-robust.txt`
  (`# export OPENAI_API_KEY="sk-proj-..."` — placeholder, não uma chave
  real). Nenhum `.env` real está rastreado (só `.env.example`).
- **IP/hostname interno**: não encontrado nada além do domínio público
  `petmol.com.br` (esperado, é o produto).
- **E-mail administrativo**: `privacidade@petmol.com.br`/
  `dpo@petmol.com.br` são endereços de contato deliberadamente públicos
  (exigidos pela LGPD na política de privacidade) — não é exposição
  indevida.
- **Docs estratégicos**: nada como plano de negócio, margens, contratos
  comerciais reais encontrado versionado.
- **Achado real, mas FORA deste repositório**: o script
  `/opt/petmol/scripts/backup_pg_prod.sh` na própria VPS de produção
  (confirmado via leitura read-only, não versionado aqui) tem
  `PGPASSWORD="petmol_dev_2026"` hardcoded em texto puro. Isso é risco
  de produção, não de exposição do repositório GitHub — mas é real e
  vale corrigir manualmente na VPS quando possível (mover pra
  `~/.pgpass` ou variável de ambiente carregada de um arquivo com
  permissão restrita). Não corrigido aqui — REGRA ABSOLUTA desta tarefa
  proíbe alterar a VPS.
- **Dependabot**: GitHub reporta 105 vulnerabilidades nas dependências
  (46 high, 40 moderate, 19 low) — isso é sobre bibliotecas desatualizadas,
  não sobre a visibilidade do repo; seria reportado igual se o repo já
  fosse privado. Fora do escopo desta tarefa (não é "gap de compra
  monetizada" nem P0 legal), mas vale uma rodada de
  `npm audit fix`/atualização de dependências dedicada.

**Conclusão da auditoria de risco**: nada encontrado no repositório
GitHub que justifique tratar a migração como urgente por vazamento
ativo. A migração pra privado, quando decidida, é sobre reduzir
superfície de exposição futura (código de matching/ranking/regras
comerciais visíveis a concorrentes — ver seção 54 da revisão), não
sobre um incidente já em curso.

## Checklist pra quando a migração for decidida

- [ ] Confirmar que nenhuma integração externa depende do repo ser
      público (ex: GitHub Pages, Actions de terceiros que exigem repo
      público em algum plano gratuito, badges/links externos).
- [ ] Revisar `Settings → Collaborators and teams` — quem tem acesso
      hoje só por o repo ser público (nunca deveria ter tido) vs. quem
      precisa de acesso explícito depois.
- [ ] Girar (rotacionar) qualquer credencial que já tenha sido exposta
      em qualquer momento do histórico do repo, mesmo que não
      encontrada nesta auditoria — histórico de força-push/rebase pode
      ter removido evidência de commits antigos sem remover o risco.
- [ ] Confirmar que CI (`vps-command.yml`, `deploy-atomic.yml`, etc.)
      continua funcionando sob plano privado (limites de minutos/Actions
      podem mudar).
- [ ] Avisar qualquer colaborador externo/agência antes da mudança.
- [ ] Depois de privado: considerar se algum secret do GitHub Actions
      pode ser rebaixado de "repo secret" pra "environment secret" com
      approval gate, já que o modelo de ameaça muda.

## Proteção competitiva (seção 54 da revisão)

Migrar pra privado ajuda, mas não é a única defesa — e ofuscar o
frontend NÃO é o caminho (JS minificado ainda é legível/extraível).
Decisões comerciais sensíveis (lógica de matching, ranking de ofertas,
regras de quando um merchant é `publicly_servable`) já vivem
server-side por design em todo este repo (`CommerceEngine`,
`is_*_publicly_servable()`, `monetization_coverage.py`, etc.) —
confirmado nesta auditoria, nenhuma dessas decisões vaza pro bundle do
frontend. Manter esse padrão importa mais do que a visibilidade do repo
em si.
