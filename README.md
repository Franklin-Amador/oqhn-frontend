# OQHN — Frontend

Interfaz web del clasificador de calidad del aire para Honduras. Muestra un mapa interactivo con
las estaciones OpenAQ, la medición actual de PM2.5 y la predicción a +6 horas del modelo.

> **Dos vocabularios, a propósito.** El mapa colorea con las **5 categorías EPA** derivadas del
> PM2.5 *medido* (una tabla de consulta, siempre fiable). La *predicción* del modelo tiene solo
> **2 clases**, `Good` y `Caution`, porque con 5 el dataset de Honduras no da. No son lo mismo y
> la UI no debe mezclarlas: `AQI_*` en `lib/aqi.ts` es lo primero, `PRED_*` lo segundo.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | [Astro 6](https://astro.build) — SSG/SSR mínimo, islas de React |
| UI interactiva | [React 19](https://react.dev) (`client:only="react"`) |
| Mapa | [Leaflet 1.9](https://leafletjs.com) + [react-leaflet 5](https://react-leaflet.js.org) |
| Estilos | [Tailwind CSS 4](https://tailwindcss.com) (Vite plugin, sin `tailwind.config`) |
| Bundler | Vite 7 (override en `package.json`) |
| Datos | FastAPI local en `http://127.0.0.1:8001` |
| Clima | Open-Meteo vía la API (`/stations/weather`), sin API key |
| Polígonos | GADM 4.1 — 18 departamentos de Honduras (`/public/honduras-departments.json`) |

## Estructura

```
src/
├── pages/
│   └── index.astro          # Página principal — monta el island del mapa
├── layouts/
│   └── Layout.astro         # HTML base + Leaflet CSS CDN
├── components/
│   ├── StationsMap.tsx      # Island principal: mapa + pins + polling
│   ├── StationPopup.tsx     # Popup de cada estación (lectura actual + predicción)
│   └── MapLegend.tsx        # Leyenda de categorías AQI
├── lib/
│   ├── api.ts               # Cliente tipado para la FastAPI
│   └── aqi.ts               # Constantes y helpers de categorías AQI
└── styles/
    └── global.css           # @import tailwindcss + customizaciones Leaflet
```

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env (solo si no existe)
echo "PUBLIC_API_URL=http://127.0.0.1:8001" > .env

# 3. Levantar la FastAPI primero (en /api)
#    cd ../api && uvicorn main:app --port 8001

# 4. Levantar el dev server
npm run dev
# → http://localhost:4321
```

> **Primera vez:** Vite tarda ~5 s extra en pre-bundlear `leaflet` y `react-leaflet`.
> Ya está configurado con `optimizeDeps.include` para hacerlo al arranque, no en la
> primera petición — la pantalla en blanco en arranques fríos está corregida.

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PUBLIC_API_URL` | `http://127.0.0.1:8001` | Base URL de la FastAPI |

Crea un `.env` en esta carpeta (no se sube a git):

```
PUBLIC_API_URL=http://127.0.0.1:8001
```

## Comportamiento del mapa

- **Pins grandes** (r=10, opacidad alta) → estación con datos en las últimas 25 h
- **Pins pequeños** (r=7, opacidad baja, gris) → sin datos recientes
- **Color del pin** = categoría EPA del **PM2.5 medido ahora** (`pinColor(sensor_readings.pm25)`),
  no de la predicción. Se cambió a propósito: pintar el mapa con la predicción hacía que el pin
  y el popup contaran cosas distintas sin avisar.
- **Polígonos grises** = departamentos de Honduras (GADM 4.1), tooltip al hacer hover
- **Popup** muestra: lectura actual PM2.5, predicción +6 h con confianza, temp/humedad/PM1 y mini-gráfico de historial

## Polling y frescura de datos

El frontend re-lee las predicciones cada **6 horas** en segundo plano (sin recargar la página). El botón "↻ Refrescar" vuelve a pedirlas al backend de inmediato — lee el JSON ya calculado, no dispara ningún recálculo.

Las predicciones no se calculan al vuelo: un GitHub Action las precalcula cada 6 h y las deja en Vercel Blob, y la API solo sirve ese JSON. Por eso refrescar más seguido no trae datos más nuevos — y por eso ninguna acción del usuario puede provocar una llamada a la API de OpenAQ.

| Endpoint | Origen | Se regenera |
|----------|--------|-------------|
| `GET /stations` | `stations.json` en Blob | cada 6 h |
| `GET /stations/predictions` | `predictions.json` en Blob | cada 6 h |
| `GET /stations/weather` | Open-Meteo, caché en la API | cada 30 min |

El clima va aparte a propósito: Open-Meteo no tiene API key ni cuota que arriesgar, así que puede
refrescarse cada 30 min. El PM2.5 sigue el cron de 6 h porque sale de OpenAQ y no cambia lo
suficiente en media hora para justificar el coste.

## Build para producción

```bash
npm run build   # genera /dist
npm run preview # sirve el build estático en local
```

Para deploy en Vercel: conectar el repo, `Root Directory = frontend`, y configurar
`PUBLIC_API_URL` apuntando a la API desplegada.
