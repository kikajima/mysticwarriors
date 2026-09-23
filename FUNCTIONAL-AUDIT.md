# Etapa 11 — Auditoria Funcional de Release

Esta etapa transforma os fluxos críticos do Myst Ki Warriors em um gate repetível de release. O objetivo não é substituir testes unitários: é provar que o servidor sobe com um banco limpo e que os principais sistemas funcionam juntos por HTTP, com autenticação, transações e persistência reais.

## Gate automático

Cada PR executa, nesta ordem:

1. suíte unitária e contratual com SQLite;
2. boot real do Next.js com banco SQLite isolado;
3. smoke HTTP principal (`scripts/e2e-audit.sh`);
4. smoke HTTP estendido (`scripts/e2e-release-extended.sh`);
5. TypeScript;
6. ESLint;
7. build de produção com schema PostgreSQL.

O banco do smoke é criado pelo mesmo caminho de migrations usado pelo boot do jogo. Fixtures de QA são restritas por `MW_E2E_RUN_ID`: helpers diretos recusam personagens fora dos nomes reservados da execução.

## Matriz de cobertura

| Sistema | Cobertura de release |
| --- | --- |
| Sessão, logout e isolamento entre contas | HTTP E2E |
| Convidado e conversão local convidado → conta | HTTP E2E |
| Criação e limite de personagem | HTTP E2E + contratos |
| Treino, energia e atributos sem teto | HTTP E2E + unitários |
| PvE, PvP, loadout e estratégia | HTTP E2E + engine |
| Quests, conquistas e claim exactly-once | HTTP E2E + integração |
| Transformações | HTTP E2E + catálogo |
| Ranking e guildas | HTTP E2E + contratos |
| Ameaça Universal | HTTP E2E + unitários |
| Ledger/economia | HTTP E2E + integração |
| Oficina: iniciar, cancelar, coletar e devolver insumos | HTTP E2E + integração transacional |
| Mercado P2P: anúncio, compra, deduplicação | HTTP E2E + integração |
| Ordens de compra e escrow | HTTP E2E + integração |
| Amizade, chat privado e bloqueio | HTTP E2E + contratos |
| Cosméticos: comprar/equipar/duplicata | HTTP E2E + catálogo |
| Inventário: comprar/equipar/desequipar/vender | HTTP E2E |
| Torneio: inscrição, atividade e aplicação exactly-once | HTTP E2E + unitários |
| Chaves do Horizonte: posse global, Convergência e busca sem energia | HTTP E2E + integração |
| Aethelgard/Bênçãos Primordiais | HTTP E2E |
| Concorrência, dedup e anti-órfãos | integração/contratos dedicados |

## Dependências externas que não são falsamente simuladas

Os seguintes caminhos dependem de serviços externos e, por isso, não são marcados como “E2E real” neste gate local:

- Supabase Auth real (`/api/auth/supabase`);
- snapshot/restore contra um projeto Supabase real;
- upload e leitura real de avatar no Supabase Storage;
- comportamento de rede/deploy do Render.

Esses fluxos continuam protegidos por testes de contrato/sanitização onde aplicável e devem ser validados em ambiente de staging/produção controlado antes do lançamento. A Etapa 12 cobre a auditoria de segurança desses conectores.

## Achados corrigidos durante a Etapa 11

- Os testes de integração da Oficina recriavam e migravam um banco inteiro por caso. Sob carga do CI, dois casos podiam ultrapassar o timeout de 5 s antes de chegar à lógica de crafting. A fixture agora migra uma vez por arquivo e mantém cada cenário isolado por personagem.
- O primeiro desenho do smoke inicializava o schema com `prisma db push` e depois o boot tentava aplicar a cadeia histórica de migrations sobre as mesmas tabelas. O gate agora deixa o próprio boot criar/migrar o banco, reproduzindo melhor o caminho real da aplicação.
- O repositório continha um gitlink órfão chamado `mysticwarriors`, sem `.gitmodules`, URL de submodule ou referências no código. Ele provocava warning no cleanup do checkout do GitHub Actions e foi removido.

## Critério da Etapa 11

A etapa só pode ser considerada concluída quando a mesma revisão passar, em uma única execução, por todos os testes unitários/contratuais, pelos dois smokes HTTP, TypeScript, ESLint e build de produção.
