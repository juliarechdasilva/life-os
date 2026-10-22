#!/bin/bash
# Publica a versão atual no GitHub Pages (branch gh-pages). Uso: npm run deploy
set -e
cd "$(dirname "$0")/.."
npm test
npm run build
touch dist/.nojekyll
TMP=$(mktemp -d)
cp -R dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git commit -q -m "Publicação $(date '+%d/%m/%Y %H:%M')"
git push -q -f "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
cd - > /dev/null
rm -rf "$TMP"
echo "Publicado: https://juliarechdasilva.github.io/life-os/ (pode levar 1–2 minutos para atualizar)"
