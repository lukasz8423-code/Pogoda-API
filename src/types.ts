export interface CurrentWeather {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  weather_code: number;
  cloud_cover: number;
  cloud_cover_low?: number;
  cloud_cover_mid?: number;
  cloud_cover_high?: number;
  pressure_msl: number;
  wind_speed_10m: number;
  wind_gusts_10m?: number;
  wind_direction_10m: number;
  uv_index: number;
  visibility?: number;
  shortwave_radiation?: number;
  direct_normal_irradiance?: number;
  lightning_potential?: number;
  soil_moisture_satellite?: number;
  soil_temperature_10cm?: number;
  fusion_metadata?: {
    cloud_disagreement: number;
    applied_filters: string[];
    confidence_score: number;
  };
}

export interface Minutely15Forecast {
  time: string[];
  precipitation: number[];
  precipitation_probability?: number[];
  rain?: number[];
  snowfall?: number[];
}

export interface HourlyForecast {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  apparent_temperature?: number[];
  weather_code: number[];
  wind_speed_10m: number[];
  wind_gusts_10m?: number[];
  wind_direction_10m?: number[];
  pressure_msl?: number[];
  precipitation_probability: number[];
  cloud_cover: number[];
  cloud_cover_low?: number[];
  cloud_cover_mid?: number[];
  cloud_cover_high?: number[];
  precipitation?: number[];
  uv_index?: number[];
  visibility?: number[];
  soil_moisture_0_to_1cm?: number[];
  soil_moisture_1_to_3cm?: number[];
  soil_temperature_0cm?: number[];
  evapotranspiration?: number[];
  lightning_potential?: number[];
}

export interface DailyForecast {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  uv_index_max: number[];
  precipitation_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
  sunrise?: string[];
  sunset?: string[];
}

export interface WeatherResponse {
  city: string;
  lat: number;
  lng: number;
  weather: {
    latitude: number;
    longitude: number;
    generationtime_ms: number;
    utc_offset_seconds: number;
    timezone: string;
    timezone_abbreviation: string;
    elevation: number;
    current: CurrentWeather;
    hourly: HourlyForecast;
    daily: DailyForecast;
    minutely_15?: Minutely15Forecast;
    provider?: string;
    activeServers?: string[];
  };
  activeServers?: string[];
  sourcesData?: Record<string, {
    temp?: number;
    cloud?: number;
    wind?: number;
    label: string;
  }>;
  airQuality?: {
    stationName: string;
    address?: string;
    distanceKm: number;
    aqi: string;
    pm10?: string;
    pm25?: string;
    o3?: string;
    no2?: string;
    source: string;
  };
  hydrology?: {
    stations: any[];
    source: string;
  };
  lastUpdated?: string;
}

export interface AiRecommendation {
  advice: string;
  clothes: string;
  activities: string;
}

export interface WeatherAnalysis {
  warning: string;
  isAlert: boolean;
}
