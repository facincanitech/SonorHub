// Supabase Edge Function — busca uma foto temática pra ilustrar o banner do
// Guia (decorativo, não é "a foto da matéria") via Unsplash, desacoplado da
// cota do GNews — mesmo se o GNews zerar, esse banner continua funcionando.
// Deploy: cole essa função numa function chamada "unsplash-image" no painel do Supabase.
// Secret: UNSPLASH_ACCESS_KEY (gratuito, crie em https://unsplash.com/developers)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (!apiKey || !q) {
    return Response.json({ image: null, error: 'Faltando palavra-chave ou chave do Unsplash no servidor.' }, { headers: CORS_HEADERS });
  }

  try {
    // per_page=10 + escolha aleatória — busca com a mesma palavra-chave sempre
    // devolve o resultado nº1 na mesma ordem, então sem isso a imagem nunca
    // mudaria de um carregamento pro outro.
    const resp = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=10&orientation=landscape&content_filter=high&client_id=${apiKey}`
    );
    const data = await resp.json();
    const results = data.results || [];
    if (results.length === 0) {
      return Response.json({ image: null, error: `Nada encontrado no Unsplash pra "${q}".` }, { headers: CORS_HEADERS });
    }
    const photo = results[Math.floor(Math.random() * results.length)];
    return Response.json({ image: photo.urls.regular, error: null }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ image: null, error: 'Erro ao consultar Unsplash: ' + e.message }, { headers: CORS_HEADERS });
  }
});
