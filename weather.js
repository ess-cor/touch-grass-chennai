// weather.js: optional live weather from Open-Meteo (open data, no API key, no account).
// Only used when you tap the button and you're online; the app works fine without it.

function describe(code) {
  if (code === 0) return "clear sky";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code === 61 || code === 80) return "light rain";
  if (code >= 63 && code <= 67) return "rain";
  if (code >= 81 && code <= 82) return "heavy showers";
  if (code >= 95) return "thunderstorm";
  return "mixed weather";
}

// Map the forecast onto the app's five conditions.
export function toCondition({ code, temp, feels }) {
  if (code >= 63 || code >= 95) return "storm";
  if ((code >= 51 && code <= 61) || code === 80) return "drizzle";
  if (temp >= 35 || feels >= 38) return "hot";
  if (code <= 1) return "clear";
  return "cloudy";
}

export async function liveWeather(city) {
  const q = encodeURIComponent((city || "Chennai").trim());
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`).then((r) => r.json());
  const place = geo.results && geo.results[0];
  if (!place) throw new Error(`Couldn't find "${city}"`);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code,precipitation&timezone=auto`;
  const wx = await fetch(url).then((r) => r.json());
  const c = wx.current;
  const w = { code: c.weather_code, temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), rain: c.precipitation };
  return {
    ...w,
    place: place.name,
    condition: toCondition(w),
    summary: `${w.temp}°C (feels like ${w.feels}°C), ${describe(w.code)}`,
  };
}
