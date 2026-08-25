/**
 * Cliente tipado para la API FastAPI.
 * Base URL desde PUBLIC_API_URL (env). Default 127.0.0.1:8001.
 */
import type { AqiCategory } from './aqi';

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://127.0.0.1:8001';

// ─── Tipos espejo de los schemas de FastAPI ─────────────────────────────────

export interface StationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    id: number;
    name: string;
    locality: string | null;
    country: string;
    sensors: string[];
    has_pm25: boolean;
  };
}

export interface StationsGeoJSON {
  type: 'FeatureCollection';
  features: StationFeature[];
  metadata: {
    country_id: number;
    country: string;
    station_count: number;
    fetched_at: string;
    ttl_seconds: number;
  };
}

export interface SensorReadings {
  // null = la estacion no reporta ese sensor (o el dato es stale).
  // El backend manda null en vez de 0.0 para que la UI no invente un "0 C".
  pm25: number;
  pm10: number | null;
  pm1: number | null;
  temperature: number | null;
  relativehumidity: number | null;
  um003: number | null;
  [lag: string]: number | null; // pm25_lag1h, pm25_roll4h_mean, etc.
}

export interface Prediction {
  category: AqiCategory;
  category_index: number;
  confidence: number;
  probabilities: Record<AqiCategory, number>;
  aqi_color: string;
  health_message: string;
  timestamp: string;
}

export interface StationPrediction {
  location_id: number;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  has_data: boolean;
  stale?: boolean;        // true = última lectura >25h, lags en 0
  stale_age_h?: number;  // horas desde la última lectura disponible
  sensor_readings?: SensorReadings;
  /** Antiguedad en horas de cada lectura respecto a la hora mas reciente de la
   *  estacion. Los sensores no reportan sincronizados: 0 = de la ultima hora. */
  sensor_ages_h?: Record<string, number>;
  /** Hora mas reciente con datos de la estacion (ISO, UTC). */
  readings_timestamp?: string | null;
  prediction?: Prediction;
  error?: string;
}

export interface PredictionsResponse {
  fetched_at: string;
  station_count: number;
  with_data: number;
  ttl_seconds: number;
  cache_hit: boolean;
  cache_age_s: number;
  predictions: StationPrediction[];
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  model_url: string;
  model_version: string | null;
  n_features: number | null;
  timestamp: string;
}

// ─── Calls ──────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  const r = await fetch(`${API_URL}/health`);
  if (!r.ok) throw new Error(`/health: ${r.status}`);
  return r.json();
}

// La API sirve ambos endpoints desde JSON precalculados en Vercel Blob, que un
// cron regenera cada 6h. No existe un parámetro para forzar un refetch contra
// OpenAQ: exponerlo permitía que un clic disparara cientos de requests a la API
// externa y fue parte de lo que provocó el baneo de la key.
export async function fetchStations(): Promise<StationsGeoJSON> {
  const r = await fetch(`${API_URL}/stations`);
  if (!r.ok) throw new Error(`/stations: ${r.status}`);
  return r.json();
}

export async function fetchPredictions(): Promise<PredictionsResponse> {
  const r = await fetch(`${API_URL}/stations/predictions`);
  if (!r.ok) throw new Error(`/stations/predictions: ${r.status}`);
  return r.json();
}

// ─── GeoJSON estático de departamentos (GADM 4.1) ───────────────────────────

import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export interface DepartmentProperties {
  GID_1: string;
  GID_0: string;
  COUNTRY: string;
  NAME_1: string;
  TYPE_1: string;
  ENGTYPE_1: string;
  HASC_1: string;
  [k: string]: unknown;
}

export type DepartmentsGeoJSON = FeatureCollection<
  MultiPolygon | Polygon,
  DepartmentProperties
>;

/** Carga el GeoJSON estático servido desde /public. */
export interface StationWeather {
  temperature: number | null;
  relativehumidity: number | null;
  apparent: number | null;
  precipitation: number | null;
  wind_kmh: number | null;
  weather_code: number | null;
  weather_text: string;
  observed_at: string | null;
}

export interface WeatherResponse {
  fetched_at: string;
  station_count: number;
  ttl_seconds: number;
  source: string;
  cache_hit: boolean;
  cache_age_s: number;
  stale?: boolean;
  error?: string;
  /** location_id (como string) -> clima */
  weather: Record<string, StationWeather>;
}

/**
 * Clima actual por estacion, desde Open-Meteo via la API.
 *
 * Va aparte de /stations/predictions a proposito: el clima se refresca cada
 * 30 min (Open-Meteo no tiene API key ni cuota que arriesgar) mientras que las
 * predicciones de calidad del aire siguen el cron de 6h, porque salen de OpenAQ
 * y el PM2.5 no cambia lo suficiente en media hora para justificar el coste.
 */
export async function fetchWeather(): Promise<WeatherResponse> {
  const r = await fetch(`${API_URL}/stations/weather`);
  if (!r.ok) throw new Error(`/stations/weather: ${r.status}`);
  return r.json();
}

export async function fetchDepartments(): Promise<DepartmentsGeoJSON> {
  const r = await fetch('/honduras-departments.json');
  if (!r.ok) throw new Error(`/honduras-departments.json: ${r.status}`);
  return r.json();
}

export { API_URL };
