(() => {
  'use strict';

  const asList = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const hasType = (value, type) => asList(value).some(item =>
    typeof item === 'string' && (item === type || item.endsWith('/'+type) || item === 'schema:'+type));

  function recipeUrl(value, base) {
    if (typeof value!=='string' || !value) return null;
    try {
      const url = new URL(value,base);
      if (url.protocol!=='https:' && url.protocol!=='http:') return null;
      const host = url.hostname.replace(/^www\./,'')+(url.port ? ':'+url.port : '');
      const path = url.pathname.replace(/\/+$/,'') || '/';
      for (const key of [...url.searchParams.keys()]) {
        if (/^utm_|^(?:fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
      }
      url.searchParams.sort();
      return {host,key:host+path+url.search};
    } catch {
      return null;
    }
  }

  function parse(html, sourceUrl, responseUrl) {
    // Templates keep the fetched markup inert, including its images and iframes.
    const parsed = new DOMParser().parseFromString('', 'text/html');
    const page = parsed.createElement('template');
    const inline = parsed.createElement('template');
    page.innerHTML = html;

    function plainText(value) {
      if (typeof value !== 'string') return '';
      inline.innerHTML = value.replace(/<\/?(?:br|p|li|div)\b[^>]*>/gi, '\n');
      inline.content.querySelectorAll('script,style,template').forEach(node => node.remove());
      return inline.content.textContent.replace(/[^\S\n]+/g, ' ').replace(/ *\n+ */g, '\n').trim();
    }

    function normalize(recipe) {
      const name = plainText(recipe.name);
      const description = plainText(recipe.description);
      const ingredients = asList(recipe.recipeIngredient).flatMap(item =>
        plainText(typeof item === 'string' ? item : item?.text || item?.name).split('\n').filter(Boolean));
      const instructions = [];

      function readInstructions(items, sectionName = '') {
        let steps = [];
        const flush = () => {
          if (steps.length) instructions.push({name:sectionName,steps});
          steps = [];
        };
        for (const item of asList(items)) {
          const children = item?.itemListElement || item?.steps;
          if (children) {
            flush();
            readInstructions(children, plainText(item.name) || sectionName);
          } else {
            steps.push(...plainText(typeof item === 'string' ? item : item?.text || item?.name).split('\n').filter(Boolean));
          }
        }
        flush();
      }

      readInstructions(recipe.recipeInstructions);
      if (!name || (!ingredients.length && !instructions.length)) return null;
      const yieldText = asList(recipe.recipeYield).filter(value => ['string','number'].includes(typeof value)).join(' ');
      const yieldNumber = Number(yieldText.match(/\b\d+\b/)?.[0]);
      const servings = Number.isInteger(yieldNumber) && yieldNumber >= 1 && yieldNumber <= 100 ? yieldNumber : 1;
      return {name,description,servings,ingredients,instructions};
    }

    const base = responseUrl || sourceUrl;
    const input = recipeUrl(sourceUrl);
    const effective = recipeUrl(responseUrl);
    const canonical = recipeUrl(page.content.querySelector('link[rel~="canonical"]')?.getAttribute('href'),base);
    const expected = new Set([effective?.key,input?.key]);
    if (canonical && (canonical.host===effective?.host || canonical.host===input?.host)) expected.add(canonical.key);

    function findRecipe(candidates) {
      const urlsOf = candidate=>{
        const links = [candidate.url,candidate.mainEntityOfPage?.['@id'],candidate.mainEntityOfPage];
        const addresses = links.map(link=>recipeUrl(link,base)).filter(Boolean);
        if (addresses.length) return addresses;
        const identifier = recipeUrl(candidate['@id'],base);
        return identifier ? [identifier] : [];
      };
      const unlinked = [];
      for (const candidate of candidates) {
        const urls = urlsOf(candidate);
        if (urls.some(url=>expected.has(url.key))) {
          const recipe = normalize(candidate);
          if (recipe) return recipe;
        } else if (!urls.length) {
          const recipe = normalize(candidate);
          if (recipe) unlinked.push(recipe);
        }
      }
      return unlinked.length===1 ? unlinked[0] : null;
    }

    const candidates = [];
    for (const script of page.content.querySelectorAll('script[type="application/ld+json"]')) {
      let schema;
      try {
        schema = JSON.parse(script.textContent);
      } catch {
        continue;
      }
      const nodes = [schema];
      while (nodes.length) {
        const node = nodes.pop();
        if (!node || typeof node !== 'object') continue;
        if (hasType(node['@type'], 'Recipe')) candidates.push(node);
        const children = Object.values(node);
        for (let i=children.length-1;i>=0;i--) {
          if (children[i] && typeof children[i]==='object') nodes.push(children[i]);
        }
      }
    }
    const jsonRecipe = findRecipe(candidates);
    if (jsonRecipe) return jsonRecipe;

    // Some publishers mark up recipes directly in the page instead of using JSON-LD.
    const fields = (scope, property) => [...scope.querySelectorAll(`[itemprop~="${property}"]`)].filter(item =>
      item.parentElement?.closest('[itemscope]') === scope);
    const valueOf = item => item?.getAttribute('content') ?? item?.getAttribute('value') ?? item?.textContent;
    function readInstruction(item) {
      const children = item.hasAttribute('itemscope') ? fields(item,'itemListElement') : [];
      const name = valueOf(fields(item,'name')[0]);
      if (children.length) return {name,itemListElement:children.map(readInstruction)};
      return {name,text:valueOf(fields(item,'text')[0]) ?? valueOf(item)};
    }

    const microdata = [];
    for (const scope of page.content.querySelectorAll('[itemscope][itemtype]')) {
      if (!hasType(scope.getAttribute('itemtype').split(/\s+/), 'Recipe')) continue;
      const link = fields(scope,'url')[0];
      microdata.push({
        url:link?.getAttribute('href') || link?.getAttribute('content'),
        '@id':scope.getAttribute('itemid'),
        name:valueOf(fields(scope,'name')[0]),
        description:valueOf(fields(scope,'description')[0]),
        recipeYield:fields(scope,'recipeYield').map(valueOf),
        recipeIngredient:fields(scope,'recipeIngredient').map(valueOf),
        recipeInstructions:fields(scope,'recipeInstructions').map(readInstruction)
      });
    }
    const microdataRecipe = findRecipe(microdata);
    if (microdataRecipe) return microdataRecipe;

    const visible = node=>!node.closest('nav,aside,footer,[hidden],[aria-hidden="true"]');
    const pageTitle = [...page.content.querySelectorAll('h1')].filter(visible);
    function readVisibleRecipe(scope) {
      const title = scope===page.content ? pageTitle : [...scope.querySelectorAll('h1')].filter(visible);
      const heading = title.length===1 ? title[0] : !title.length&&pageTitle.length===1 ? pageTitle[0] : null;
      if (!heading) return null;
      const ingredients = [], steps = [];
      let section, level;
      for (const node of scope.querySelectorAll('h2,h3,h4,h5,h6,li,p')) {
        if (!visible(node)) continue;
        if (/^H[2-6]$/.test(node.tagName)) {
          const depth = Number(node.tagName[1]);
          const label = node.textContent.trim();
          if (/^(?:składniki|ingredients)(?:\s*[:–—-]\s*.*|\s+na\b.*)?$/iu.test(label)) {
            if (ingredients.length&&steps.length) break;
            section = ingredients;
            level = depth;
          } else if (/^(?:przygotowanie|sposób przygotowania|jak przygotować|wykonanie|directions|instructions|method)\s*:?$/iu.test(label)) {
            section = steps;
            level = depth;
          } else if (depth<=level) {
            if (ingredients.length&&steps.length) break;
            section = undefined;
          }
          continue;
        }
        if (section && section.length<100 && !node.parentElement?.closest('li') && node.textContent.trim()) {
          section.push(node.innerHTML);
        }
      }
      if (!ingredients.length || !steps.length) return null;
      return normalize({name:heading.innerHTML,recipeIngredient:ingredients,recipeInstructions:steps});
    }

    // A page without Recipe metadata still works when it labels both recipe sections.
    const scopes = [...page.content.querySelectorAll('article,main')].slice(0,32);
    for (const scope of [...scopes,page.content]) {
      const recipe = readVisibleRecipe(scope);
      if (recipe) return recipe;
    }
    return null;
  }

  globalThis.recipeLinkImport = {parse};
})();
