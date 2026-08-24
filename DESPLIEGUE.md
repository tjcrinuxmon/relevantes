# Despliegue — Módulo Relevantes (SiCoDEAJ)

Servicio hermano de SiCoDEAJ (Express + better-sqlite3, frontend vanilla, sin build).
Producción en **Linux**, base `/home/usuario`. Corre detrás del **gateway**.

| | Valor |
|---|---|
| Carpeta | `/home/usuario/relevantes` |
| Puerto | **3007** |
| Proceso PM2 | `relevantes` |
| Base de datos | `relevantes.db` (se crea sola; NO se versiona) |
| Rama | `main` |
| Rutas gateway | `/relevantes/*` (front), `/api/rel/*` (API), `/uploads/rel/*` |

## 1) Primer despliegue (una sola vez)

```bash
cd /home/usuario
git clone https://github.com/tjcrinuxmon/relevantes.git
cd relevantes
npm ci --omit=dev            # o: npm install --omit=dev

# Configurar entorno (copiar del ejemplo y editar)
cp .env.example .env
#  - PORT=3007
#  - JWT_SECRET=<cadena larga aleatoria propia del módulo>
#  - RELEVANTES_SSO_SECRET=<DEBE ser IGUAL a RELEVANTES_SECRET del portal>
#  - ALLOWED_ORIGIN=http://localhost:3000   (o el dominio real detrás del gateway)

pm2 start server.js --name relevantes
pm2 save
```

## 2) Integración con el resto de SiCoDEAJ

El módulo depende de que **portal** y **gateway** estén actualizados:

- **portal/.env** (prod): agregar `RELEVANTES_SECRET=<mismo valor que RELEVANTES_SSO_SECRET del módulo>`.
- **portal**: `git pull` → `npm run build` → `pm2 restart portal` (su `deploy.sh` ya hace build).
- **gateway**: `git pull` → `pm2 restart gateway` (usa `TARGET_RELEVANTES=http://localhost:3007` por defecto; no requiere env extra).

El portal, al arrancar, sincroniza los usuarios con `acceso_relevantes` hacia `relevantes.db`.
Un usuario captura si tiene **subdirección** asignada; el administrador ve todo.

## 3) Despliegues posteriores

```bash
cd /home/usuario/relevantes
./deploy.sh
```

Actualiza desde `origin/main`, reinstala dependencias solo si cambiaron, y reinicia PM2.
**No toca** `relevantes.db` ni `.env` (los protege con `git update-index --skip-worktree`).
