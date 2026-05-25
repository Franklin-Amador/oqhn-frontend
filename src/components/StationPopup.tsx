import type { StationFeature, StationPrediction } from '../lib/api';
import {
  AQI_COLORS,
  AQI_HEALTH_MSG,
  AQI_LABELS_ES,
  pm25ToCategory,
  type AqiCategory,
} from '../lib/aqi';

interface Props {
  feature: StationFeature;
  pred?: StationPrediction;
}

export function StationPopup({ feature, pred }: Props) {
  const { name, locality } = feature.properties;
  const cleanName = name?.replace(/\s*-\s*Sustenta Honduras\s*$/, '').trim() || `Station ${feature.properties.id}`;

  if (!pred || !pred.has_data) {
    return (
      <div className="p-3.5 font-sans">
        <h3 className="font-bold text-slate-900 text-sm leading-tight mb-1">{cleanName}</h3>
        {locality && <p className="text-xs text-slate-500 mb-2">{locality}</p>}
        <p className="text-xs text-slate-600 italic">
          {pred?.error || 'Sin datos recientes en las últimas 25h'}
        </p>
      </div>
    );
  }

  const r      = pred.sensor_readings!;
  const p      = pred.prediction!;
  const cat    = p.category as AqiCategory;
  const isStale = pred.stale === true;
  const staleLabel = isStale && pred.stale_age_h != null
    ? pred.stale_age_h < 48
      ? `hace ${Math.round(pred.stale_age_h)}h`
      : `hace ${Math.round(pred.stale_age_h / 24)}d`
    : null;
  const currentCat = pm25ToCategory(r.pm25);
  const futureWorse = (() => {
    const order: AqiCategory[] = ['Good', 'Moderate', 'Unhealthy for Sensitive', 'Unhealthy', 'Very Unhealthy'];
    return order.indexOf(cat) > order.indexOf(currentCat);
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
            <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Ahora</span>
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
              style={{ backgroundColor: AQI_COLORS[cat] }}
            />
            <span className="text-sm font-semibold text-slate-900">{AQI_LABELS_ES[cat]}</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
            {AQI_HEALTH_MSG[cat]}
          </p>
        </div>

        {/* Otros sensores */}
        <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] uppercase text-slate-500">Temp</div>
            <div className="text-sm font-semibold">{r.temperature.toFixed(1)}°C</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">Humedad</div>
            <div className="text-sm font-semibold">{r.relativehumidity.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">PM1</div>
            <div className="text-sm font-semibold">{r.pm1.toFixed(1)}</div>
          </div>
        </div>

        {/* Mini-historico de PM2.5 lags */}
        {(['pm25_lag1h', 'pm25_lag3h', 'pm25_lag6h', 'pm25_lag12h'] as const).some(k => k in r) && (
          <div className="pt-2 border-t border-slate-200">
            <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1.5">PM2.5 últimas horas</div>
            <div className="flex items-end justify-between gap-1 h-12">
              {([24, 12, 6, 3, 1, 0] as const).map((h) => {
                const v = h === 0 ? r.pm25 : (r[`pm25_lag${h}h`] ?? 0);
                const max = Math.max(...[24, 12, 6, 3, 1, 0].map(hr => hr === 0 ? r.pm25 : (r[`pm25_lag${hr}h`] ?? 0)));
                const h_px = max > 0 ? Math.max(4, (v / max) * 100) : 4;
                const isNow = h === 0;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{
                        height: `${h_px}%`,
                        backgroundColor: AQI_COLORS[pm25ToCategory(v)],
                        opacity: isNow ? 1 : 0.65,
                        border: isNow ? '1px solid #1f2937' : 'none',
                      }}
                      title={`${v.toFixed(1)} µg/m³`}
                    />
                    <span className="text-[9px] text-slate-500">{isNow ? 'now' : `-${h}h`}</span>
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
