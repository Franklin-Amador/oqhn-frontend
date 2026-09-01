import { useEffect, useRef } from 'react';
import type { StationFeature, StationPrediction, StationWeather } from '../lib/api';
import { StationPopup } from './StationPopup';

interface Props {
  feature: StationFeature;
  pred?: StationPrediction;
  weather?: StationWeather;
  onClose: () => void;
}

/**
 * La ficha de estacion como hoja inferior, para moviles.
 *
 * Un popup anclado al pin es un mal patron en una pantalla tactil: se centra
 * sobre el marcador, asi que cerca de un borde se sale, y para que quepa hay que
 * confiar en que Leaflet panee el mapa en el momento justo — cosa que ademas
 * react-leaflet complica, porque monta el contenido DESPUES de que Leaflet
 * decida si hace falta panear, y para entonces mide una tarjeta vacia.
 *
 * Una hoja inferior no tiene ninguno de esos problemas: ocupa el ancho completo,
 * su posicion no depende de donde este el pin, y deja el mapa a la vista encima.
 * Es lo que hacen las apps de mapas del telefono, y por eso se entiende sin
 * explicacion.
 */
export function StationSheet({ feature, pred, weather, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Escape cierra. En movil casi no se usa, pero en una tablet con teclado si, y
  // es lo que espera cualquiera que navegue con teclado.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  // Al cambiar de estacion, volver arriba: si el usuario habia bajado a los
  // detalles, la ficha siguiente abriria por la mitad.
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [feature.properties.id]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1200] flex flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_-8px_rgba(15,23,42,0.35)]"
      role="dialog"
      aria-label={`Calidad del aire en ${feature.properties.name}`}
    >
      {/* Asa: no arrastra nada, es una senal de "esto es una hoja" que la gente
          ya reconoce. Y el boton de cerrar va a su lado con 44px de alto. */}
      <div className="flex items-center gap-2 px-2 pt-2">
        <div className="flex-1" aria-hidden="true">
          <div className="mx-auto h-1 w-10 rounded-full bg-slate-300" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700 focus-visible:outline-2 focus-visible:outline-slate-400"
        >
          ×
        </button>
      </div>

      <div ref={ref} className="max-h-[72vh] overflow-y-auto overscroll-contain">
        <StationPopup feature={feature} pred={pred} weather={weather} variante="hoja" />
      </div>

      {/* Respeta la zona segura de los iPhone con barra inferior. */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
