import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMapEvent, ZoomControl } from 'react-leaflet';
import type { Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  fetchDepartments,
  fetchPredictions,
  fetchStations,
  fetchWeather,
  type DepartmentsGeoJSON,
  type PredictionsResponse,
  type StationPrediction,
  type StationsGeoJSON,
  type WeatherResponse,
} from '../lib/api';
import { pinColor } from '../lib/aqi';
import { MapLegend } from './MapLegend';
import { StationPopup } from './StationPopup';
import { StationSheet } from './StationSheet';

/** Por debajo de esto la ficha se muestra como hoja inferior en vez de burbuja.
 *  768px es el corte habitual de tablet; lo que importa es que en pantalla
 *  tactil estrecha una burbuja anclada al pin no cabe bien. */
const CORTE_MOVIL = '(max-width: 767px)';

/** Sigue el media query en vivo: si giras el telefono, la ficha cambia de forma
 *  sin recargar. */
function useEsMovil(): boolean {
  const [esMovil, setEsMovil] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(CORTE_MOVIL);
    const aplicar = () => setEsMovil(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);
  return esMovil;
}

/** Tocar el mapa cierra la hoja. Los clicks en un CircleMarker no llegan aqui
 *  porque Leaflet los detiene en la capa, asi que no se cierra sola al elegir
 *  otra estacion. */
function CerrarAlTocarMapa({ onClose }: { onClose: () => void }) {
  useMapEvent('click', onClose);
  return null;
}

const HN_CENTER: [number, number] = [14.5, -86.5];
const HN_ZOOM = 7;

// Tope de alejamiento. Sin esto se puede llegar al mundo entero, que es pedir
// tiles de sitios que a nadie le interesan aqui. A zoom 6 Honduras entra de
// sobra en cualquier pantalla.
const ZOOM_MINIMO = 6;

// Filas y columnas de tiles que Leaflet conserva FUERA de la vista antes de
// tirarlos. Por defecto son 2, y por eso al desplazar el mapa lo que sale por un
// lado se borra: Leaflet destruye el <img> y al volver lo recrea, con su
// parpadeo, aunque el tile siga en la cache del navegador (Esri los sirve con
// max-age de 24 h). Con 8 cabe Honduras entera alrededor de la vista, asi que
// moverse por el pais ya no descarga nada.
const TILES_EN_RESERVA = 8;
// 6 h — igual que el cron que regenera predictions.json; refrescar más seguido
// solo re-leería el mismo JSON.
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
// El clima va por su cuenta: Open-Meteo no tiene API key, resuelve las 19
// estaciones en una llamada y el dato de origen se refresca cada 15 min.
const WEATHER_INTERVAL_MS = 30 * 60 * 1000;

// Polígonos de departamentos (GADM 4.1). En reposo son INVISIBLES: solo zonas
// sensibles al puntero.
//
// Antes se dibujaban con borde propio y relleno al 40%, y el resultado eran
// líneas dobles: los tiles de Esri YA traen los límites administrativos, y GADM
// es otra versión de la misma frontera con otra generalización, así que las dos
// no encajan y se ven desplazadas una respecto a la otra. El relleno además
// apagaba el mapa y creaba bandas donde dos departamentos se tocan.
//
// Ahora el dibujo lo pone el mapa y la interacción la ponen estos polígonos.
// fillOpacity 0.01 y no 0: con 0 exacto el path deja de recibir eventos en
// algunos navegadores, y se perderían el hover y el tooltip.
const DEPT_STYLE = {
  stroke: false,
  fill: true,
  fillColor: '#0f172a',
  fillOpacity: 0.01,
};

const DEPT_HOVER_STYLE = {
  stroke: true,
  fillColor: '#cbd5e1',   // slate-300
  fillOpacity: 0.6,
  color: '#475569',       // slate-600
  weight: 1.5,
};

// Borde remarcado al seleccionar un departamento con click
const DEPT_SELECTED_STYLE = {
  stroke: true,
  fillColor: '#cbd5e1',   // slate-300
  fillOpacity: 0.45,
  color: '#1e293b',       // slate-900 — borde bien oscuro y visible
  weight: 2.5,
  opacity: 1,
};

export default function StationsMap() {
  const [stations, setStations] = useState<StationsGeoJSON | null>(null);
  const [departments, setDepartments] = useState<DepartmentsGeoJSON | null>(null);
  const [preds, setPreds] = useState<PredictionsResponse | null>(null);
  const [predsLoading, setPredsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref al departamento actualmente seleccionado para poder reset-earlo
  const selectedDeptRef = useRef<Layer | null>(null);

  // Index O(1) por location_id
  const [weather, setWeather] = useState<WeatherResponse | null>(null);

  // En movil la ficha no va anclada al pin sino en una hoja inferior, asi que
  // hay que recordar que estacion se toco.
  const esMovil = useEsMovil();
  const [seleccionada, setSeleccionada] = useState<number | null>(null);

  const estacionSeleccionada = useMemo(
    () => stations?.features.find((f) => f.properties.id === seleccionada) ?? null,
    [stations, seleccionada],
  );

  const predsByLoc = useMemo(() => {
    const m = new Map<number, StationPrediction>();
    preds?.predictions.forEach((p) => m.set(p.location_id, p));
    return m;
  }, [preds]);

  // Fetch inicial: departamentos (estático) + stations + predictions
  useEffect(() => {
    let cancelled = false;

    fetchDepartments()
      .then((d) => !cancelled && setDepartments(d))
      .catch((e) => !cancelled && console.error('[departments]', e));

    fetchStations()
      .then((s) => !cancelled && setStations(s))
      .catch((e) => !cancelled && setError(String(e)));

    setPredsLoading(true);
    fetchPredictions()
      .then((p) => !cancelled && setPreds(p))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setPredsLoading(false));

    // Un fallo de clima no debe tumbar el mapa: se registra y se sigue.
    fetchWeather()
      .then((w) => !cancelled && setWeather(w))
      .catch((e) => !cancelled && console.error('[weather]', e));

    return () => {
      cancelled = true;
    };
  }, []);

  // Polling de predicciones cada 6 h (igual que el cron que las regenera)
  useEffect(() => {
    const id = setInterval(() => {
      fetchPredictions()
        .then(setPreds)
        .catch((e) => console.error('[poll] predictions:', e));
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Polling de clima cada 30 min, independiente del de predicciones
  useEffect(() => {
    const id = setInterval(() => {
      fetchWeather()
        .then(setWeather)
        .catch((e) => console.error('[poll] weather:', e));
    }, WEATHER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const handleManualRefresh = async () => {
    setPredsLoading(true);
    try {
      const p = await fetchPredictions();
      setPreds(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setPredsLoading(false);
    }
  };

  return (
    <div
      className={`relative h-screen w-screen${
        esMovil && seleccionada != null ? ' hoja-abierta' : ''
      }`}
    >
      <MapContainer
        center={HN_CENTER}
        zoom={HN_ZOOM}
        minZoom={ZOOM_MINIMO}
        scrollWheelZoom
        className="h-full w-full"
        /* El zoom por defecto va arriba a la izquierda, justo debajo de la
           cabecera: llevaba tapado desde siempre, en todas las tallas. Se mueve
           abajo a la derecha, encima de la atribucion. */
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        {/* Esri World Light Gray, no CARTO.
            CARTO cambio su politica y basemaps.cartocdn.com dejo de servir tiles
            anonimos: ahora devuelve HTTP 200 con un PNG valido que lleva
            "API KEY REQUIRED" estampado en diagonal. Como no es un error, nada
            fallaba y el mapa "funcionaba" con la marca encima, tambien en
            produccion. Y con cache-control de 180 dias, los navegadores que ya
            tenian tiles limpios seguian mostrandolos: el fallo parecia afectar
            solo a algunos dispositivos cuando en realidad afectaba a todos los
            visitantes nuevos.

            Esri no pide key ni cuenta. Ademas trae los nombres de los
            departamentos dibujados, que en movil importa: los tooltips de los
            poligonos son hover, y en una pantalla tactil no hay hover, asi que
            hasta ahora en el telefono los departamentos salian sin nombre.

            El servicio solo tiene tiles nativos hasta z16; maxNativeZoom hace que
            Leaflet reescale por encima en vez de pedir tiles que no existen. */}
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> · Límites: <a href="https://gadm.org/">GADM</a>'
          maxNativeZoom={16}
          maxZoom={19}
          keepBuffer={TILES_EN_RESERVA}
        />

        {/* Overlay sutil de departamentos para dar contexto geográfico */}
        {departments && (
          <GeoJSON
            key="departments"
            data={departments}
            style={() => DEPT_STYLE}
            onEachFeature={(feature, layer: Layer) => {
              const name = feature.properties?.NAME_1 ?? '';
              // Tooltip con nombre del departamento
              if (name) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (layer as any).bindTooltip(name, {
                  sticky: true,
                  direction: 'top',
                  className: 'dept-tooltip',
                });
              }
              // Hover + click: solo remarcar borde, sin rectángulo feo
              layer.on({
                mouseover: (e) => {
                  if (selectedDeptRef.current !== e.target) {
                    e.target.setStyle(DEPT_HOVER_STYLE);
                  }
                },
                mouseout: (e) => {
                  if (selectedDeptRef.current !== e.target) {
                    e.target.setStyle(DEPT_STYLE);
                  }
                },
                click: (e) => {
                  const clicked = e.target;
                  // Quitar selección anterior
                  if (selectedDeptRef.current && selectedDeptRef.current !== clicked) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (selectedDeptRef.current as any).setStyle(DEPT_STYLE);
                  }
                  // Toggle: si ya estaba seleccionado, deseleccionar
                  if (selectedDeptRef.current === clicked) {
                    clicked.setStyle(DEPT_STYLE);
                    selectedDeptRef.current = null;
                  } else {
                    clicked.setStyle(DEPT_SELECTED_STYLE);
                    selectedDeptRef.current = clicked;
                  }
                },
              });
            }}
          />
        )}

        {esMovil && <CerrarAlTocarMapa onClose={() => setSeleccionada(null)} />}

        {stations?.features.map((f) => {
          const lid = f.properties.id;
          const pred = predsByLoc.get(lid);
          // El pin usa el pm25 MEDIDO, no la clase predicha: la medicion da los
          // 5 niveles EPA sin margen de error, mientras que el modelo solo
          // distingue 2 clases. La prediccion se muestra en la tarjeta.
          const color = pinColor(pred?.has_data ? pred.sensor_readings?.pm25 : null);
          const [lon, lat] = f.geometry.coordinates;
          const hasData = !!pred?.has_data;
          const isStale = !!pred?.stale;

          return (
            <CircleMarker
              key={lid}
              center={[lat, lon]}
              radius={hasData ? 10 : 7}
              pathOptions={{
                color: isStale ? '#6b7280' : '#1f2937',
                weight: isStale ? 1 : 1.5,
                fillColor: color,
                fillOpacity: hasData ? (isStale ? 0.55 : 0.88) : 0.45,
                dashArray: isStale ? '4 3' : undefined,
              }}
              // Sin esto la hoja se cerraba en el mismo toque que la abria: a
              // diferencia de un Marker, los eventos de una capa vectorial SI
              // propagan al mapa en Leaflet, asi que el click del pin disparaba
              // tambien el "tocar el mapa cierra".
              bubblingMouseEvents={false}
              eventHandlers={
                esMovil ? { click: () => setSeleccionada(lid) } : undefined
              }
            >
              {/* En movil no se monta el Popup: la ficha va en hoja inferior.
                  maxWidth 320 porque el default de Leaflet son 300 y recortaria
                  la ultima columna del grafico. */}
              {!esMovil && (
                <Popup maxWidth={560} autoPanPadding={[16, 24]} keepInView>
                  <StationPopup
                    feature={f}
                    pred={pred}
                    weather={weather?.weather?.[String(f.properties.id)]}
                  />
                </Popup>
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Header overlay */}
      <header className="pointer-events-none absolute top-4 left-4 right-4 z-[1000] flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-xl bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 py-3 max-w-md">
          <h1 className="font-bold text-slate-900 text-lg leading-tight">
            FrankML <span className="text-slate-500 font-normal text-sm">— Aire en Honduras</span>
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {stations
              ? `${stations.metadata.station_count} estaciones · ${preds?.with_data ?? '…'} con datos`
              : 'Cargando estaciones…'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Color del pin = medición actual · predicción a +6h en cada ficha
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {predsLoading && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-900 shadow-sm flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Cargando predicciones…
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-900 shadow-sm max-w-xs">
              Error: {error}
            </div>
          )}
          <button
            onClick={handleManualRefresh}
            disabled={predsLoading}
            className="rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ↻ Refrescar
          </button>
          {preds && (
            <p className="text-[10px] text-slate-500 text-right">
              {preds.cache_hit
                ? `cache age: ${(preds.cache_age_s / 60).toFixed(1)} min`
                : 'just fetched'}
            </p>
          )}
        </div>
      </header>

      {/* En movil la leyenda queda debajo de la hoja: se oculta mientras esta
          abierta en vez de amontonarse. */}
      {!(esMovil && seleccionada != null) && <MapLegend />}

      {/* Hoja inferior: solo en movil, y fuera del MapContainer para que su
          posicion no dependa de donde este el pin. */}
      {esMovil && estacionSeleccionada && (
        <StationSheet
          feature={estacionSeleccionada}
          pred={predsByLoc.get(estacionSeleccionada.properties.id)}
          weather={weather?.weather?.[String(estacionSeleccionada.properties.id)]}
          onClose={() => setSeleccionada(null)}
        />
      )}
    </div>
  );
}
