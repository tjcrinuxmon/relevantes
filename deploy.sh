#!/usr/bin/env bash
#
# Despliegue de "relevantes" en producción.
# Se ejecuta EN EL SERVIDOR, dentro del directorio del repo:
#     ./deploy.sh
#
# Actualiza el código desde origin/main, reinstala dependencias solo si
# cambiaron, y reinicia el proceso de PM2. NO toca la base de datos de
# producción (relevantes.db) ni el archivo .env.

set -euo pipefail

# --- Configuración (ajusta si tu proceso PM2 tiene otro nombre) -------------
APP_NAME="relevantes"
BRANCH="main"
# ---------------------------------------------------------------------------

# Trabajar siempre desde el directorio donde vive este script
cd "$(dirname "$0")"

command -v git >/dev/null || { echo "✖ git no está instalado"; exit 1; }
command -v pm2 >/dev/null || { echo "✖ pm2 no está instalado"; exit 1; }

echo "==> Protegiendo datos de producción (git ignora cambios locales en estos archivos)..."
for f in relevantes.db .env; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    git update-index --skip-worktree "$f" 2>/dev/null || true
    echo "    · protegido: $f"
  fi
done

echo "==> Descargando cambios de origin/$BRANCH..."
git fetch origin "$BRANCH"

BEFORE="$(git rev-parse HEAD)"
# --ff-only: si producción tiene commits divergentes, se detiene sin romper nada
git merge --ff-only "origin/$BRANCH"
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "==> Sin cambios nuevos (ya estaba en ${AFTER:0:7})."
else
  echo "==> Código actualizado: ${BEFORE:0:7} -> ${AFTER:0:7}"
  echo "    Archivos:"
  git diff --name-only "$BEFORE" "$AFTER" | sed 's/^/      /'
fi

# Reinstalar dependencias solo si cambió package.json o package-lock.json
if [ "$BEFORE" != "$AFTER" ] && \
   git diff --name-only "$BEFORE" "$AFTER" | grep -qE 'package(-lock)?\.json'; then
  echo "==> Cambiaron dependencias, instalando..."
  npm ci --omit=dev || npm install --omit=dev
else
  echo "==> Sin cambios en dependencias, se omite npm install."
fi

echo "==> Reiniciando PM2 ($APP_NAME)..."
pm2 restart "$APP_NAME" --update-env

echo "==> Últimas líneas de log:"
pm2 logs "$APP_NAME" --lines 15 --nostream || true

echo "✅ Despliegue de relevantes completado."
