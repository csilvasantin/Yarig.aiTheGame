# CODEX — Yarig.aiTheGame

## Estado actual (2026-04-04) — v5.4
**Todas las fases completadas + Philips Hue.** Juego funcional con integración Yarig.ai bidireccional y control de luces Hue.

## Qué es
Digital Twin de productividad: juego isométrico (fork de Xtanco v4.9) donde los personajes representan al equipo real de Yarig.ai. Las tareas del día controlan el comportamiento de los personajes y viceversa.

## Versiones
- v4.9 = xtanco-game base (motor original)
- v5.0 = fork con integración Yarig read-only + panel Yarig tab
- v5.1 = xtAPI, score→morale, celebraciones, polish
- v5.3 = dark UI redesign (glassmorphism, tabs, modern)
- v5.4 = Philips Hue integration (ACTUAL)

## Arquitectura
```
Browser (game.html) → Node.js proxy (server.js:9124) → Yarig.ai API
```

## Flag: YARIG_LIVE_ENABLED
- `true` = modo live, conecta con Yarig.ai (Yarig.aiTheGame)
- `false` = modo vanilla, juego sin conexión (para sincronizar mejoras a xtanco-game)

## Proxy (server.js) — FUNCIONANDO
- Login automático email/password (PHP session, cookie jar, auto-reauth)
- SSL disabled (yarig.ai cert incompleto)
- Endpoints Yarig:
  - GET /yarig/today, /yarig/team, /yarig/score, /yarig/status, /yarig/notifications
  - POST /yarig/task/open, /yarig/task/close, /yarig/task/add, /yarig/clocking
- Endpoints Hue:
  - GET /hue/lights, /hue/groups, /hue/status
  - PUT /hue/lights/:id/state, /hue/groups/:id/action

## Juego (game.html) — v5.1
Fork de xtanco-game v4.9 (7272+ líneas). Motor isométrico Canvas 2D, vanilla JS.
Incluye: clima, signage videos, EQ visualizer, mood icons, día/noche, LED banner.

### Integración Yarig implementada
- **yarigPoll()** cada 30s sincroniza tareas de Yarig.ai
- **yarigSyncStaff()** mapea tareas → personajes con detección de transiciones
- **Bocadillos**: azul=activa, amarillo=pausada, verde=finalizada
- **Panel Yarig**: 5ª pestaña (tecla 5) con controles ▶️⏸✅ por tarea
- **Celebración**: confeti (🎉✅) floating text al finalizar una tarea
- **Score→Morale**: puntuación Yarig se traduce en morale del staff
- **HUD**: indicador 🎯 + nº tareas activas arriba a la derecha
- **xtAPI**: yarigStatus/Tasks/Team/Sync/Start/Pause/Finish

### xtAPI Yarig commands
```js
xtAPI.yarigStatus()    // estado conexión + contadores
xtAPI.yarigTasks()     // lista tareas con estado
xtAPI.yarigTeam()      // equipo completo
xtAPI.yarigSync()      // forzar resincronización
xtAPI.yarigStart(idx)  // iniciar tarea por índice
xtAPI.yarigPause(idx)  // pausar tarea
xtAPI.yarigFinish(idx) // finalizar tarea
```

### xtAPI Hue commands
```js
xtAPI.hueStatus()          // estado bridge + luces
xtAPI.hueToggle()          // encender/apagar todas
xtAPI.hueColor(r,g,b)      // color RGB (0-255)
xtAPI.hueScene('focus')     // escenas: focus, relax, party, alert, celebrate, off
xtAPI.hueBrightness(254)    // brillo (1-254)
```

### Hue ↔ Yarig auto-sync
- Tarea finalizada → flash verde celebración (3s)
- Todas completadas → color loop (fiesta)
- Tarea activa → blanco frío enfocado (ct 250)
- Sin tareas activas → blanco cálido relajado (ct 400)
- DJ strobe → sincronizado con luces Hue

## Config necesaria (.env)
```
YARIG_EMAIL=<email de yarig.ai>
YARIG_PASSWORD=<password de yarig.ai>
PORT=9124
HUE_BRIDGE_IP=<IP del Hue Bridge>
HUE_API_KEY=<API key del Hue Bridge>
```

## Philips Hue — Setup
1. Bridge se descubre vía https://discovery.meethue.com/
2. Pulsar botón físico del Bridge
3. `curl -sk -X POST https://<IP>/api -d '{"devicetype":"yarig_game#carlos"}'`
4. Guardar el `username` devuelto como HUE_API_KEY en .env
- Bridge actual: 192.168.1.72 (SalónVillaAdmira)
- Luces: 1=Mesita Go lamp, 2=Outdoor Izquierda

## Cómo ejecutar
```bash
/opt/homebrew/bin/node server.js
# Abrir http://localhost:9124
```

## Sincronizar mejoras a xtanco-game
1. Copiar game.html a xtanco-game/
2. Cambiar `YARIG_LIVE_ENABLED=true` → `false`
3. Revertir título a "XTANCO — Digital Twin"
4. Revertir subtítulos a "SIMULADOR DE ESTANCO DIGITAL"

## Datos clave
- Carlos Silva: id_user=14, id_company=22
- Proyecto Admira: id_project=312
- Cliente Admira Digital Networks: id_customer=2396
- Node.js: /opt/homebrew/bin/node
- Python 3.13: /usr/local/bin/python3.13
- API Yarig: docs completos en Yarig.Telegram/docs/yarig_api_map.md

## Repos relacionados
- csilvasantin/Memorizer — Bot Telegram (clasificación, valoración YouTube, boost, Yarig commands)
- csilvasantin/Yarig.Telegram — Yarig.ai standalone via Telegram (13 comandos)
- csilvasantin/xtanco-game — Motor original v4.9 (NO modificar directamente, recibe sync)
