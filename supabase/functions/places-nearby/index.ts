// Supabase Edge Function — busca lugares próximos (posto, restaurante, etc.) via
// Google Places API (New) — Nearby Search. Usada pelo "modo trânsito" do GPS auditivo
// pra avisar quando um lugar novo aparece nas proximidades (sem repetir o mesmo).
// Deploy: cole essa função numa function chamada "places-nearby" no painel do Supabase.
// Secret: GOOGLE_MAPS_API_KEY (mesma chave das functions directions/traffic — precisa
// ter "Places API (New)" habilitada também)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lng = parseFloat(url.searchParams.get('lng') || '');
  const type = (url.searchParams.get('type') || '').trim();
  const radius = parseFloat(url.searchParams.get('radius') || '1000');

  if (!apiKey || !type || isNaN(lat) || isNaN(lng)) {
    return Response.json({ places: [], error: 'Faltando lat/lng/tipo ou chave do Google Maps no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
      },
      body: JSON.stringify({
        includedTypes: [type],
        maxResultCount: 3,
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
        languageCode: 'pt-BR',
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const msg = (data.error && data.error.message) || `HTTP ${resp.status}`;
      return Response.json({ places: [], error: `Google Places: ${msg}` }, { headers: CORS_HEADERS });
    }

    function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const places = (data.places || []).map((p: any) => ({
      id: p.id,
      name: p.displayName && p.displayName.text,
      distance: Math.round(distanceMeters(lat, lng, p.location.latitude, p.location.longitude)),
    }));
    return Response.json({ places, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ places: [], error: 'Erro ao buscar lugares: ' + e.message }, { headers: CORS_HEADERS });
  }
});
