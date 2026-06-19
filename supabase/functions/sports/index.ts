// Supabase Edge Function — proxies API-Football so the API key never reaches the browser.
// Deploy: cole esse código numa function chamada "sports" no painel do Supabase.
// Secret: APIFOOTBALL_API_KEY

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('APIFOOTBALL_API_KEY');
  const url = new URL(req.url);
  const time = (url.searchParams.get('time') || '').trim();
  const competicao = (url.searchParams.get('competicao') || '').trim();

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

    let leagueId = null;
    if (competicao) {
      const leagueSearch = await fetch(`https://v3.football.api-sports.io/leagues?search=${encodeURIComponent(competicao)}`, { headers: { 'x-apisports-key': apiKey } }).then(r => r.json());
      leagueId = leagueSearch.response && leagueSearch.response[0] && leagueSearch.response[0].league.id;
    }

    const leagueParam = leagueId ? `&league=${leagueId}` : '';
    const [lastResp, nextResp] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/fixtures?team=${teamId}&last=1${leagueParam}`, { headers: { 'x-apisports-key': apiKey } }).then(r => r.json()),
      fetch(`https://v3.football.api-sports.io/fixtures?team=${teamId}&next=1${leagueParam}`, { headers: { 'x-apisports-key': apiKey } }).then(r => r.json()),
    ]);

    const items = [];
    const last = lastResp.response && lastResp.response[0];
    if (last) {
      const dateL = new Date(last.fixture.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const placar = `${last.goals.home} x ${last.goals.away}`;
      const text = `${last.teams.home.name} ${placar} ${last.teams.away.name}, em ${dateL}`;
      items.push({ category: 'Esportes', sub: 'Último jogo', title: text, full: `Último jogo de ${time}: ${text}.`, quick: text });
    }

    const next = nextResp.response && nextResp.response[0];
    if (next) {
      const dateN = new Date(next.fixture.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const text = `${next.teams.home.name} x ${next.teams.away.name}, em ${dateN}`;
      items.push({ category: 'Esportes', sub: 'Próximo jogo', title: text, full: `Próximo jogo de ${time}: ${text}.`, quick: text });
    }

    if (items.length === 0) {
      return Response.json({ items: [], error: 'Nenhum jogo recente ou futuro encontrado.' }, { headers: CORS_HEADERS });
    }
    return Response.json({ items, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ items: [], error: 'Erro ao consultar API-Football: ' + e.message }, { headers: CORS_HEADERS });
  }
});
