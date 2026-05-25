/**
 * Constantes y helpers de visualización para las categorías AQI.
 * Espejo del módulo `api/inference.py` — mantener sincronizado.
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

/** Devuelve el color de un pin dada la predicción (o gris si no hay datos). */
export function pinColor(category: AqiCategory | null | undefined): string {
  if (!category) return NO_DATA_COLOR;
  return AQI_COLORS[category] ?? NO_DATA_COLOR;
}

/** Categorías AQI a partir del valor PM2.5 (US EPA breakpoints). */
export function pm25ToCategory(pm25: number): AqiCategory {
  if (pm25 <= 12.0)  return 'Good';
  if (pm25 <= 35.4)  return 'Moderate';
  if (pm25 <= 55.4)  return 'Unhealthy for Sensitive';
  if (pm25 <= 150.4) return 'Unhealthy';
  return 'Very Unhealthy';
}
