# Guía de Contribución — MapGIS

## Git — GitHub Flow

Trabajamos con **GitHub Flow**. Simple, rápido, centrado en PRs.

```
main ─────────────────────────────────────────────────
  │
  ├── feat/login ──▶ PR ──▶ CI ✅ ──▶ review ✅ ──▶ squash merge
  │
  ├── fix/map-crash ──▶ PR ──▶ CI ✅ ──▶ review ✅ ──▶ squash merge
  │
  └── chore/update-deps ──▶ PR ──▶ CI ✅ ──▶ squash merge
```

**Reglas**:
- `main` siempre deployable. Si algo se rompe, se revierte.
- Todo cambio entra por PR. No se pushea directo a `main`.
- Ramas viven 1–3 días. Si tarda más, el PR está muy grande.

## Ramas

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `feat/` | Feature nueva | `feat/create-plan`, `feat/google-oauth` |
| `fix/` | Bug fix | `fix/auth-token-expiry`, `fix/map-zoom` |
| `chore/` | Tareas, deps, tooling | `chore/update-bun`, `chore/eslint-config` |
| `docs/` | Solo documentación | `docs/api-reference`, `docs/readme` |
| `refactor/` | Refactor sin cambio de comportamiento | `refactor/plan-service` |
| `test/` | Solo tests | `test/plan-creation-e2e` |

**Nombre**: `tipo/descripcion-breve` en minúsculas, sin tildes, guiones para espacios.

## Ciclo de un cambio

### 1. Empezar
```bash
git checkout main
git pull origin main
git checkout -b feat/mi-feature
```

### 2. Desarrollar
Commits frecuentes y atómicos siguiendo [Conventional Commits](https://www.conventionalcommits.org/):
```bash
git commit -m "feat(app): add login screen"
git commit -m "feat(supabase): add auth provider hook"
git commit -m "test(app): add login form validation tests"
```

El hook `commit-msg` valida el formato antes de cada commit.

> **Tests con el código**: cada feature incluye sus tests en los mismos commits. No "commit de tests" separado al final.

### 3. Pre-commit hook
Antes de cada commit se ejecuta automáticamente:
- `eslint --fix` sobre los archivos `.ts/.tsx` modificados (solo staged files)
- Si hay errores de lint, el commit se rechaza

### 4. Abrir PR
```bash
git push origin feat/mi-feature
# Abrir PR en GitHub desde la rama → main
```

### 5. Revisión

| Paso | Quién | Qué |
|---|---|---|
| 1. CI checks | GitHub Actions | lint, typecheck, test — deben pasar todos ✅ |
| 2. AI review | Revisor automático | Sugerencias de código, bugs, patrones (no vinculante) |
| 3. Human review | El otro desarrollador | Revisión de lógica, UX, arquitectura (vinculante) |

**El PR solo mergea si**: CI ✅ + 1 human approval ✅.

### 6. Merge
```bash
# Squash merge desde la UI de GitHub
# El mensaje del squash es el título del PR (conventional commit)
```

### 7. Limpiar
```bash
git checkout main
git pull origin main
git branch -d feat/mi-feature     # borrar local
# La rama remota se borra automáticamente al mergear
```

## PRs — Reglas de tamaño

| Líneas cambiadas | Acción |
|---|---|
| 0–200 | PR directo, 1 revisor |
| 200–400 | PR aceptable, revisión más cuidadosa |
| 400+ | **Partir en PRs encadenados** (stacked PRs). Ver sección abajo. |

> El hook `pre-commit` + CI evitan que escapes de lint o type errors. Pero el tamaño del PR lo controlamos nosotros.

### PRs encadenados (stacked)

Cuando un cambio es grande, lo partimos en PRs que dependen uno del otro:

```
PR #1 ──▶ feat/plan-schema         ← schema de DB, migraciones
              │
PR #2 ──▶ feat/plan-service        ← queries, depende de #1
              │
PR #3 ──▶ feat/plan-ui             ← pantalla de crear plan, depende de #2
```

Cada PR mergea a `main` de forma independiente. `main` nunca se rompe porque cada PR es un incremento funcional.

## Convenciones de commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>[-(scope)]: <descripción>

[cuerpo opcional]
```

**Tipos válidos**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`, `spec`, `design`

**Scopes válidos**: `app`, `supabase`, `shared`, `root`, `ci`, `docs`, `deps`

**Ejemplos**:
```
feat(app): add login screen with email/password
feat(supabase): add profiles table and RLS policies
fix(app): prevent map crash on zoom level 0
chore(root): update bun to v1.4.0
docs: add contributing guide
spec: add supabase-auth requirements
design: add detailed screen wireframes
```

## Releases

- Cada merge a `main` es deployable
- Tags semánticos: `v1.0.0`, `v1.1.0`, `v2.0.0`
- El CI/CD deploya automáticamente desde `main`
- Android: se sube a Play Console internal track
- Web: se deploya al VPS + Cloudflare cache purge

## Rollback

Si un deploy a `main` rompe algo:
```bash
git revert <commit-del-squash-merge>
git push origin main
# CI/CD redeploya con el revert
```

No se force-pushea. No se reescribe historial de `main`.

## Code Review — checklist

Al revisar un PR, verificá:

- [ ] El código hace lo que dice el título del PR
- [ ] Los tests cubren el happy path + 1 edge case
- [ ] No hay código comentado ni `console.log`
- [ ] Las queries a la DB tienen RLS considerada
- [ ] Los tipos de TypeScript son correctos (no `any` sin justificación)
- [ ] La UI funciona en mobile (<768px) y desktop
- [ ] No hay secretos hardcodeados (usar `import.meta.env`)

## Escalando el equipo

El flujo actual está diseñado para 2–5 devs. Si el equipo crece (10, 20, 50), esto es lo que cambia:

### Ramas longevas (feature flags)

Con 20 devs, `main` recibe decenas de merges por día. Algunas features grandes no se pueden mergear en 3 días. Solución:

```
main ──────────────────────────────────────────────
  │
  ├── feat/grandes-mapas ────── 2 semanas
  │     └── feature flag: ENABLE_ADVANCED_MAPS=false
  │
  └── feat/login-v2 ── 3 días (merge normal)
```

Feature flags permiten mergear código inactivo a `main` sin exponerlo:
```ts
if (import.meta.env.VITE_ENABLE_ADVANCED_MAPS === "true") {
  return <AdvancedMap />;
}
return <BasicMap />;
```

### CODEOWNERS — propiedad del código

Archivo `.github/CODEOWNERS` para asignar reviewers automáticamente por paquete:

```
# @mapgis/app → equipo mobile
packages/mapgis/     @equipo-mobile

# @mapgis/supabase → equipo backend  
packages/supabase/   @equipo-backend

# @mapgis/shared → ambos equipos (2 approvals)
packages/shared/     @equipo-mobile @equipo-backend

# Infra / CI → DevOps
.github/  docker-compose.yml  @devops
```

### PRs — más revisores

| Tamaño del equipo | Revisores | Regla |
|---|---|---|
| 2–5 (actual) | 1 human | El otro dev revisa todo |
| 5–15 | 2 humans | 1 del equipo dueño + 1 de otro equipo (cross-team review) |
| 15+ | 2 humans + CODEOWNERS | Automático por paquete afectado |

### Rama `main` protegida

A partir de 5+ devs, `main` necesita protecciones en GitHub:

```
❌ Push directo a main
✅ Solo merge vía PR aprobado
✅ CI (lint, typecheck, test) obligatorio
✅ 1+ approvals (2+ con 15+ devs)
✅ Commits firmados (verified)
✅ Deploy automático solo si CI ✅
```

### CI/CD — jobs paralelos

Con 20 devs, el CI recibe 30–50 PRs/día. Optimizaciones necesarias:

```yaml
# pr.yml — jobs paralelos por paquete afectado
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      app: ${{ steps.filter.outputs.app }}
      supabase: ${{ steps.filter.outputs.supabase }}
    steps:
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            app: packages/mapgis/**
            supabase: packages/supabase/**

  test-app:
    needs: changes
    if: ${{ needs.changes.outputs.app == 'true' }}
    # solo corre tests de la app si cambió

  test-supabase:
    needs: changes
    if: ${{ needs.changes.outputs.supabase == 'true' }}
    # solo corre tests del backend si cambió
```

**Beneficio**: si un PR solo toca `@mapgis/app`, no se ejecutan las migraciones ni tests del backend. CI baja de 8min a 2min.

### Releases — versionado semántico

Con 20 devs, las releases necesitan changelog automatizado:

```bash
# Release desde main
git checkout main && git pull
bun run release       # conventional-changelog genera CHANGELOG.md
                      # bump version en package.json
                      # git tag v1.2.0
                      # push tag → CI deploya
```

Herramientas: `standard-version` o `semantic-release`.

### Equipos y squads

| Squad | Responsable de | Canales |
|---|---|---|
| Mobile | `@mapgis/app`, UI/UX, Capacitor | #squad-mobile |
| Backend | `@mapgis/supabase`, DB, Edge Functions, Drizzle | #squad-backend |
| Platform | CI/CD, monorepo tooling, Docker, bare metal | #squad-platform |

Cada squad tiene su propio backlog, pero comparten el mismo repo y deployment. Las decisiones cross-squad (tipos compartidos, API contracts) se documentan en `openspec/specs/`.

### Resumen — qué cambia al escalar

| Ahora (2 devs) | 5–10 devs | 20+ devs |
|---|---|---|
| PR a `main`, 1 reviewer | CODEOWNERS automático, 2 reviewers | Squads + cross-team review |
| Ramas <3 días | Feature flags para features largas | Feature flags + canary releases |
| CI secuencial (lint→type→test) | CI condicional por paquete | CI paralelo + staging deploy por PR |
| Releases manuales | `semantic-release` automático | Release train (semanal) + hotfix lane |
| 1 equipo | CODEOWNERS por paquete | Squads con ownership claro |
| Hooks locales (husky) | + CI checks en PR | + pre-merge validation bot (guarda contra regresiones) |
