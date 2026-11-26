(() => {
  'use strict';

  const asList = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const hasType = (value, type) => asList(value).some(item =>
    typeof item === 'string' && (item === type || item.endsWith('/'+type) || item === 'schema:'+type));

  function parse(html, sourceUrl) {
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
        nodes.push(...Object.values(node).filter(value => value && typeof value === 'object').reverse());
      }
    }

    function matchesSource(candidate) {
      const candidatesUrls = [candidate.url, candidate['@id'], candidate.mainEntityOfPage?.['@id'], candidate.mainEntityOfPage];
      return candidatesUrls.some(value => {
        if (typeof value !== 'string' || !sourceUrl) return false;
        try {
          const url = new URL(value, sourceUrl);
          const source = new URL(sourceUrl);
          return url.origin === source.origin && url.pathname === source.pathname;
        } catch {
          return false;
        }
      });
    }

    for (const candidate of [...candidates.filter(matchesSource), ...candidates]) {
      const recipe = normalize(candidate);
      if (recipe) return recipe;
    }

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

    for (const scope of page.content.querySelectorAll('[itemscope][itemtype]')) {
      if (!hasType(scope.getAttribute('itemtype').split(/\s+/), 'Recipe')) continue;
      const recipe = normalize({
        name:valueOf(fields(scope,'name')[0]),
        description:valueOf(fields(scope,'description')[0]),
        recipeYield:fields(scope,'recipeYield').map(valueOf),
        recipeIngredient:fields(scope,'recipeIngredient').map(valueOf),
        recipeInstructions:fields(scope,'recipeInstructions').map(readInstruction)
      });
      if (recipe) return recipe;
    }
    return null;
  }

  globalThis.recipeLinkImport = {parse};
})();
