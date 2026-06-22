// Supabase Edge Function — busca um vídeo de música de um artista/banda pelo
// nome. Primeiro tenta restringir à categoria "Música" do YouTube (melhor pra
// artista conhecido); se não achar nada (banda desconhecida/pequena, sem
// categoria certa), tenta de novo sem restrição nenhuma.
// Deploy: cole essa função numa function chamada "youtube-music" no painel do Supabase.
// Secret: YOUTUBE_API_KEY (mesma chave já usada em "Canais do YouTube")

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function searchVideo(apiKey: string, query: string, restrictMusic: boolean) {
  const params = new URLSearchParams({
    part: 'snippet', q: query, type: 'video', order: 'relevance', maxResults: '1', key: apiKey,
  });
  if (restrictMusic) params.set('videoCategoryId', '10');
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`).then((r) => r.json());
  const found = resp.items && resp.items[0];
  if (!found) return null;
  return {
    title: found.snippet.title,
    channelTitle: found.snippet.channelTitle,
    videoId: found.id.videoId,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  const url = new URL(req.url);
  const name = (url.searchParams.get('name') || '').trim();

  if (!apiKey || !name) {
    return Response.json({ video: null, error: 'Faltando nome do artista ou chave do YouTube no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    let video = await searchVideo(apiKey, `${name} música`, true);
    if (!video) video = await searchVideo(apiKey, name, false); // sem filtro: pega qualquer coisa, banda pequena inclusive

    if (!video) {
      return Response.json({ video: null, error: `Nada encontrado no YouTube pra "${name}".` }, { headers: CORS_HEADERS });
    }
    return Response.json({ video, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ video: null, error: 'Erro ao consultar YouTube: ' + e.message }, { headers: CORS_HEADERS });
  }
});
