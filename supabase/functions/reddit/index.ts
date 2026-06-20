// Supabase Edge Function — busca posts de um subreddit via API oficial do Reddit.
// O endpoint público .rss bloqueia (403) requisições vindas de IPs de cloud/datacenter
// como os do Supabase, então a API autenticada é o único jeito confiável de fazer isso
// rodando num servidor.
//
// Deploy: cole essa função numa function chamada "reddit" no painel do Supabase.
// Secrets: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
//
// Como criar (gratuito, na hora, sem aprovação):
//   1. https://www.reddit.com/prefs/apps -> "create another app"
//   2. Tipo: "script"
//   3. Nome: qualquer um (ex: InfoHub); about url e redirect uri podem ser
//      qualquer URL válida, ex: https://facincanitech.github.io/InfoHub/
//   4. O "client_id" é o texto curto embaixo do nome do app; o "secret" é o campo "secret"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const basic = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'InfoHub/1.0 (briefing app)',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Falha ao autenticar com o Reddit.');
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const clientId = Deno.env.get('REDDIT_CLIENT_ID');
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');
  const url = new URL(req.url);
  const subreddit = (url.searchParams.get('subreddit') || '').trim();

  if (!clientId || !clientSecret || !subreddit) {
    return Response.json({ items: [], error: 'Faltando subreddit ou credenciais do Reddit no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    const token = await getAccessToken(clientId, clientSecret);
    const resp = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/hot?limit=10`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'InfoHub/1.0 (briefing app)' },
    });
    const data = await resp.json();
    if (!data.data || !data.data.children) {
      return Response.json({ items: [], error: `Subreddit "${subreddit}" não encontrado ou sem posts.` }, { headers: CORS_HEADERS });
    }
    const items = data.data.children.map((c: any) => c.data.title).filter(Boolean);
    return Response.json({ items, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ items: [], error: 'Erro ao consultar Reddit: ' + e.message }, { headers: CORS_HEADERS });
  }
});
