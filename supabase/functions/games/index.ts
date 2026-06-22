// Supabase Edge Function — jogos de verdade via RAWG (data de lançamento real
// e ranking de popularidade), em vez de depender só de um feed de notícias
// genérico que mistura review/lista/lançamento tudo junto.
// Deploy: cole essa função numa function chamada "games" no painel do Supabase.
// Secret: RAWG_API_KEY (gratuito, crie em https://rawg.io/apidocs)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function fmt(date: Date) {
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('RAWG_API_KEY');
  const url = new URL(req.url);
  const type = (url.searchParams.get('type') || '').trim();

  if (!apiKey || !type) {
    return Response.json({ items: [], error: 'Faltando tipo (lancamentos/aguardados) ou chave RAWG no servidor.' }, { headers: CORS_HEADERS });
  }

  const today = new Date();
  let datesParam: string;
  let ordering: string;

  if (type === 'lancamentos') {
    // Janela: 3 semanas pra trás até 1 semana pra frente, mais recentes primeiro.
    const past = new Date(today); past.setDate(past.getDate() - 21);
    const future = new Date(today); future.setDate(future.getDate() + 7);
    datesParam = `${fmt(past)},${fmt(future)}`;
    ordering = '-released';
  } else if (type === 'aguardados') {
    // Só lançamentos futuros, ordenado por popularidade real (quantas pessoas
    // adicionaram à lista no RAWG) — proxy de "mais aguardado".
    const future = new Date(today); future.setDate(future.getDate() + 120);
    datesParam = `${fmt(today)},${fmt(future)}`;
    ordering = '-added';
  } else {
    return Response.json({ items: [], error: 'Tipo inválido, use lancamentos ou aguardados.' }, { headers: CORS_HEADERS });
  }

  try {
    const rawgUrl = `https://api.rawg.io/api/games?key=${apiKey}&dates=${datesParam}&ordering=${ordering}&page_size=8`;
    const data = await fetch(rawgUrl).then((r) => r.json());
    if (!data.results) {
      return Response.json({ items: [], error: `RAWG: ${data.detail || data.error || 'sem resultados'}` }, { headers: CORS_HEADERS });
    }
    const items = data.results.map((g: any) => ({
      title: g.name,
      released: g.released || null,
      platforms: (g.platforms || []).map((p: any) => p.platform.name).slice(0, 3).join(', '),
    }));
    return Response.json({ items, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ items: [], error: 'Erro ao consultar RAWG: ' + e.message }, { headers: CORS_HEADERS });
  }
});
