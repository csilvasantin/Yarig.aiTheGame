# CODEX — Yarig.aiTheGame

## Estado actual (2026-04-04) — v5.5
**Todas las fases completadas + Philips Hue pulido.** Juego funcional con integración Yarig.ai bidireccional, control de luces Hue con sync bidireccional preciso, y modo DJ con strobe real.

## Qué es
Digital Twin de productividad: juego isométrico (fork de Xtanco v4.9) donde los personajes representan al equipo real de Yarig.ai. Las tareas del día controlan el comportamiento de los personajes y viceversa.

## Versiones
- v4.9 = xtanco-game base (motor original)
- v5.0 = fork con integración Yarig read-only + panel Yarig tab
- v5.1 = xtAPI, score→morale, celebraciones, polish
- v5.3 = dark UI redesign (glassmorphism, tabs, modern)
- v5.4 = Philips Hue integration (proxy, sync, tab lock)
- v5.5 = Hue polish: toggle preciso, DJ strobe real, sync bidireccional robusto (ACTUAL)

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
- DJ strobe → sincronizado con luces Hue (8 colores CIE xy, throttle 500ms)

### Hue ↔ Digital Lamp — sync bidireccional
- **Físico → digital**: polling cada 1.5s, la lámpara digital refleja el estado real (on/off, brillo, color CIE xy→RGB)
- **Digital → físico**: clic en la lámpara del juego controla la Mesita real
- **Protección anti-flood**: debounce 300ms en toggle, solo envía estado final
- **Ventana de protección**: 2.5s post-toggle donde el poll no revierte el visual
- **Cache optimista**: actualización inmediata de `hueRealState` al clicar
- **manualOff persistente**: apagado físico bloquea auto-encendido hasta que se encienda manualmente
- **DJ override**: el modo DJ fuerza luces encendidas ignorando manualOff
- **DJ off instantáneo**: al despedir al DJ, luces y visuales paran en el mismo frame (check `!s.fired`)

### Modo DJ
- Contratar DJ (role 4) activa modo fiesta completo
- **Luces reales**: strobe con 8 colores vivos (rojo, verde, azul, naranja, magenta, cyan, amarillo, púrpura), throttle 500ms, `djHueBusy` evita solapamiento
- **Lámpara digital**: colores inyectados en `hueRealState` → `hueLampColor()` renderiza CIE xy→RGB
- **EQ visualizer**: solo se muestra en segunda pantalla durante DJ activo
- **Al despedir DJ**: restauración inmediata a blanco cálido (ct 300, transición 200ms), limpieza de cache de color

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

## Diario de cambios

### 2026-04-04 — v5.5: Hue polish + DJ strobe
- **Toggle instantáneo**: visual se actualiza en el mismo frame, sin bloqueo
- **Debounce 300ms**: clics rápidos se agrupan, solo envía estado final al bridge
- **hueManualOverride inmediato**: se activa al clicar (antes esperaba 150ms del debounce, causando comandos fantasma)
- **Ventana anti-revert 2.5s**: tras toggle digital, el poll no revierte el visual
- **Cache optimista**: `hueRealState` se actualiza al clicar para que el game loop no revierta
- **manualOff persistente**: apagado físico bloquea `hueSyncWithGame` y Yarig task sync hasta re-encendido manual
- **DJ strobe real**: 8 colores CIE xy con throttle 500ms + `djHueBusy` anti-solapamiento
- **DJ instantáneo al despedir**: check `!s.fired` en 12 puntos del código — luces, booth, EQ, baile, mood paran en el mismo frame
- **DJ restaura luces**: al despedir DJ, Hue vuelve a blanco cálido (ct 300) con transición 200ms
- **EQ solo con DJ**: segunda pantalla muestra anuncios Admira cuando no hay DJ
- **Fix: auto-sync no re-enciende**: `hueSyncWithGame` y Yarig task sync respetan `elgatoState.manualOff`

### 2026-04-04 — v5.4–v5.4.4: Philips Hue integration
- v5.4: Proxy Hue endpoints, tab lock, `hueSend`, `hueAll`, `hueSyncWithGame`
- v5.4.1: Real-state polling, indicador digital ON/OFF
- v5.4.2: Bidireccional Mesita ↔ digital lamp
- v5.4.3: Intensidad + color CIE xy→RGB en lámpara digital
- v5.4.4: Polling 1.5s, `hueInitialPollDone` guard, fix startup sync

## Repos relacionados
- csilvasantin/Memorizer — Bot Telegram (clasificación, valoración YouTube, boost, Yarig commands)
- csilvasantin/Yarig.Telegram — Yarig.ai standalone via Telegram (13 comandos)
- csilvasantin/xtanco-game — Motor original v4.9 (NO modificar directamente, recibe sync)
