import type { StationFeature, StationPrediction, StationWeather } from '../lib/api';
import {
  AQI_COLORS,
  AQI_LABELS_ES,
  pm25ToCategory,
  predColor,
  predLabel,
  predMessage,
} from '../lib/aqi';

interface Props {
  feature: StationFeature;
  pred?: StationPrediction;
  /** Clima de Open-Meteo. Se muestra JUNTO a la lectura del termometro, no en su
   *  lugar: el sensor corre unos +4 C sobre el modelo (va dentro del housing de
   *  particulas) pero el modelo exagera la amplitud diurna, y una observacion en
   *  campo cayo entre los dos. Sin verdad de campo sistematica, dar un solo
   *  numero seria inventarse una precision que no tenemos.
   *  El modelo de ML sigue usando el sensor internamente: se midio que cambiar
   *  la fuente no mueve el F1. */
  weather?: StationWeather;
}

/**
 * Formatea una lectura de sensor. null/undefined/NaN -> "—".
 * Antes el backend mandaba 0.0 para "sin sensor" y la UI pintaba "0.0 °C"
 * en Honduras; ahora manda null y aqui se muestra explicitamente como faltante.
 */
function fmt(v: number | null | undefined, digits: number, unit = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}${unit}`;
}

/**
 * Cuanto hace del dato, en horas, respecto a AHORA.
 *
 * Esto NO es sensor_ages_h: aquel mide el desfase entre sensores de la misma
 * estacion, y como todos reportan a la misma hora sale 0 practicamente siempre.
 * La antiguedad que le importa al usuario es la absoluta: OpenAQ agrega por
 * horas y el precompute corre cada 6h, asi que la mediana real ronda las 3h y
 * alguna estacion llega a 24. La tarjeta decia "Ahora" sin matizar nada.
 */
function antiguedadReal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const h = (Date.now() - t) / 3_600_000;
  if (h < 1.5) return null;              // menos de hora y media: es "ahora"
  if (h < 24) return `hace ${Math.round(h)}h`;
  return `hace ${Math.round(h / 24)}d`;
}

const HORAS_GRAFICO = [24, 12, 6, 3, 1, 0] as const;

/** Lectura de un lag de pm25, o null si no existe. Nunca 0 por defecto: un cero
 *  se pinta verde y se lee como "aire limpio" en vez de "sin dato". */
function lecturaLag(r: Record<string, number | null>, h: number): number | null {
  const v = r[`pm25_lag${h}h`];
  return v == null || !Number.isFinite(v) ? null : v;
}

/** Marca una lectura que no es de la ultima hora ("+3h"), para no dar por hecho
 *  que todos los sensores de la estacion reportaron a la vez. */
function edad(ages: Record<string, number> | undefined, key: string): string | null {
  const h = ages?.[key];
  if (h == null || !Number.isFinite(h) || h < 1) return null;
  return h < 24 ? `+${Math.round(h)}h` : `+${Math.round(h / 24)}d`;
}

export function StationPopup({ feature, pred, weather }: Props) {
  const { name, locality } = feature.properties;
  const cleanName = name?.replace(/\s*-\s*Sustenta Honduras\s*$/, '').trim() || `Station ${feature.properties.id}`;

  // Estacion sin lecturas de calidad del aire. El clima SI lo tenemos: viene de
  // Open-Meteo, que resuelve las 61 estaciones en una sola peticion, asi que
  // excluir estas no ahorraria nada y descartarlo solo empobrece el popup.
  if (!pred || !pred.has_data) {
    return (
      <div className="p-3.5 font-sans">
        <h3 className="font-bold text-slate-900 text-sm leading-tight mb-1">{cleanName}</h3>
        {locality && <p className="text-xs text-slate-500 mb-2">{locality}</p>}
        <p className="text-xs text-slate-600 italic">
          {pred?.error || 'Sin datos recientes en las últimas 25h'}
        </p>
        {weather && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Ambiente</span>
              <span className="text-[11px] font-semibold text-slate-800 tabular-nums">
                {fmt(weather.temperature, 1, '°C')} · {fmt(weather.relativehumidity, 0, '%')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] text-slate-600">{weather.weather_text}</span>
              <span className="text-[9px] text-slate-400">Open-Meteo</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const r      = pred.sensor_readings!;
  const p      = pred.prediction!;
  const cat    = p.category;
  const isStale = pred.stale === true;
  const staleLabel = isStale && pred.stale_age_h != null
    ? pred.stale_age_h < 48
      ? `hace ${Math.round(pred.stale_age_h)}h`
      : `hace ${Math.round(pred.stale_age_h / 24)}d`
    : null;
  const currentCat = pm25ToCategory(r.pm25);
  // "Va a empeorar" = el modelo predice algo peor que la categoria medida ahora.
  // Se compara por severidad, no por indice, porque prediccion y medicion usan
  // vocabularios distintos: el modelo dice Good/Caution y la medicion da los 5
  // niveles EPA. 'Caution' equivale a "por encima de Good".
  const futureWorse = (() => {
    const severidad: Record<string, number> = {
      Good: 0, Caution: 1,
      Moderate: 1, 'Unhealthy for Sensitive': 2, Unhealthy: 3, 'Very Unhealthy': 4,
    };
    const ahora   = severidad[currentCat] ?? 0;
    const futuro  = severidad[cat] ?? 0;
    return futuro > ahora;
  })();

  return (
    <div className="font-sans">
      {/* Header con color */}
      <div
        className="px-3.5 py-2.5 rounded-t-xl"
        style={{ backgroundColor: AQI_COLORS[cat], color: cat === 'Very Unhealthy' ? '#fff' : '#111' }}
      >
        <h3 className="font-bold text-sm leading-tight">{cleanName}</h3>
        {locality && <p className="text-xs opacity-80">{locality}</p>}
      </div>

      <div className="p-3.5 space-y-3">
        {/* Aviso de datos desactualizados */}
        {isStale && (
          <div className="px-3.5 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
            <span className="text-amber-500 text-xs">⚠</span>
            <span className="text-[11px] text-amber-700">
              Última lectura disponible{staleLabel ? ` — ${staleLabel}` : ''}. Sin lags.
            </span>
          </div>
        )}

      {/* Lectura actual */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Ahora
              {antiguedadReal(pred.readings_timestamp) && (
                <span
                  className="ml-1.5 normal-case tracking-normal font-normal text-amber-600"
                  title={`Última lectura de la estación: ${pred.readings_timestamp}. OpenAQ agrega por horas y el lote se recalcula cada 6 h.`}
                >
                  {antiguedadReal(pred.readings_timestamp)}
                </span>
              )}
            </span>
            <span className="text-[10px] text-slate-400">PM2.5 µg/m³</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{r.pm25.toFixed(1)}</span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: AQI_COLORS[currentCat], color: currentCat === 'Very Unhealthy' ? '#fff' : '#111' }}
            >
              {AQI_LABELS_ES[currentCat]}
            </span>
          </div>
        </div>

        {/* Predicción +6h */}
        <div className="pt-2 border-t border-slate-200">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Predicción +6h {futureWorse && <span className="text-orange-600">↑</span>}
            </span>
            <span className="text-[10px] text-slate-400">confianza {(p.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full border border-slate-700"
              style={{ backgroundColor: predColor(cat) }}
            />
            <span className="text-sm font-semibold text-slate-900">{predLabel(cat)}</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
            {predMessage(cat)}
          </p>
        </div>

        {/* Temperatura y humedad: se muestran LAS DOS fuentes, etiquetadas.
            Medido contra 181 horas en Colonia Los Pinos: el termometro de la
            estacion va dentro del housing del sensor de particulas y corre unos
            +4 C sobre el modelo; pero el modelo (malla ~9 km) exagera la
            amplitud diurna y se pasa a media manana. Ninguna es verdad de campo,
            asi que dar un solo numero seria fingir una precision que no hay. */}
        <div className="pt-2 border-t border-slate-200 space-y-1">
          <div
            className="flex items-baseline justify-between gap-2"
            title="Termómetro de la propia estación. Comparte carcasa con el sensor de partículas, así que suele leer varios grados por encima del ambiente."
          >
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Estación</span>
            <span className="text-[11px] font-semibold text-slate-800 tabular-nums">
              {fmt(r.temperature, 1, '°C')} · {fmt(r.relativehumidity, 0, '%')}
              {edad(pred.sensor_ages_h, 'temperature') && (
                <span className="ml-1 font-normal text-slate-400">
                  {edad(pred.sensor_ages_h, 'temperature')}
                </span>
              )}
            </span>
          </div>

          <div
            className="flex items-baseline justify-between gap-2"
            title="Modelo meteorológico Open-Meteo sobre una malla de ~9 km. No es una medición en el sitio: tiende a exagerar la subida de media mañana."
          >
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Ambiente</span>
            <span className="text-[11px] font-semibold text-slate-800 tabular-nums">
              {fmt(weather?.temperature, 1, '°C')} · {fmt(weather?.relativehumidity, 0, '%')}
              {weather?.apparent != null && (
                <span className="ml-1 font-normal text-slate-400">
                  sens. {weather.apparent.toFixed(0)}°
                </span>
              )}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">PM1</span>
            <span className="text-[11px] font-semibold text-slate-800 tabular-nums">
              {fmt(r.pm1, 1)}
              {edad(pred.sensor_ages_h, 'pm1') && (
                <span className="ml-1 font-normal text-slate-400">
                  {edad(pred.sensor_ages_h, 'pm1')}
                </span>
              )}
            </span>
          </div>

          {weather && (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] text-slate-600">
                {weather.weather_text}
                {weather.precipitation != null && weather.precipitation > 0 &&
                  ` · ${weather.precipitation.toFixed(1)} mm`}
                {weather.wind_kmh != null && ` · viento ${weather.wind_kmh.toFixed(0)} km/h`}
              </span>
              <span className="text-[9px] text-slate-400 whitespace-nowrap">Open-Meteo</span>
            </div>
          )}
        </div>

        {/* Mini-historico de PM2.5. Las barras se dibujaban con height en % dentro
            de una columna sin altura propia, asi que el porcentaje resolvia a 0 y
            no se veia ninguna: solo las etiquetas. Ahora la zona del grafico es un
            flex-1 con altura definida, contra la que el % si resuelve. */}
        {HORAS_GRAFICO.some((h) => h !== 0 && lecturaLag(r, h) != null) && (
          <div className="pt-2 border-t border-slate-200">
            <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1.5">
              PM2.5 últimas horas
            </div>
            <div className="flex items-stretch justify-between gap-1 h-14">
              {HORAS_GRAFICO.map((h) => {
                const v = h === 0 ? r.pm25 : lecturaLag(r, h);
                const isNow = h === 0;
                const maximo = Math.max(
                  ...HORAS_GRAFICO.map((hr) => (hr === 0 ? r.pm25 : lecturaLag(r, hr)) ?? 0),
                  1,
                );
                // Sin lectura no se pinta barra: un 0 verde afirmaría "aire limpio"
                // cuando lo que pasa es que no hay dato.
                const alturaPct = v == null ? 0 : Math.max(6, (v / maximo) * 100);
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5 h-full">
                    <div className="flex-1 w-full flex items-end min-h-0">
                      {v == null ? (
                        <div
                          className="w-full h-1 rounded-sm bg-slate-200"
                          title="sin lectura"
                        />
                      ) : (
                        <div
                          className="w-full rounded-sm transition-all"
                          style={{
                            height: `${alturaPct}%`,
                            backgroundColor: AQI_COLORS[pm25ToCategory(v)],
                            opacity: isNow ? 1 : 0.65,
                            border: isNow ? '1px solid #1f2937' : 'none',
                          }}
                          title={`${v.toFixed(1)} µg/m³`}
                        />
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 leading-none">
                      {isNow ? 'now' : `-${h}h`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
