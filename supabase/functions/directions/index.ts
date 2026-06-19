// Supabase Edge Function — proxies Google Maps Directions API (feature premium "GPS auditivo")
// so the (billed) API key never reaches the browser.
// Deploy: cole essa função numa function chamada "directions" no painel do Supabase.
// Secret: GOOGLE_MAPS_API_KEY (precisa de faturamento ativado no Google Cloud)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function stripHtmlTags(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const url = new URL(req.url);
  const origem = (url.searchParams.get('origem') || '').trim();
  const destino = (url.searchParams.get('destino') || '').trim();

  if (!apiKey || !origem || !destino) {
    return Response.json({ steps: [], error: 'Faltando origem/destino ou chave do Google Maps no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origem)}&destination=${encodeURIComponent(destino)}&language=pt-BR&key=${apiKey}`;
    const resp = await fetch(directionsUrl).then(r => r.json());
    if (resp.status !== 'OK') {
      return Response.json({ steps: [], error: `Google Directions: ${resp.status}` }, { headers: CORS_HEADERS });
    }

    const route = resp.routes[0];
    const leg = route.legs[0];
    const steps = leg.steps.map((s: any) => stripHtmlTags(s.html_instructions));
    steps.unshift(`Rota de ${origem} até ${destino}: ${leg.distance.text}, tempo estimado ${leg.duration.text}.`);
    return Response.json({ steps, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ steps: [], error: 'Erro ao calcular rota: ' + e.message }, { headers: CORS_HEADERS });
  }
});
