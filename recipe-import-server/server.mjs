import { lookup } from 'node:dns/promises';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

const MAX_URL_LENGTH = 4096;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 10000;
const MAX_ACTIVE = 4;
const RECIPES_PER_MINUTE = 30;
const IMAGES_PER_MINUTE = 120;
const JSON_PER_MINUTE = 30;

const reservedIPv4 = new BlockList();
for (const [address,bits] of [
  ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
  ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24],
  ['192.88.99.0',24], ['192.168.0.0',16], ['198.18.0.0',15], ['198.51.100.0',24],
  ['203.0.113.0',24], ['224.0.0.0',3], ['168.63.129.16',32]
]) reservedIPv4.addSubnet(address,bits);

const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::',3,'ipv6');
const reservedIPv6 = new BlockList();
for (const [address,bits] of [
  ['2001::',23], ['2001:db8::',32], ['2002::',16], ['3fff::',20]
]) reservedIPv6.addSubnet(address,bits,'ipv6');

function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !reservedIPv4.check(address);
  return family === 6 && globalIPv6.check(address,'ipv6') && !reservedIPv6.check(address,'ipv6');
}

class ImportError extends Error {
  constructor(status,message) {
    super(message);
    this.status = status;
  }
}

function sourceUrl(value,base) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH) {
    throw new ImportError(400,'Podaj poprawny adres strony z przepisem.');
  }
  let url;
  try {
    url = new URL(value,base);
  } catch {
    throw new ImportError(400,'Podaj poprawny adres strony z przepisem.');
  }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new ImportError(400,'Podaj adres HTTP lub HTTPS bez danych logowania i niestandardowego portu.');
  }
  url.hash = '';
  if (url.href.length > MAX_URL_LENGTH) {
    throw new ImportError(400,'Adres strony z przepisem jest za długi.');
  }
  return url;
}

function abortable(promise,signal) {
  return new Promise((resolve,reject)=>{
    const abort = ()=>reject(signal.reason);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

async function resolveAddress(url,signal,lookupAddress) {
  signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g,'');
  const family = isIP(hostname);
  const answers = family ? [{address:hostname,family}]
    : await abortable(lookupAddress(hostname,{all:true}),signal);
  if (!answers.length || answers.some(({address})=>!publicAddress(address))) {
    throw new ImportError(502,'Źródło przepisu musi być publicznie dostępne.');
  }
  return answers[0];
}

function requestPage(url,address,signal,headers) {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve,reject)=>{
    const req = request(url,{
      agent:false,
      headers:{...headers,'accept-encoding':'identity'},
      maxHeaderSize:16*1024,
      signal,
      family:address.family,
      autoSelectFamily:false,
      // Preserve the domain for the Host header and TLS. The socket uses the checked address.
      lookup:(_hostname,options,callback)=>{
        if (options.all) callback(null,[address]);
        else callback(null,address.address,address.family);
      }
    },resolve);
    req.once('error',reject);
    req.end();
  });
}

async function readBody(upstream,limit,message) {
  const encoding = upstream.headers['content-encoding'] || 'identity';
  if (encoding.toLowerCase() !== 'identity') {
    upstream.destroy();
    throw new ImportError(502,'Strona odesłała nieobsługiwany format danych.');
  }
  if (Number(upstream.headers['content-length']) > limit) {
    upstream.destroy();
    throw new ImportError(413,message);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of upstream) {
    size += chunk.length;
    if (size > limit) throw new ImportError(413,message);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,size);
}

async function openSource(value,signal,accept,referer,{lookupAddress=lookup,getPage=requestPage}={}) {
  let url = sourceUrl(value);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const address = await resolveAddress(url,signal,lookupAddress);
    const headers = {accept};
    if (referer) headers.referer = url.origin+'/';
    const upstream = await getPage(url,address,signal,headers);
    if ([301,302,303,307,308].includes(upstream.statusCode)) {
      upstream.destroy();
      if (redirects === MAX_REDIRECTS || !upstream.headers.location) {
        throw new ImportError(502,'Strona przekierowuje zbyt wiele razy lub nie podała adresu docelowego.');
      }
      url = sourceUrl(upstream.headers.location,url);
      continue;
    }
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      upstream.destroy();
      throw new ImportError(502,'Nie udało się pobrać danych ze strony.');
    }
    return {url:url.href,upstream};
  }
}

export async function loadRecipe(value,signal,dependencies) {
  const {url,upstream} = await openSource(value,signal,'text/html,application/xhtml+xml',false,dependencies);
  const contentType = upstream.headers['content-type'] || '';
  if (!/^(text\/html|application\/xhtml\+xml)\s*(?:;|$)/i.test(contentType)) {
    upstream.destroy();
    throw new ImportError(415,'Podany adres nie prowadzi do strony HTML.');
  }
  const bytes = await readBody(upstream,MAX_HTML_BYTES,'Strona z przepisem jest za duża.');
  const charset = contentType.match(/;\s*charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || 'utf-8';
  let decoder;
  try { decoder = new TextDecoder(charset); }
  catch { decoder = new TextDecoder(); }
  return {url,html:decoder.decode(bytes)};
}

function matchesImageType(bytes,type) {
  switch (type) {
    case 'image/jpeg': return bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
    case 'image/png': return bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
    case 'image/webp': return bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
    case 'image/gif': return ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6));
    case 'image/avif': {
      if (bytes.length<16 || bytes.toString('ascii',4,8)!=='ftyp') return false;
      const end = Math.min(bytes.readUInt32BE(0),bytes.length);
      if (end<16) return false;
      if (['avif','avis'].includes(bytes.toString('ascii',8,12))) return true;
      for (let offset=16; offset+4<=end; offset+=4) {
        if (['avif','avis'].includes(bytes.toString('ascii',offset,offset+4))) return true;
      }
      return false;
    }
    default: return false;
  }
}

export async function loadImage(value,signal,dependencies) {
  const {upstream} = await openSource(value,signal,IMAGE_TYPES.join(','),true,dependencies);
  const type = (upstream.headers['content-type'] || '').split(';',1)[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) {
    upstream.destroy();
    throw new ImportError(415,'Adres nie prowadzi do obsługiwanego zdjęcia.');
  }
  const bytes = await readBody(upstream,MAX_IMAGE_BYTES,'Zdjęcie jest za duże.');
  if (!matchesImageType(bytes,type)) throw new ImportError(415,'Dane zdjęcia mają nieobsługiwany format.');
  return {bytes,type};
}

export async function loadJson(value,signal,dependencies) {
  const accept = 'application/json,application/ld+json,text/plain;q=0.8,application/octet-stream;q=0.5';
  const {url,upstream} = await openSource(value,signal,accept,false,dependencies);
  const type = (upstream.headers['content-type'] || '').split(';',1)[0].trim().toLowerCase();
  const isJson = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(type);
  if (!isJson && !['text/plain','application/octet-stream'].includes(type)) {
    upstream.destroy();
    throw new ImportError(415,'Adres nie prowadzi do pliku JSON.');
  }
  const bytes = await readBody(upstream,MAX_JSON_BYTES,'Plik JSON jest za duży.');
  let json;
  try {
    json = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    JSON.parse(json);
  } catch {
    throw new ImportError(415,'Plik nie zawiera prawidłowych danych JSON w kodowaniu UTF-8.');
  }
  return {url,json};
}

export function createImportServer({
  origin=process.env.APP_ORIGIN || 'https://marcinsuchy23-hue.github.io',
  importPath=process.env.IMPORT_PATH || '/',
  importRecipe=loadRecipe,
  importImage=loadImage,
  importJson=loadJson
}={}) {
  let active = 0;
  const recentRequests = {url:[],image:[],json:[]};
  const limits = {url:RECIPES_PER_MINUTE,image:IMAGES_PER_MINUTE,json:JSON_PER_MINUTE};
  const server = createServer({headersTimeout:10000,requestTimeout:10000},async(req,res)=>{
    const headers = {
      'Content-Type':'text/plain; charset=utf-8',
      'X-Content-Type-Options':'nosniff',
      'Cache-Control':'no-store',
      Vary:'Origin'
    };
    const reply = (status,body)=>{
      if (!res.destroyed) res.writeHead(status,headers).end(body);
    };
    let requestUrl;
    try { requestUrl = new URL(req.url,'http://localhost'); }
    catch { return reply(400,'Niepoprawne żądanie.'); }
    if (requestUrl.pathname === '/health' && req.method === 'GET') return reply(200,'OK');
    if (requestUrl.pathname !== importPath) return reply(404,'Nie znaleziono.');
    if (req.headers.origin !== origin) return reply(403,'Niedozwolone źródło żądania.');
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Expose-Headers'] = 'X-Recipe-URL';
    if (req.method !== 'GET') {
      headers.Allow = 'GET';
      return reply(405,'Dozwolona metoda GET.');
    }
    const selectors = Object.keys(recentRequests).filter(key=>requestUrl.searchParams.has(key));
    if (selectors.length > 1) return reply(400,'Podaj jeden adres przepisu, pliku JSON lub zdjęcia.');
    const selector = selectors[0] || 'url';
    const recent = recentRequests[selector];
    const now = Date.now();
    while (recent.length && recent[0] <= now-60000) recent.shift();
    if (active >= MAX_ACTIVE || recent.length >= limits[selector]) {
      headers['Retry-After'] = '60';
      return reply(429,'Za dużo żądań. Spróbuj ponownie za chwilę.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),TIMEOUT_MS);
    res.once('close',()=>controller.abort());
    active++;
    recent.push(now);
    try {
      const source = requestUrl.searchParams.get(selector);
      if (selector === 'image') {
        const {bytes,type} = await importImage(source,controller.signal);
        headers['Content-Type'] = type;
        return reply(200,bytes);
      }
      if (selector === 'json') {
        const {url,json} = await importJson(source,controller.signal);
        headers['Content-Type'] = 'application/json; charset=utf-8';
        headers['X-Recipe-URL'] = url;
        return reply(200,json);
      }
      const {url,html} = await importRecipe(source,controller.signal);
      headers['X-Recipe-URL'] = url;
      return reply(200,html);
    } catch (error) {
      if (controller.signal.aborted) return reply(504,'Strona odpowiada zbyt długo.');
      if (error instanceof ImportError) return reply(error.status,error.message);
      return reply(502,'Nie udało się pobrać strony z przepisem.');
    } finally {
      active--;
      clearTimeout(timeout);
    }
  });
  server.maxConnections = 128;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8080);
  createImportServer().listen(port,'0.0.0.0',()=>console.log('Recipe import service is listening on port '+port));
}
