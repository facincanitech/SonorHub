// Supabase Edge Function — busca último/próximo jogo via TheSportsDB.
// Trocamos de API-Football porque a conta deles foi suspensa sem aviso e o
// suporte só ofereceu planos pagos (o mais barato, US$99/mês) pra reativar.
// TheSportsDB funciona com uma chave de teste pública gratuita ("3"), sem
// precisar criar conta — dá pra trocar por uma chave pessoal via Patreon
// deles depois se precisar de mais limite de requisições.
// Deploy: cole essa função numa function chamada "sports" no painel do Supabase.
// Secret (opcional): THESPORTSDB_API_KEY — se não setar, usa a chave de teste "3".

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('THESPORTSDB_API_KEY') || '3';
  const url = new URL(req.url);
  const time = (url.searchParams.get('time') || '').trim();
  const competicao = (url.searchParams.get('competicao') || '').trim().toLowerCase();

  if (!time) {
    return Response.json({ items: [], error: 'Faltando time.' }, { headers: CORS_HEADERS });
  }

  try {
    const base = `https://www.thesportsdb.com/api/v1/json/${apiKey}`;
    const search = await fetch(`${base}/searchteams.php?t=${encodeURIComponent(time)}`).then(r => r.json());
    const team = search.teams && search.teams[0];
    if (!team) {
      return Response.json({ items: [], error: `Time "${time}" não encontrado.` }, { headers: CORS_HEADERS });
    }

    const [lastResp, nextResp] = await Promise.all([
      fetch(`${base}/eventslast.php?id=${team.idTeam}`).then(r => r.json()),
      fetch(`${base}/eventsnext.php?id=${team.idTeam}`).then(r => r.json()),
    ]);

    function pickEvent(list: any[]) {
      if (!list || list.length === 0) return null;
      if (competicao) {
        const match = list.find((e: any) => (e.strLeague || '').toLowerCase().includes(competicao));
        if (match) return match;
      }
      return list[0];
    }

    const items = [];
    const last = pickEvent(lastResp.results);
    if (last) {
      const dateL = new Date(last.dateEvent).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const placar = `${last.intHomeScore} x ${last.intAwayScore}`;
      const text = `${last.strHomeTeam} ${placar} ${last.strAwayTeam} (${last.strLeague}), em ${dateL}`;
      items.push({ category: 'Esportes', sub: 'Último jogo', title: text, full: `Último jogo de ${time}: ${text}.`, quick: text });
    }

    const next = pickEvent(nextResp.events);
    if (next) {
      const dateN = `${new Date(next.dateEvent).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${(next.strTime || '').slice(0, 5)}`;
      const text = `${next.strHomeTeam} x ${next.strAwayTeam} (${next.strLeague}), em ${dateN}`;
      items.push({ category: 'Esportes', sub: 'Próximo jogo', title: text, full: `Próximo jogo de ${time}: ${text}.`, quick: text });
    }

    if (items.length === 0) {
      return Response.json({ items: [], error: 'Nenhum jogo recente ou futuro encontrado.' }, { headers: CORS_HEADERS });
    }
    return Response.json({ items, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ items: [], error: 'Erro ao consultar TheSportsDB: ' + e.message }, { headers: CORS_HEADERS });
  }
});
