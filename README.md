# Life OS

Painel de controle da sua vida: agenda, tarefas, estudos, objetivos, hábitos, finanças, diário e um planejador que reorganiza o seu dia. Em português, gratuito, privado e funciona sem internet.

## Como abrir

**No celular ou em qualquer computador:** https://juliarechdasilva.github.io/life-os/ — no iPhone, abra no Safari → botão Compartilhar → **Adicionar à Tela de Início**.


**Jeito mais fácil (Mac):** dê dois cliques em `Abrir Life OS.command` nesta pasta. Na primeira vez o macOS pode bloquear: clique com o botão direito no arquivo → **Abrir** → **Abrir**. Uma janela do Terminal aparece e o navegador abre o app em `http://localhost:5318`. Deixe a janela do Terminal aberta enquanto usa o app.

**Pelo Terminal:**

```bash
cd ~/00_Projetos/life-os
npm install          # só na primeira vez
npm run dev          # modo desenvolvimento → http://localhost:5173
# ou
npm run build && npm run preview   # versão final → http://localhost:5318
```

Para instalar como aplicativo: no Chrome/Edge, ícone de instalar na barra de endereço; no iPhone (Safari), Compartilhar → "Adicionar à Tela de Início". O app instalado abre mesmo sem internet.

## O que já funciona

| Área | Recursos |
|---|---|
| Início | Saudação, data, próxima atividade, sugestão de próxima ação, "Seu dia, do seu jeito" (linha do tempo com compromissos, blocos e descansos), tempo livre restante, tarefas prioritárias (concluir direto), hábitos do dia, metas, resumo semanal, anotações rápidas, atalhos de criação |
| Agenda | Dia, semana e mês; criar/editar/concluir/excluir; recorrência (diária, dias úteis, semanal com dias escolhidos, mensal, anual, "até"); excluir só uma ocorrência; local, categoria, lembrete; aviso de conflito antes de salvar ("Salvar mesmo assim"); tarefas na mesma visão; busca; filtro por categoria; próximos compromissos |
| Tarefas | Título, descrição, vencimento, horário, prioridade, categoria, status, tempo estimado, subtarefas, tags, recorrência, projeto, matéria, evento, observações, bloco planejado; lista agrupada e quadro Kanban (arrastar); filtros Hoje / 7 dias / Atrasadas / Sem data / Importantes / Concluídas; busca; ordenação personalizada; histórico de concluídas; reagendar rápido; ações em lote; criação rápida em linguagem natural ("ligar para o médico amanhã 10h #saude !alta") |
| Life OS AI | Conversa em português; entende datas, horários, durações e prioridades; cria tarefas e compromissos, monta plano para prova, organiza a semana, sugere o que fazer no tempo livre, divide objetivos em etapas, reorganiza o dia, responde agenda/prazos/conflitos. Tudo vira proposta para aceitar, editar ou recusar, com explicação |
| Reorganizar minha vida | Analisa pendências, prazos, compromissos, descansos, disponibilidade e limite diário; informa tempo perdido; propõe novo plano por item; mostra o que não coube e por quê; nunca move compromissos nem apaga tarefas |
| Estudos | Matérias com meta semanal, anotações e materiais; provas/trabalhos com conteúdo e checklist; cronograma sugerido até a prova; cronômetro de foco (Pomodoro configurável) que continua mesmo trocando de tela; registro de sessões; revisões programadas (1, 3 e 7 dias); histórico e horas por matéria |
| Objetivos e projetos | Etapas, tarefas vinculadas, progresso calculado só pelo que foi concluído, histórico de evolução, notas, próxima ação recomendada, transformar objetivo em projeto (com tarefas) |
| Hábitos | Diário, dias específicos ou X vezes por semana; registrar; dia de descanso; pausar; lembrete; consistência da semana; calendário de 17 semanas (corrigir dias passados); estatísticas sem mensagens punitivas |
| Finanças | Receitas e despesas em R$, categorias, limites mensais, saldo calculado, metas de economia com valores reservados, gráfico de 6 meses, despesas por categoria, comparação com mês anterior, recorrentes (com "lançar deste mês"), busca/filtros, exportar CSV (abre no Excel) |
| Diário e Memórias | Entradas com data, título, texto, tags, humor, marcação de importante, fotos/PDF anexos, busca, filtro por período, retrospectiva (1 semana/1 mês/1 ano atrás), exportar em .md e .json, criptografia com senha |
| Busca global | Ctrl/⌘+K: tarefas, eventos, objetivos, matérias, provas, anotações, diário, memórias, finanças e hábitos, agrupados e com abertura direta |
| Configurações | Nome, tema claro/escuro/automático, primeiro dia da semana, formato 12h/24h, categorias, notificações, disponibilidade por dia, descansos, limite de foco, backup/restauração, apagar tudo, informações de privacidade |

## Novidades da versão 2

- **IA generativa gratuita (opcional):** Groq (recomendado) ou Google Gemini, com a sua própria chave gratuita (sem cartão). Configurações → Inteligência artificial. Só são enviados tarefas, agenda, horários livres, objetivos e estudos — nunca diário, memórias ou finanças. Tudo continua virando proposta para aceitar, e as sugestões passam por validação local (conflitos, descansos, datas). Sem internet, sem chave ou sem cota, o app usa as regras locais automaticamente.
- **Lembretes com o app fechado:** Agenda → "Calendário do celular" gera um arquivo .ics que coloca compromissos e tarefas com horário no Calendário do celular, com alerta.
- **Criptografia de verdade** do diário e das memórias (inclusive fotos), com senha (AES-256). O diário vai criptografado também no backup.
- **Backup automático (grátis) no seu GitHub:** Configurações → Seus dados → Backup automático. O app envia sozinho uma cópia criptografada (senha de backup) para o repositório privado `life-os-backup`, ~1 min depois de cada mudança. Cada envio vira uma versão; dá para restaurar qualquer data e em outro aparelho (a tela inicial tem "Restaurar do backup automático"). O Início avisa quando outro aparelho enviou um backup mais novo.
- **Backup em arquivo:** lembrete no Início quando faz mais de 7 dias, opção de proteger o arquivo com senha e, no celular, salvar direto em Arquivos/iCloud.
- **Kanban no celular:** botões ← → em cada cartão.

## Limitações (honestas)

- **Os dados ficam no aparelho onde você usa.** Não é sincronização em tempo real: com o backup automático ligado nos dois aparelhos, o app avisa quando o outro tem dados mais novos e você escolhe trazer (substitui os dados deste aparelho — não junta os dois).
- **Sem internet:** depois do primeiro acesso, tudo funciona offline (testado no motor do Safari). Só a IA opcional e o backup automático precisam de internet; o backup espera a conexão voltar.
- **Limpar os dados do navegador apaga tudo.** Faça backups (o app lembra você).
- **IA opcional depende de serviço externo gratuito:** tem limite diário de uso; o Gemini gratuito pode usar o conteúdo enviado para melhorar os produtos do Google e exige 18+ anos. A IA pode errar — por isso tudo vira proposta.
- **Notificações do próprio app** só funcionam com ele aberto. Para avisos com o app fechado, use a exportação para o Calendário do celular (é uma cópia: exporte de novo se mudar algo).
- **Senha do diário esquecida = diário perdido.** Não há recuperação.
- **Idioma:** só português (Brasil).

## Custos

| Item | Custo |
|---|---|
| Usar o app no seu computador | R$ 0 |
| Bibliotecas (React, Vite, TypeScript, Lucide, fontes Inter/Newsreader) | R$ 0 — código aberto |
| Serviços externos, APIs, IA | Nenhum é obrigatório. IA opcional: Groq ou Gemini, plano gratuito sem cartão (não ative cobrança na conta deles) |
| Backup automático (GitHub, repositório privado) | R$ 0 — repositórios privados são grátis; limite de 100 MB por arquivo (cuidado com muitas fotos) |
| Publicação (GitHub Pages) | R$ 0 — repositório público; o código fica visível, seus dados não (eles ficam só no seu aparelho) |
| Domínio próprio (opcional) | ~R$ 40/ano em registro.br — só se você quiser um endereço próprio |

Nenhum custo é obrigatório.

## Testes

```bash
npm test         # 40 testes de lógica (datas, recorrência, linguagem natural, planejador, IA, criptografia, calendário, backup, persistência)
npm run dev -- --port 5317   # em outro Terminal
npm run e2e      # 24 cenários (PW_BROWSER=webkit para o motor do Safari) no Chrome real (critérios de aceitação), capturas em test-results/
```

## Tecnologia

React 19 + TypeScript, Vite, CSS próprio (sem framework), IndexedDB (banco local do navegador), Service Worker (PWA/offline), Vitest e Playwright para testes.
