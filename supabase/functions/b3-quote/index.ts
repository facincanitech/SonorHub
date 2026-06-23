// Supabase Edge Function — cotação real de ações/FIIs da B3 por ticker.
// Usa o endpoint não-oficial de chart do Yahoo Finance (sufixo ".SA" pra B3),
// gratuito e sem chave, mas sem CORS habilitado — por isso precisa passar
// por aqui em vez de chamar direto do navegador.
// Deploy: cole essa função numa function chamada "b3-quote" no painel do Supabase.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const ticker = (url.searchParams.get('ticker') || '').trim().toUpperCase();
  if (!ticker) {
    return Response.json({ error: 'Faltando ticker.' }, { headers: CORS_HEADERS });
  }

  try {
    const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => r.json());

    const meta = resp && resp.chart && resp.chart.result && resp.chart.result[0] && resp.chart.result[0].meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      return Response.json({ error: `Ticker "${ticker}" não encontrado.` }, { headers: CORS_HEADERS });
    }

    return Response.json({
      ticker,
      nome: meta.longName || meta.shortName || ticker,
      preco: meta.regularMarketPrice,
      fechamentoAnterior: meta.previousClose || meta.chartPreviousClose || null,
    }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ error: String(e) }, { headers: CORS_HEADERS });
  }
});
