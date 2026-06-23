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
  const forecast = (url.searchParams.get('forecast') || '').trim();
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!apiKey || (!local && !(lat && lon))) {
    return Response.json({ items: [], error: 'Faltando local (ou lat/lon) ou chave OpenWeatherMap no servidor.' }, { headers: CORS_HEADERS });
  }

  // Modo "onde estou": resolve o nome da cidade a partir do GPS (gratuito, já
  // que o OpenWeatherMap aceita coordenada direto) — usado só pra preencher o
  // campo de cidade automaticamente, não passa pelo fluxo normal/forecast.
  if (lat && lon) {
    const geoUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=metric&lang=pt_br&appid=${apiKey}`;
    try {
      const data = await fetch(geoUrl).then(r => r.json());
      if (!data.name) return Response.json({ nomeLocal: null, error: 'Não foi possível identificar a cidade.' }, { headers: CORS_HEADERS });
      return Response.json({ nomeLocal: data.name, error: null }, { headers: CORS_HEADERS });
    } catch {
      return Response.json({ nomeLocal: null, error: 'Falha de rede ao consultar o clima.' }, { headers: CORS_HEADERS });
    }
  }

  const cleaned = local.trim();

  // Previsão pros próximos dias: usa o forecast de 5 dias/3h em 3h do plano
  // gratuito, agrupado por dia (min/máx + condição do meio-dia).
  if (forecast) {
    const forecastUrl = isCepLike(cleaned)
      ? `https://api.openweathermap.org/data/2.5/forecast?zip=${encodeURIComponent(cleaned.replace('-', ''))},BR&units=metric&lang=pt_br&appid=${apiKey}`
      : `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cleaned)}&units=metric&lang=pt_br&appid=${apiKey}`;

    let data;
    try {
      data = await fetch(forecastUrl).then(r => r.json());
    } catch {
      return Response.json({ items: [], error: 'Falha de rede ao consultar a previsão.' }, { headers: CORS_HEADERS });
    }
    if (!data.list) {
      return Response.json({ items: [], error: `OpenWeatherMap: ${data.message || 'sem previsão'}` }, { headers: CORS_HEADERS });
    }

    const nomeLocal = (data.city && data.city.name) || cleaned;
    const today = new Date().toISOString().slice(0, 10);
    const byDate: Record<string, any[]> = {};
    for (const entry of data.list) {
      const date = entry.dt_txt.slice(0, 10);
      if (date === today) continue;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(entry);
    }

    const items = Object.keys(byDate).slice(0, 3).map((date) => {
      const entries = byDate[date];
      const temps = entries.map((e: any) => e.main.temp);
      const min = Math.round(Math.min(...temps));
      const max = Math.round(Math.max(...temps));
      const midday = entries.find((e: any) => e.dt_txt.includes('12:00:00')) || entries[Math.floor(entries.length / 2)];
      const desc = midday.weather[0].description;
      const [, m, d] = date.split('-');
      const dataFmt = `${d}/${m}`;
      return {
        category: 'Clima', sub: 'Previsão dos próximos dias',
        title: `${dataFmt}: ${min}°C a ${max}°C, ${desc}`,
        full: `Previsão pra dia ${dataFmt} em ${nomeLocal}: entre ${min} e ${max} graus, ${desc}.`,
        quick: `${dataFmt}: ${min}°C a ${max}°C`,
      };
    });

    return Response.json({ items, error: items.length === 0 ? 'Sem previsão disponível.' : null }, { headers: CORS_HEADERS });
  }

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
  const condId = weather.weather[0].id;
  items.push({
    category: 'Clima', sub: 'Previsão',
    title: `${nomeLocal}: ${temp}°C, ${desc}`,
    full: `O clima em ${nomeLocal} agora: ${temp} graus, ${desc}.`,
    quick: `${nomeLocal}: ${temp}°C, ${desc}`,
  });

  // Alertas calculados a partir da própria previsão (sem API extra): frio,
  // calor, tempestade ou chuva forte. Códigos de condição do OpenWeatherMap:
  // 2xx = trovoada, 5xx = chuva (502+ é forte).
  if (temp <= 10) {
    items.push({ category: 'Clima', sub: 'Alerta', title: `Alerta de frio em ${nomeLocal}`, full: `Alerta de frio em ${nomeLocal}: a temperatura está em ${temp} graus.`, quick: `Alerta de frio: ${temp}°C` });
  }
  if (temp >= 35) {
    items.push({ category: 'Clima', sub: 'Alerta', title: `Alerta de calor em ${nomeLocal}`, full: `Alerta de calor em ${nomeLocal}: a temperatura está em ${temp} graus.`, quick: `Alerta de calor: ${temp}°C` });
  }
  if (condId >= 200 && condId < 300) {
    items.push({ category: 'Clima', sub: 'Alerta', title: `Alerta de tempestade em ${nomeLocal}`, full: `Alerta de tempestade em ${nomeLocal}: ${desc}.`, quick: `Alerta de tempestade` });
  } else if (condId >= 502 && condId < 600) {
    items.push({ category: 'Clima', sub: 'Alerta', title: `Alerta de chuva forte em ${nomeLocal}`, full: `Alerta de chuva forte em ${nomeLocal}: ${desc}.`, quick: `Alerta de chuva forte` });
  }

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
  }

  return Response.json({ items, error: null }, { headers: CORS_HEADERS });
});
