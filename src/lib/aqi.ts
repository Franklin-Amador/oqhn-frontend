/**
 * Constantes y helpers de visualización para las categorías AQI.
 * Espejo del módulo `api/inference.py` — mantener sincronizado.
 *
 * Hay DOS vocabularios y conviene no mezclarlos:
 *
 *  - `AqiCategory` (5 niveles EPA) describe una MEDICIÓN: se calcula del pm25
 *    observado con una tabla de consulta, así que siempre es fiable. Es lo que
 *    colorea el pin del mapa.
 *  - `PredCategory` (2 clases) es lo que PREDICE el modelo a +6h. Con 5 clases
 *    el dataset no da: en 90 días "Very Unhealthy" sale con 0 muestras. Medido,
 *    2 clases dan CV f1-macro 0.63 frente a 0.30 de las 5.
 *
 * Un modelo antiguo de 5 clases sigue renderizando bien porque las etiquetas de
 * predicción aceptan ambos vocabularios.
 */

export type AqiCategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive'
  | 'Unhealthy'
  | 'Very Unhealthy';

export const AQI_CATEGORIES: AqiCategory[] = [
  'Good',
  'Moderate',
  'Unhealthy for Sensitive',
  'Unhealthy',
  'Very Unhealthy',
];

/** Clases que puede devolver el modelo. 'Caution' = por encima del límite EPA
 *  "Good" (12 µg/m³) dentro de 6 h. */
export type PredCategory = 'Good' | 'Caution';

/** Etiquetas, colores y mensajes de la PREDICCIÓN. Incluye las 5 categorías EPA
 *  para que un modelo antiguo siga mostrándose bien. */
export const PRED_COLORS: Record<string, string> = {
  Good:    '#00E400',
  Caution: '#FFB000',   // ámbar: "precaución", sin impersonar un nivel EPA concreto
};

export const PRED_LABELS_ES: Record<string, string> = {
  Good:    'Buena',
  Caution: 'Precaución',
};

export const PRED_HEALTH_MSG: Record<string, string> = {
  Good:    'Se espera calidad del aire satisfactoria. Actividad al aire libre sin restricciones.',
  Caution: 'Se espera calidad del aire por encima del nivel bueno. Personas sensibles deberían moderar la actividad prolongada al aire libre.',
};

/** Códigos de color US EPA para cada categoría. */
export const AQI_COLORS: Record<AqiCategory, string> = {
  'Good':                    '#00E400',
  'Moderate':                '#FFFF00',
  'Unhealthy for Sensitive': '#FF7E00',
  'Unhealthy':               '#FF0000',
  'Very Unhealthy':          '#8F3F97',
};

/** Color de pin para estaciones sin datos recientes. */
export const NO_DATA_COLOR = '#9ca3af'; // tailwind gray-400

/** Etiquetas en español para mostrar al usuario. */
export const AQI_LABELS_ES: Record<AqiCategory, string> = {
  'Good':                    'Buena',
  'Moderate':                'Moderada',
  'Unhealthy for Sensitive': 'Dañina (grupos sensibles)',
  'Unhealthy':               'Dañina',
  'Very Unhealthy':          'Muy dañina',
};

/** Recomendaciones de salud para cada categoría. */
export const AQI_HEALTH_MSG: Record<AqiCategory, string> = {
  'Good':                    'Calidad satisfactoria. Actividad al aire libre sin restricciones.',
  'Moderate':                'Calidad aceptable. Personas muy sensibles deben moderar actividad prolongada al aire libre.',
  'Unhealthy for Sensitive': 'Grupos sensibles (niños, asmáticos, ancianos) pueden verse afectados.',
  'Unhealthy':               'Todos pueden empezar a sentir efectos. Limitar actividad prolongada al aire libre.',
  'Very Unhealthy':          'Alerta de salud. Evitar actividad al aire libre.',
};

/**
 * Color del pin a partir del pm25 MEDIDO, no de la predicción.
 *
 * Antes se coloreaba con la clase predicha. Eso ataba el mapa a lo que el modelo
 * sabe hacer (ahora 2 clases, o sea 2 colores) cuando la medición actual da los
 * 5 niveles EPA gratis y sin margen de error. El mapa enseña lo que hay ahora;
 * la predicción vive en la tarjeta.
 */
export function pinColor(pm25: number | null | undefined): string {
  if (pm25 == null || !Number.isFinite(pm25)) return NO_DATA_COLOR;
  return AQI_COLORS[pm25ToCategory(pm25)] ?? NO_DATA_COLOR;
}

/** Etiqueta legible de una predicción, venga del modelo de 2 clases o de uno
 *  antiguo de 5. */
export function predLabel(category: string | null | undefined): string {
  if (!category) return 'sin datos';
  return PRED_LABELS_ES[category] ?? AQI_LABELS_ES[category as AqiCategory] ?? category;
}

export function predColor(category: string | null | undefined): string {
  if (!category) return NO_DATA_COLOR;
  return PRED_COLORS[category] ?? AQI_COLORS[category as AqiCategory] ?? NO_DATA_COLOR;
}

export function predMessage(category: string | null | undefined): string {
  if (!category) return '';
  return PRED_HEALTH_MSG[category] ?? AQI_HEALTH_MSG[category as AqiCategory] ?? '';
}

/** Categorías AQI a partir del valor PM2.5 (US EPA breakpoints). */
export function pm25ToCategory(pm25: number): AqiCategory {
  if (pm25 <= 12.0)  return 'Good';
  if (pm25 <= 35.4)  return 'Moderate';
  if (pm25 <= 55.4)  return 'Unhealthy for Sensitive';
  if (pm25 <= 150.4) return 'Unhealthy';
  return 'Very Unhealthy';
}
