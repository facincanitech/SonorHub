// Supabase Edge Function — busca recomendações de música por gênero via Spotify
// Web API, usando autenticação "Client Credentials" (app-only, sem precisar o
// usuário logar no Spotify — recomendações por gênero são dados públicos).
// Deploy: cole essa função numa function chamada "spotify-music" no painel do Supabase.
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(clientId: string, clientSecret: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const basic = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Falha ao autenticar com o Spotify.');
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  const url = new URL(req.url);
  const seedGenre = (url.searchParams.get('seed_genre') || '').trim();
  const limit = url.searchParams.get('limit') || '5';

  if (!clientId || !clientSecret || !seedGenre) {
    return Response.json({ items: [], error: 'Faltando gênero ou credenciais do Spotify no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    const token = await getAppToken(clientId, clientSecret);
    const resp = await fetch(`https://api.spotify.com/v1/recommendations?seed_genres=${encodeURIComponent(seedGenre)}&market=BR&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      return Response.json({ items: [], error: `Spotify API: ${resp.status}` }, { headers: CORS_HEADERS });
    }
    const data = await resp.json();
    const items = (data.tracks || []).map((track: any) => ({
      artist: track.artists.map((a: any) => a.name).join(', '),
      name: track.name,
      url: track.external_urls && track.external_urls.spotify,
    }));
    return Response.json({ items, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ items: [], error: 'Erro ao consultar Spotify: ' + e.message }, { headers: CORS_HEADERS });
  }
});
