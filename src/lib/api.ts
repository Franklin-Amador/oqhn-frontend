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
  pm25: number;
  pm10: number;
  pm1: number;
  temperature: number;
  relativehumidity: number;
  um003: number;
  [lag: string]: number; // pm25_lag1h, pm25_roll4h_mean, etc.
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
export async function fetchDepartments(): Promise<DepartmentsGeoJSON> {
  const r = await fetch('/honduras-departments.json');
  if (!r.ok) throw new Error(`/honduras-departments.json: ${r.status}`);
  return r.json();
}

export { API_URL };
