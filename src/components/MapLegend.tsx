import { AQI_CATEGORIES, AQI_COLORS, AQI_LABELS_ES, NO_DATA_COLOR } from '../lib/aqi';

export function MapLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-[1000] rounded-xl bg-white/95 backdrop-blur shadow-lg border border-slate-200 p-3 text-sm max-w-xs">
      {/* Decia "(prediccion a +6h)" y era falso: el pin se colorea con el pm2.5
          MEDIDO, no con la clase predicha. Se cambio el color del pin en su dia y
          la leyenda se quedo describiendo lo anterior. */}
      <p className="font-semibold text-slate-900 mb-2">
        Calidad del aire{' '}
        <span className="text-xs font-normal text-slate-500">(medición actual)</span>
      </p>
      <ul className="space-y-1.5">
        {AQI_CATEGORIES.map((cat) => (
          <li key={cat} className="flex items-center gap-2">
            <span
              className="inline-block w-3.5 h-3.5 rounded-full border border-slate-700"
              style={{ backgroundColor: AQI_COLORS[cat] }}
            />
            <span className="text-slate-800">{AQI_LABELS_ES[cat]}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 pt-1.5 border-t border-slate-200 mt-1.5">
          <span
            className="inline-block w-3.5 h-3.5 rounded-full border border-slate-700"
            style={{ backgroundColor: NO_DATA_COLOR }}
          />
          <span className="text-slate-500 italic">Sin datos recientes</span>
        </li>
      </ul>
    </div>
  );
}
