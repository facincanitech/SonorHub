// Supabase Edge Function — busca de música/vídeo no YouTube pro Player.
// Dois modos:
//  - sem channelId: busca mista (artistas + vídeos) pelo termo, pra mostrar
//    a grade de artistas + lista de músicas (estilo "Descobertas" do YT Music).
//  - com channelId: lista os vídeos/músicas daquele canal (clicou num artista).
// Deploy: cole essa função numa function chamada "youtube-music" no painel do Supabase.
// Secret: YOUTUBE_API_KEY (mesma chave já usada em "Canais do YouTube")

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function mapVideoItem(it: any) {
  return {
    videoId: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    thumbnail: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url,
  };
}

function mapChannelItem(it: any) {
  return {
    channelId: it.id.channelId || it.snippet.channelId,
    title: it.snippet.channelTitle || it.snippet.title,
    thumbnail: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url,
  };
}

// Antes era um search.list só com type=video,channel misturado, pra economizar
// quota — só que nessa combinação o YouTube devolve majoritariamente canais
// pra busca de nome de artista, e os vídeos quase não apareciam (às vezes
// zero) competindo pelas mesmas 20 vagas. Agora são 2 buscas separadas: uma
// de canais (relevância) e uma de vídeos (mais recentes primeiro, já que pra
// vídeo "o que saiu agora" importa mais do que pra música).
async function buscarArtistas(apiKey: string, termo: string) {
  const params = new URLSearchParams({
    part: 'snippet', q: termo, type: 'channel', order: 'relevance', maxResults: '8', key: apiKey,
  });
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`).then((r) => r.json());
  return (resp.items || []).map(mapChannelItem);
}

async function buscarVideos(apiKey: string, termo: string) {
  const params = new URLSearchParams({
    part: 'snippet', q: termo, type: 'video', order: 'date', maxResults: '15', key: apiKey,
  });
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`).then((r) => r.json());
  return (resp.items || []).map(mapVideoItem);
}

async function buscarMisto(apiKey: string, termo: string) {
  const [artists, videos] = await Promise.all([
    buscarArtistas(apiKey, termo),
    buscarVideos(apiKey, termo),
  ]);
  return { artists, videos };
}

async function buscarMusicasDoCanal(apiKey: string, channelId: string) {
  const params = new URLSearchParams({
    part: 'snippet', channelId, type: 'video', order: 'date', maxResults: '25',
    videoCategoryId: '10', key: apiKey,
  });
  let resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`).then((r) => r.json());
  let items = resp.items || [];
  if (items.length === 0) {
    // Canal sem vídeos marcados certo na categoria "Música" — tenta sem o filtro.
    const params2 = new URLSearchParams({
      part: 'snippet', channelId, type: 'video', order: 'date', maxResults: '25', key: apiKey,
    });
    resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params2}`).then((r) => r.json());
    items = resp.items || [];
  }
  return items.map(mapVideoItem);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  const url = new URL(req.url);
  const name = (url.searchParams.get('name') || '').trim();
  const channelId = (url.searchParams.get('channelId') || '').trim();

  if (!apiKey) {
    return Response.json({ artists: [], videos: [], error: 'Faltando chave do YouTube no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    if (channelId) {
      const videos = await buscarMusicasDoCanal(apiKey, channelId);
      return Response.json({
        artists: [], videos,
        error: videos.length ? null : 'Esse artista não tem vídeos encontráveis.',
      }, { headers: CORS_HEADERS });
    }

    if (!name) {
      return Response.json({ artists: [], videos: [], error: 'Faltando termo de busca.' }, { headers: CORS_HEADERS });
    }

    const { artists, videos } = await buscarMisto(apiKey, name);
    return Response.json({
      artists, videos,
      error: (artists.length || videos.length) ? null : `Nada encontrado pra "${name}".`,
    }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ artists: [], videos: [], error: 'Erro ao consultar YouTube: ' + e.message }, { headers: CORS_HEADERS });
  }
});
