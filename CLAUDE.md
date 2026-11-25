# €iclo — contexto para o Claude

App pessoal de controlo de despesas, **de ordenado a ordenado** (mensal e anual), para PC e telemóvel.
Publicada no GitHub Pages: `https://hikami2.github.io/ciclo/`. Este repositório tem só o programa, **nunca dados pessoais**.

## Regras de trabalho
- Fala e escreve sempre em **português de Portugal** (interface, mensagens de commit, respostas).
- Commits curtos, no estilo "Área: o que mudou" (ex.: `Movimentos: ordenar pelos mais antigos`).
- Sem build nem dependências: HTML/CSS/JS puros, ficheiros servidos tal como estão.
- Ao alterar ficheiros, **sobe o número de versão `?v=N`** de todos os `<script>`/`<link>` em `index.html` (atualmente `v=32`) para os browsers apanharem a versão nova.
- Respeitar a CSP de `index.html`: só `connect-src https://api.github.com`, sem scripts externos nem inline.
- Testar sempre no telemóvel (≤900px) e no PC, tema claro e escuro.

## Ficheiros
- `index.html` — estrutura, CSP, navegação (Mensal, Anual, Movimentos, Transferências [só PC], Contas, Plano, Definições).
- `app.js` — toda a lógica: dados, encriptação, sincronização, períodos, vistas.
- `importer.js` — importação de extratos bancários CSV (regras `RULES` de categorização automática por descrição).
- `xlsx.js` — exportação para Excel (.xlsx) feita à mão, com fórmulas e gráfico.
- `app.css` — estilos (tokens claro/escuro). `theme.js` — aplica o tema antes de desenhar.
- `config.js` — ficheiro de dados (`dados.enc.json`); `dataRepo` vazio: cada pessoa indica o seu repositório privado ao ligar (o do dono é `HiKami2/ciclo-dados`).
- `sw.js` — service worker. **Está vazio desde o commit "Botão Atualizar"** (a app continua a registá-lo); a versão anterior fazia cache offline (`eciclo-v29`). Confirmar com o utilizador antes de mudar.

## Dados e sincronização
- Guardados em `localStorage` (`minhasDespesas.web.v1`) e IndexedDB, sincronizados para o repositório **privado** `ciclo-dados` como um ficheiro encriptado no dispositivo (AES-256-GCM, chave PBKDF2-SHA256 com 310 000 iterações). Cada sincronização é um commit.
- Cada dispositivo liga-se com um token fine-grained (só `ciclo-dados`, Contents read/write) e a palavra-passe de encriptação.
- `mergeDB` junta versões: vence a alteração mais recente de cada item (`u`); apagados ficam em `DB.apagados`.
- Estrutura: `DB.config`, `DB.movimentos`, `DB.plano` (salário/outros por período), `DB.poupancas`, `DB.conta`.

## Conceitos do domínio
- **Período** = do dia do ordenado (`config.diaOrdenado`, por omissão 22; se não for dia útil, o dia útil seguinte, com feriados PT) até à véspera do próximo. Chave `AAAA-MM`.
- **Saldo transitado**: o saldo do período anterior passa como receita (configurável em `config.transitar`, desde `2026-11`).
- Movimentos: tipo Fixa/Variável, situação (pago, pendente, pausado, recebido, sem valor), categoria (ícones e cores em `CAT_ICON`/`CAT_HUE`).
- **Prestações**: compras em 2x–12x com etiqueta n/N, quadro no Plano e resumo no Mensal.
- **Contas**: contas secundárias com saldo e data de fim; contas só para guardar (Poupança Mensal, Mealheiro); gastos e reembolsos fora do plafond; "Pago com" ao adicionar.
- **Transferências por pessoa** (só PC): balanço "deves / devem-te"; só contam movimentos TFI do extrato e as categorias Transferências e Entradas; apostas contam como ganho ou perda.
- **Objetivos de poupança** com valor e prazo opcionais.

## Funcionalidades já feitas (por ordem)
1. App web com sincronização encriptada; nome €iclo; mensagem de erro clara para token sem escrita.
2. Adaptação ao telemóvel: navegação inferior fixa, folha deslizante, nada cortado; ecrãs largos usam toda a largura.
3. Novo visual: ícones, avatares por categoria, botões com relevo, temas automático/claro/escuro, mês atual destacado.
4. Botão "Adicionar movimento" no topo (sem botão flutuante).
5. Rendimentos com €, duas casas, total do ano.
6. Prestações; saldo do mês anterior transitado.
7. Importar extrato CSV: pré-visualização, categorias automáticas, duplicados, transferências entre contas; TFI → Transferências.
8. Movimentos: filtros (ano, mês, tipo, categorias, situação, valor, prestações), ordenação (data, mais antigos, alterados recentemente com data/hora), paginação, resumo.
9. Exportar Excel completo (Resumo com gráfico, Movimentos, Categorias, Plano, Poupança, Definições, com fórmulas); nos Movimentos exporta só os filtrados; importar fica nas Definições.
10. Contas secundárias, contas de poupança, separador Transferências.
11. Desempenho: abre da cópia guardada, sem desfoques, sem redesenhar após sincronizar sem alterações.
12. Botão Atualizar: sincroniza e procura versão nova; atualizações automáticas mantêm o sítio onde se estava.
