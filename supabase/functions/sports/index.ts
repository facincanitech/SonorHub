// Supabase Edge Function — proxies API-Football so the API key never reaches the browser.
// Deploy: supabase functions deploy sports
// Secret: supabase secrets set APIFOOTBALL_API_KEY=xxxx

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('APIFOOTBALL_API_KEY');
  const url = new URL(req.url);
  const time = (url.searchParams.get('time') || '').trim();

  if (!apiKey || !time) {
    return Response.json({ items: [], error: 'Faltando time ou chave API-Football no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    const searchUrl = `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(time)}`;
    const search = await fetch(searchUrl, { headers: { 'x-apisports-key': apiKey } }).then(r => r.json());
    const teamId = search.response && search.response[0] && search.response[0].team.id;
    if (!teamId) {
      return Response.json({ items: [], error: `Time "${time}" não encontrado.` }, { headers: CORS_HEADERS });
    }

    const fixturesUrl = `https://v3.football.api-sports.io/fixtures?team=${teamId}&next=1`;
    const fixtures = await fetch(fixturesUrl, { headers: { 'x-apisports-key': apiKey } }).then(r => r.json());
    const next = fixtures.response && fixtures.response[0];
    if (!next) {
      return Response.json({ items: [], error: 'Nenhum próximo jogo encontrado.' }, { headers: CORS_HEADERS });
    }

    const date = new Date(next.fixture.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const text = `${next.teams.home.name} x ${next.teams.away.name}, em ${date}`;
    const items = [{ category: 'Entretenimento', sub: 'Esportes', title: text, full: `Próximo jogo de ${time}: ${text}.`, quick: text }];
    return Response.json({ items, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ items: [], error: 'Erro ao consultar API-Football: ' + e.message }, { headers: CORS_HEADERS });
  }
});
