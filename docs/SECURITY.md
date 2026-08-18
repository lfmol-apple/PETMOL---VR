# SECURITY — pendências operacionais

Lista objetiva de itens de segurança/operação ainda em aberto. Sem dados sensíveis (IPs,
hostnames, e-mails, chaves) — valores reais ficam no cofre de segredos da equipe, nunca aqui.
Nenhum item abaixo deve ser marcado como concluído sem evidência (log, execução real, ou link de
verificação).

## Pendências

- [ ] Ativar 2FA da conta GitHub antes de 10/09/2026.
- [ ] Executar uma restauração real de backup (`pg_dump` → `pg_restore`) num banco isolado, e
      conferir contagens de linhas — nunca foi feita, só o backup em si já roda agendado.
- [ ] Manter uma cópia do backup fora do VPS (hoje só existe localmente no próprio servidor).
- [ ] Revisar a venv Python compartilhada entre releases (`/opt/petmol/shared/venv`) — avaliar se
      o risco de uma dependência quebrada afetar todas as releases simultaneamente compensa a
      simplicidade atual frente a uma venv por release.
- [ ] Verificar se o fallback legado (`deploy.yml`/`apply_on_vps.sh`) ainda consegue restaurar o
      sistema atual de ponta a ponta, dado que o layout mudou (`/opt/petmol/current` em vez de
      `/opt/petmol/app`) desde que ele deixou de ser o caminho automático.
- [ ] Versionar um template sanitizado da configuração do nginx (`/etc/nginx/sites-enabled/petmol`
      não é versionada — já causou pelo menos um incidente real de `alias` apontando pro caminho
      legado após o cutover atômico).
- [ ] Validar notificações push em aparelhos reais (iOS/Android), não só via curl/health check.
- [ ] Validar o fluxo de exclusão de conta (`DELETE /auth/me`) de ponta a ponta — já teve pelo
      menos um bug real (tabela inexistente na lista de exclusão) descoberto só por teste
      automatizado, não por uso real.
- [ ] Auditar a comissão real recebida dos links de afiliados (Awin/Cobasi/Shopee) contra o que o
      dashboard de cada rede reporta — nunca foi conferido lado a lado.
- [ ] Criar suíte de testes de frontend — hoje só o backend tem cobertura de testes automatizados.
- [ ] Recriar as branches/PRs do Dependabot a partir da `main` atualizada, quando aplicável.
- [ ] Proteger a branch `main` contra push direto no GitHub (branch protection rule) — hoje
      qualquer colaborador com permissão de escrita pode dar push direto sem PR/review.

## Achado durante o hardening de e-mail admin (fora do escopo desta tarefa)

- `apps/web/src/lib/featureFlags.ts` ainda tem um e-mail de admin hardcoded no **frontend**
  (`return email === '<endereço real, não repetido aqui>'`), usado pra decidir visibilidade de
  alguma feature flag. Não foi alterado nesta tarefa — o escopo aqui era só o backend
  (`admin_master_email`/`get_current_admin`), e mexer em frontend estava explicitamente fora do
  escopo desta rodada. Fica registrado aqui pra não ser esquecido: mesmo tipo de risco (endereço
  pessoal hardcoded em repositório público), superfície diferente (o valor fica visível a
  qualquer um que inspecione o bundle JS do cliente, não só quem lê o backend).
