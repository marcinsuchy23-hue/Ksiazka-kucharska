const HOSTS = new Set(['aniagotuje.pl', 'www.aniagotuje.pl']);
const RECIPE_PATH = /^\/przepis\/[a-z0-9][a-z0-9-]*\/?$/i;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10000;

function recipeUrl(input) {
  // Check the original authority too. URL normalizes an explicit default port away.
  const authority = input?.match(/^https:\/\/([^/?#]+)/i)?.[1]?.toLowerCase();
  if (!HOSTS.has(authority)) return null;

  const url = new URL(input);
  if (!HOSTS.has(url.hostname) || !RECIPE_PATH.test(url.pathname)) return null;
  url.search = '';
  url.hash = '';
  return url;
}

async function readRecipe(url, signal) {
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const upstream = await fetch(url, {
      headers: {accept:'text/html'},
      redirect:'manual',
      signal
    });
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      await upstream.body?.cancel();
      const location = upstream.headers.get('Location');
      if (!location) break;
      const next = /^[a-z][a-z0-9+.-]*:/i.test(location)
        ? location : location.startsWith('//') ? 'https:'+location : new URL(location,url).href;
      url = recipeUrl(next);
      if (!url) break;
      continue;
    }

    if (!upstream.ok || !/^text\/html\b/i.test(upstream.headers.get('Content-Type')||'')) {
      await upstream.body?.cancel();
      return {status:502,body:'Strona nie udostępniła przepisu.'};
    }
    if (!upstream.body || Number(upstream.headers.get('Content-Length')) > MAX_HTML_BYTES) {
      await upstream.body?.cancel();
      return {status:413,body:'Strona z przepisem jest za duża.'};
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = '';
    while (true) {
      const {value,done} = await reader.read();
      if (done) return {status:200,body:html+decoder.decode()};
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) {
        await reader.cancel();
        return {status:413,body:'Strona z przepisem jest za duża.'};
      }
      html += decoder.decode(value,{stream:true});
    }
  }
  return {status:502,body:'Strona przekierowała poza obsługiwany przepis.'};
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Content-Type':'text/plain; charset=utf-8',
      'X-Content-Type-Options':'nosniff',
      'Cache-Control':'no-store',
      Vary:'Origin'
    };
    const respond = (status,body)=>new Response(body,{status,headers});
    if (!origin || origin !== env.APP_ORIGIN) return respond(403,'Niedozwolone źródło żądania.');
    headers['Access-Control-Allow-Origin'] = origin;
    if (request.method!=='GET') {
      headers.Allow = 'GET';
      return respond(405,'Dozwolona metoda GET.');
    }

    let url;
    try {
      url = recipeUrl(new URL(request.url).searchParams.get('url'));
    } catch {
      return respond(400,'Podaj poprawny link do przepisu.');
    }
    if (!url) return respond(400,'Podaj link do przepisu z AniaGotuje.');

    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),TIMEOUT_MS);
    try {
      const {status,body} = await readRecipe(url,controller.signal);
      return respond(status,body);
    } catch {
      return controller.signal.aborted
        ? respond(504,'Strona z przepisem odpowiada zbyt długo.')
        : respond(502,'Nie udało się pobrać strony z przepisem.');
    } finally {
      clearTimeout(timer);
    }
  }
};
