#!/bin/bash
# Clique duas vezes neste arquivo para abrir o Life OS no navegador.
# Deixe esta janela do Terminal aberta enquanto usa o app. Para fechar: Ctrl+C ou feche a janela.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then echo "Instalando (só na primeira vez)..."; npm install; fi
if [ ! -d dist ] || [ -n "$(find src public index.html -newer dist -print -quit 2>/dev/null)" ]; then echo "Preparando o app..."; npm run build; fi
(sleep 2; open "http://localhost:5318/") &
echo "Life OS aberto em http://localhost:5318 — deixe esta janela aberta."
npx vite preview --port 5318 --strictPort
