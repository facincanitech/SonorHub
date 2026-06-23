// Supabase Edge Function — troca o código de autorização do Google (ou um
// refresh token salvo) por um access_token novo. É isso que faz o login do
// Google (web) ficar de verdade persistente entre sessões, sem depender de
// cookie/sessão do navegador (que os navegadores andam bloqueando cada vez
// mais para terceiros) — o refresh token dura meses, só o access_token de 1h
// precisa ser renovado, e essa renovação não exige interação nenhuma.
// Deploy: cole essa função numa function chamada "google-token" no painel do Supabase.
// Secrets: GOOGLE_CLIENT_ID_WEB, GOOGLE_CLIENT_SECRET (do client "Web" no Google Cloud Console)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID_WEB');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return Response.json({ error: 'Faltando client id/secret do Google no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const refreshToken = url.searchParams.get('refresh_token');
    const code = url.searchParams.get('code');
    const params: Record<string, string> = { client_id: clientId, client_secret: clientSecret };

    if (refreshToken) {
      params.grant_type = 'refresh_token';
      params.refresh_token = refreshToken;
    } else if (code) {
      params.grant_type = 'authorization_code';
      params.code = code;
      params.redirect_uri = url.searchParams.get('redirect_uri') || '';
      params.code_verifier = url.searchParams.get('code_verifier') || '';
    } else {
      return Response.json({ error: 'Faltando code ou refresh_token.' }, { headers: CORS_HEADERS });
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return Response.json({ error: data.error_description || data.error || 'Erro ao trocar token.' }, { headers: CORS_HEADERS });
    }
    return Response.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null, // só vem na troca inicial (code); refresh não devolve de novo
      expires_in: data.expires_in,
      error: null,
    }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ error: 'Erro ao consultar Google: ' + e.message }, { headers: CORS_HEADERS });
  }
});
