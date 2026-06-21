// Supabase Edge Function — proxies OpenWeatherMap so the API key never reaches the browser.
// Deploy: supabase functions deploy weather
// Secret: supabase secrets set OPENWEATHER_API_KEY=xxxx

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isCepLike(value: string) {
  return /^\d{5}-?\d{3}$/.test(value.trim());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
  const url = new URL(req.url);
  const local = (url.searchParams.get('local') || '').trim();

  if (!apiKey || !local) {
    return Response.json({ items: [], error: 'Faltando local ou chave OpenWeatherMap no servidor.' }, { headers: CORS_HEADERS });
  }

  const cleaned = local.trim();
  const weatherUrl = isCepLike(cleaned)
    ? `https://api.openweathermap.org/data/2.5/weather?zip=${encodeURIComponent(cleaned.replace('-', ''))},BR&units=metric&lang=pt_br&appid=${apiKey}`
    : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cleaned)}&units=metric&lang=pt_br&appid=${apiKey}`;

  let weather;
  try {
    weather = await fetch(weatherUrl).then(r => r.json());
  } catch {
    return Response.json({ items: [], error: 'Falha de rede ao consultar o clima.' }, { headers: CORS_HEADERS });
  }
  if (weather.cod && weather.cod !== 200) {
    return Response.json({ items: [], error: `OpenWeatherMap: ${weather.message || weather.cod}` }, { headers: CORS_HEADERS });
  }

  const items = [];
  const nomeLocal = weather.name || cleaned;
  const temp = Math.round(weather.main.temp);
  const desc = weather.weather[0].description;
  items.push({
    category: 'Clima', sub: 'Previsão',
    title: `${nomeLocal}: ${temp}°C, ${desc}`,
    full: `O clima em ${nomeLocal} agora: ${temp} graus, ${desc}.`,
    quick: `${nomeLocal}: ${temp}°C, ${desc}`,
  });

  // Ícones reais do OpenWeatherMap (agora + próximas previsões de 3 em 3h), pro
  // herói animado do Guia mostrar o tempo de verdade em vez de desenho genérico.
  const icons = [weather.weather[0].icon];

  if (weather.coord) {
    const uvResp = await fetch(`https://api.openweathermap.org/data/2.5/uvi?lat=${weather.coord.lat}&lon=${weather.coord.lon}&appid=${apiKey}`).then(r => r.json()).catch(() => null);
    if (uvResp && uvResp.value !== undefined) {
      items.push({ category: 'Clima', sub: 'UV', title: `Índice UV: ${uvResp.value}`, full: `O índice de UV em ${nomeLocal} está em ${uvResp.value}.`, quick: `UV: ${uvResp.value}` });
    }

    const aqResp = await fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${weather.coord.lat}&lon=${weather.coord.lon}&appid=${apiKey}`).then(r => r.json()).catch(() => null);
    if (aqResp && aqResp.list && aqResp.list[0]) {
      const aqi = aqResp.list[0].main.aqi;
      const labels = ['', 'Boa', 'Razoável', 'Moderada', 'Ruim', 'Muito ruim'];
      items.push({ category: 'Clima', sub: 'Qualidade do ar', title: `AQI: ${labels[aqi] || aqi}`, full: `A qualidade do ar em ${nomeLocal} está classificada como ${labels[aqi] || aqi}.`, quick: `Ar: ${labels[aqi] || aqi}` });
    }

    const forecastResp = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${weather.coord.lat}&lon=${weather.coord.lon}&units=metric&lang=pt_br&appid=${apiKey}`).then(r => r.json()).catch(() => null);
    if (forecastResp && forecastResp.list) {
      for (const f of forecastResp.list.slice(0, 2)) {
        if (f.weather && f.weather[0]) icons.push(f.weather[0].icon);
      }
    }
  }

  return Response.json({ items, icons, error: null }, { headers: CORS_HEADERS });
});
