import type { StationFeature, StationPrediction, StationWeather } from '../lib/api';
import {
  AQI_COLORS,
  AQI_HEALTH_MSG,
  AQI_LABELS_ES,
  pm25ToCategory,
  predLabel,
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
 * Severidad por NOMBRE, nunca por indice.
 *
 * La tarjeta maneja dos vocabularios: la medicion da los 5 niveles EPA y el
 * modelo predice 2 clases (Good/Caution). Ademas LabelEncoder ordena
 * alfabeticamente, asi que en el modelo 'Caution'=0 y 'Good'=1 — el indice va al
 * reves que la gravedad. Comparar cualquier cosa que no sea el nombre invierte
 * el resultado sin que nada falle.
 */
const SEVERIDAD: Record<string, number> = {
  Good: 0,
  Caution: 1,
  Moderate: 1,
  'Unhealthy for Sensitive': 2,
  Unhealthy: 3,
  'Very Unhealthy': 4,
};

/** Texto en primera persona del plural sobre lo que se espera, comparado con lo
 *  que hay ahora. Se habla de CAMBIO y no de categoria a proposito: decir
 *  "ahora Moderada, en 6h Precaucion" obliga al lector a mapear dos escalas
 *  distintas en la cabeza. "Se mantiene" no obliga a nada. */
function pronostico(actual: string, futuro: string) {
  const a = SEVERIDAD[actual] ?? 0;
  const f = SEVERIDAD[futuro] ?? 0;
  if (f > a) return { texto: 'Puede empeorar', flecha: '↗', clase: 'text-orange-700' };
  if (f < a) return { texto: 'Debería mejorar', flecha: '↘', clase: 'text-emerald-700' };
  return { texto: 'Se mantiene igual', flecha: '→', clase: 'text-slate-600' };
}

/** La confianza como palabra, no como porcentaje.
 *
 *  Un "98%" invita a leerse como una garantia, y no lo es: es la probabilidad
 *  que el modelo asigna a su propia clase. El numero exacto sigue disponible en
 *  los detalles para quien lo quiera. */
function confianzaEnPalabras(c: number): string {
  if (c >= 0.85) return 'confianza alta';
  if (c >= 0.65) return 'confianza media';
  return 'confianza baja';
}

/**
 * Formatea una lectura de sensor. null/undefined/NaN -> "—".
 * Antes el backend mandaba 0.0 para "sin sensor" y la UI pintaba "0.0 °C"
 * en Honduras; ahora manda null y aqui se muestra explicitamente como faltante.
 */
function fmt(v: number | null | undefined, digits: number, unit = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits).replace('.', ',')}${unit}`;
}

/**
 * Cuanto hace del dato, en horas, respecto a AHORA.
 *
 * Esto NO es sensor_ages_h: aquel mide el desfase entre sensores de la misma
 * estacion, y como todos reportan a la misma hora sale 0 practicamente siempre.
 * La antiguedad que le importa al usuario es la absoluta: OpenAQ agrega por
 * horas y el precompute corre cada 6h, asi que la mediana real ronda las 3h.
 */
function antiguedadReal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const h = (Date.now() - t) / 3_600_000;
  if (h < 1.5) return null;              // menos de hora y media: es "ahora"
  if (h < 24) return `hace ${Math.round(h)} h`;
  return `hace ${Math.round(h / 24)} d`;
}

const HORAS_GRAFICO = [24, 12, 6, 3, 1, 0] as const;

/** Lectura de un lag de pm25, o null si no existe. Nunca 0 por defecto: un cero
 *  se pinta verde y se lee como "aire limpio" en vez de "sin dato". */
function lecturaLag(r: Record<string, number | null>, h: number): number | null {
  const v = r[`pm25_lag${h}h`];
  return v == null || !Number.isFinite(v) ? null : v;
}

/** Marca una lectura que no es de la ultima hora, para no dar por hecho que
 *  todos los sensores de la estacion reportaron a la vez. */
function edad(ages: Record<string, number> | undefined, key: string): string | null {
  const h = ages?.[key];
  if (h == null || !Number.isFinite(h) || h < 1) return null;
  return h < 24 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} d`;
}

/** Negro o blanco segun el fondo, para que la cabecera se lea sobre morado
 *  (Very Unhealthy) igual que sobre amarillo. */
function tintaSobre(cat: string): string {
  return cat === 'Very Unhealthy' || cat === 'Unhealthy' ? '#ffffff' : '#111827';
}

export function StationPopup({ feature, pred, weather }: Props) {
  const { name, locality } = feature.properties;
  const cleanName =
    name?.replace(/\s*-\s*Sustenta Honduras\s*$/, '').trim() ||
    `Estación ${feature.properties.id}`;

  // Estacion sin lecturas de calidad del aire. El clima SI lo tenemos: viene de
  // Open-Meteo, que resuelve las 61 estaciones en una sola peticion, asi que
  // excluir estas no ahorraria nada y descartarlo solo empobrece la tarjeta.
  if (!pred || !pred.has_data) {
    return (
      <div className="w-[min(19rem,calc(100vw-5rem))] font-sans">
        <div className="bg-slate-200 px-4 py-3">
          <h3 className="text-[15px] font-bold leading-tight text-slate-900">{cleanName}</h3>
          {locality && <p className="text-xs text-slate-600">{locality}</p>}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm leading-snug text-slate-700">
            Esta estación no ha enviado mediciones en las últimas 25 horas.
          </p>
          {weather && (
            <div className="border-t border-slate-200 pt-3 text-sm text-slate-700">
              <span className="font-semibold">
                {fmt(weather.temperature, 0, '°')} · {fmt(weather.relativehumidity, 0, '%')} de humedad
              </span>
              <span className="text-slate-400"> · </span>
              <span className="text-slate-500">{weather.weather_text}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const r = pred.sensor_readings!;
  const p = pred.prediction!;
  const catAhora = pm25ToCategory(r.pm25);
  const colorAhora = AQI_COLORS[catAhora];
  const pron = pronostico(catAhora, p.category);
  const desfase = antiguedadReal(pred.readings_timestamp);
  const isStale = pred.stale === true;

  const maximo = Math.max(
    ...HORAS_GRAFICO.map((hr) => (hr === 0 ? r.pm25 : lecturaLag(r, hr)) ?? 0),
    1,
  );
  const hayHistorial = HORAS_GRAFICO.some((h) => h !== 0 && lecturaLag(r, h) != null);

  return (
    <div className="max-h-[70vh] w-[min(19rem,calc(100vw-5rem))] overflow-y-auto overscroll-contain font-sans">
      {/* Cabecera: se colorea con la MEDICION, igual que el pin que el usuario
          acaba de pulsar. Antes usaba la clase predicha, asi que un pin naranja
          abria una tarjeta verde y no habia forma de entender por que. */}
      <div
        className="px-4 py-3"
        style={{ backgroundColor: colorAhora, color: tintaSobre(catAhora) }}
      >
        <h3 className="text-[15px] font-bold leading-tight">{cleanName}</h3>
        {locality && <p className="text-xs opacity-75">{locality}</p>}
      </div>

      <div className="divide-y divide-slate-200">
        {/* ── El veredicto. Es lo primero que se lee y va en palabras, no en
            numeros: "12,7 µg/m³" no le dice nada a casi nadie, "Aire limpio"
            si. El numero queda debajo como evidencia. ───────────────────── */}
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Ahora
          </p>
          <p className="mt-0.5 text-[22px] font-bold leading-tight text-slate-900">
            {AQI_LABELS_ES[catAhora]}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-500 tabular-nums">
            {fmt(r.pm25, 1)} µg/m³ de PM2.5
            {desfase && <span className="text-amber-700"> · {desfase}</span>}
          </p>
          <p className="mt-2 text-[13.5px] leading-snug text-slate-700">
            {AQI_HEALTH_MSG[catAhora]}
          </p>
          {isStale && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] leading-snug text-amber-800">
              Es la última medición disponible, no una lectura reciente.
            </p>
          )}
        </div>

        {/* ── El pronostico, en terminos de CAMBIO. Decir "ahora Moderada, en 6h
            Precaucion" obliga a mapear dos escalas distintas; "se mantiene
            igual" no obliga a nada. ─────────────────────────────────────── */}
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Dentro de 6 horas
          </p>
          <p className={`mt-0.5 flex items-baseline gap-1.5 text-[16px] font-bold leading-tight ${pron.clase}`}>
            <span aria-hidden="true">{pron.flecha}</span>
            {pron.texto}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Se espera <span className="font-medium text-slate-700">{predLabel(p.category).toLowerCase()}</span>
            {' · '}
            {confianzaEnPalabras(p.confidence)}
          </p>
        </div>

        {/* ── Tendencia reciente. Etiquetas en español y con unidad, que antes
            decian "now" en una interfaz en castellano. ──────────────────── */}
        {hayHistorial && (
          <div className="px-4 py-3.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Últimas 24 horas
            </p>
            <div className="flex h-16 items-stretch justify-between gap-1.5">
              {HORAS_GRAFICO.map((h) => {
                const v = h === 0 ? r.pm25 : lecturaLag(r, h);
                const esAhora = h === 0;
                // Sin lectura no se pinta barra: un 0 verde afirmaria "aire
                // limpio" cuando lo que pasa es que no hay dato.
                const alturaPct = v == null ? 0 : Math.max(8, (v / maximo) * 100);
                return (
                  <div key={h} className="flex h-full flex-1 flex-col items-center gap-1">
                    <div className="flex min-h-0 w-full flex-1 items-end">
                      {v == null ? (
                        <div className="h-1 w-full rounded-sm bg-slate-200" title="sin lectura" />
                      ) : (
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${alturaPct}%`,
                            backgroundColor: AQI_COLORS[pm25ToCategory(v)],
                            opacity: esAhora ? 1 : 0.6,
                            outline: esAhora ? '1.5px solid #334155' : 'none',
                            outlineOffset: '-1.5px',
                          }}
                          title={`${v.toFixed(1)} µg/m³`}
                        />
                      )}
                    </div>
                    <span className="text-[10px] leading-none text-slate-500">
                      {esAhora ? 'ahora' : `−${h}h`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Todo lo tecnico, plegado. No se pierde nada: simplemente deja de
            competir por la atencion de quien solo quiere saber si puede salir a
            correr. ──────────────────────────────────────────────────────── */}
        {/* py-3 y ancho completo a proposito: un objetivo tactil de 44px. Con
            el padding anterior el area pulsable eran ~20px de alto, que en un
            movil es una loteria. */}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3.5 text-[13px] font-medium text-slate-500 outline-none select-none hover:text-slate-800 focus-visible:text-slate-800">
            <span className="inline-block transition-transform group-open:rotate-90">›</span>
            Ver detalles de la estación
          </summary>
          <div className="px-4 pb-3">

          <dl className="space-y-2 text-[12.5px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Partículas finas (PM1)</dt>
              <dd className="font-medium text-slate-800 tabular-nums">
                {fmt(r.pm1, 1)}
                {edad(pred.sensor_ages_h, 'pm1') && (
                  <span className="ml-1 font-normal text-slate-400">
                    {edad(pred.sensor_ages_h, 'pm1')}
                  </span>
                )}
              </dd>
            </div>

            {/* Se muestran LAS DOS fuentes de temperatura, etiquetadas. Medido
                contra 181 horas en Colonia Los Pinos: el termometro va dentro
                del housing del sensor de particulas y corre unos +4 C sobre el
                modelo; pero el modelo (malla ~9 km) exagera la amplitud diurna
                y se pasa a media manana. Ninguna es verdad de campo, asi que
                dar un solo numero seria fingir una precision que no hay. */}
            <div
              className="flex items-baseline justify-between gap-3"
              title="Termómetro de la propia estación. Comparte carcasa con el sensor de partículas, así que suele leer varios grados por encima del ambiente."
            >
              <dt className="text-slate-500">Termómetro de la estación</dt>
              <dd className="font-medium text-slate-800 tabular-nums">
                {fmt(r.temperature, 0, '°')} · {fmt(r.relativehumidity, 0, '%')}
              </dd>
            </div>

            <div
              className="flex items-baseline justify-between gap-3"
              title="Modelo meteorológico Open-Meteo sobre una malla de ~9 km. No es una medición en el sitio: tiende a exagerar la subida de media mañana."
            >
              <dt className="text-slate-500">Clima de la zona</dt>
              <dd className="font-medium text-slate-800 tabular-nums">
                {fmt(weather?.temperature, 0, '°')} · {fmt(weather?.relativehumidity, 0, '%')}
                {weather?.apparent != null && (
                  <span className="ml-1 font-normal text-slate-400">
                    sensación {weather.apparent.toFixed(0)}°
                  </span>
                )}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Confianza del pronóstico</dt>
              <dd className="font-medium text-slate-800 tabular-nums">
                {(p.confidence * 100).toFixed(0)}%
              </dd>
            </div>

            {weather?.weather_text && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Tiempo</dt>
                <dd className="text-right font-medium text-slate-800">
                  {weather.weather_text}
                  {weather.precipitation != null && weather.precipitation > 0 &&
                    ` · ${weather.precipitation.toFixed(1)} mm`}
                  {weather.wind_kmh != null && ` · ${weather.wind_kmh.toFixed(0)} km/h`}
                </dd>
              </div>
            )}
          </dl>

          <p className="mt-3 text-[11px] leading-snug text-slate-400">
            Mediciones de la red Sustenta Honduras vía OpenAQ. Clima de Open-Meteo.
            El pronóstico lo genera un modelo automático y puede equivocarse.
          </p>
          </div>
        </details>
      </div>
    </div>
  );
}
