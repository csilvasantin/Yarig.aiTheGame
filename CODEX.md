# CODEX — Yarig.aiTheGame

## Estado actual (2026-04-04)
**Fase 1 COMPLETADA** — Repo creado, proxy funcionando, juego base copiado.

## Qué es
Digital Twin de productividad: juego isométrico (fork de Xtanco) donde los personajes representan al equipo real de Yarig.ai. Las tareas del día en Yarig.ai controlan el comportamiento de los personajes.

## Arquitectura
```
Browser (game.html) → Node.js proxy (server.js:9124) → Yarig.ai API
```

## Proxy (server.js) — FUNCIONANDO
- Login automático con email/password (PHP session, cookie jar)
- SSL disabled (yarig.ai cert incompleto)
- Endpoints implementados:
  - GET /yarig/today — tareas + jornada del día
  - GET /yarig/team — 23 miembros del equipo
  - GET /yarig/score — puntuación
  - POST /yarig/task/open — iniciar/reanudar tarea
  - POST /yarig/task/close — pausar (finished=0) o finalizar (finished=1)
  - POST /yarig/task/add — crear tarea
  - POST /yarig/clocking — fichar entrada/salida
  - GET /yarig/status — estado conexión

## Juego (game.html) — SIN MODIFICAR AÚN
Fork de xtanco-game v2.4. Motor isométrico 800x500, Canvas 2D, vanilla JS.
4370 líneas. Personajes chibi con animaciones trabajo/idle/baile.

## Fases pendientes

### Fase 2 — Sync read-only (PRÓXIMA)
1. Añadir bloque YARIG config + yarigFetch() en game.html
2. yarigPoll() cada 30s desde el game loop
3. yarigSyncStaff() — mapear equipo Yarig → personajes del juego
4. Bocadillos con descripción de tarea real
5. Indicador conexión en top bar

### Fase 3 — Acciones bidireccionales
1. Panel "Yarig" tab con controles iniciar/pausar/finalizar
2. yarigAction() en game.html
3. Handlers en doAction()

### Fase 4 — Polish
1. xtAPI.yarig*() para control desde Claude
2. Animaciones pulidas
3. Score → morale mapping
4. Persistencia roster en localStorage

## Config necesaria (.env)
```
YARIG_EMAIL=<email de yarig.ai>
YARIG_PASSWORD=<password de yarig.ai>
PORT=9124
```

## Cómo ejecutar
```bash
/opt/homebrew/bin/node server.js
# Abrir http://localhost:9124
```

## Datos clave
- Carlos Silva: id_user=14, id_company=22
- Proyecto Admira: id_project=312
- Cliente Admira Digital Networks: id_customer=2396
- Node.js: /opt/homebrew/bin/node
- API Yarig documentada en Yarig.Telegram/docs/yarig_api_map.md

## Repos relacionados
- csilvasantin/Memorizer — Bot Telegram (clasificación, valoración, boost)
- csilvasantin/Yarig.Telegram — Yarig.ai CLI via Telegram (13 comandos)
- csilvasantin/xtanco-game — Motor original del juego (NO modificar)
