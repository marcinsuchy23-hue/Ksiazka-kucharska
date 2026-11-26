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
    const base = responseUrl || sourceUrl;
    const unique = items=>[...new Set(items)];
    page.innerHTML = html;

    function photoUrl(value) {
      if (typeof value!=='string' || !value.trim()) return '';
      try {
        const url = new URL(value.trim(),base);
        if ((url.protocol==='https:' || url.protocol==='http:') && !url.username && !url.password) {
          url.hash = '';
          return url.href;
        }
      } catch {}
      return '';
    }

    function elementPhoto(image) {
      return ['data-src','data-original','data-lazy-src','src','content','href']
        .map(attribute=>photoUrl(image?.getAttribute(attribute))).find(Boolean) || '';
    }

    function photosFromHtml(value) {
      if (typeof value!=='string' || !/<img\b/i.test(value)) return [];
      inline.innerHTML = value;
      return [...inline.content.querySelectorAll('img')].map(elementPhoto).filter(Boolean);
    }

    function schemaPhotos(images) {
      return asList(images).map(image=>typeof image==='string' ? photoUrl(image) :
        photoUrl(image?.contentUrl)||photoUrl(image?.url)||photoUrl(image?.['@id'])).filter(Boolean);
    }

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

      function readInstructions(items, sectionName = '', sectionPhotos = []) {
        let steps = [];
        let photos = sectionPhotos;
        const flush = () => {
          if (steps.length) instructions.push({name:sectionName,steps,photos:unique(photos)});
          steps = [];
          photos = [];
        };
        for (const item of asList(items)) {
          const children = item?.itemListElement || item?.steps;
          if (children) {
            flush();
            readInstructions(children,plainText(item.name)||sectionName,schemaPhotos(item.image));
            continue;
          }
          const value = typeof item==='string' ? item : item?.text || item?.name;
          const text = plainText(value);
          if (!text) continue;
          const stepPhotos = [...schemaPhotos(item?.image),...photosFromHtml(value)];
          const name = typeof item==='object' && item?.text ? plainText(item.name) : '';
          if (stepPhotos.length && name && !sectionName) {
            flush();
            instructions.push({name,steps:text.split('\n'),photos:unique(stepPhotos)});
          } else {
            steps.push(...text.split('\n'));
            photos.push(...stepPhotos);
          }
        }
        flush();
      }

      readInstructions(recipe.recipeInstructions);
      if (!name || (!ingredients.length && !instructions.length)) return null;
      const yieldText = asList(recipe.recipeYield).filter(value => ['string','number'].includes(typeof value)).join(' ');
      const yieldNumber = Number(yieldText.match(/\b\d+\b/)?.[0]);
      const servings = Number.isInteger(yieldNumber) && yieldNumber >= 1 && yieldNumber <= 100 ? yieldNumber : 1;
      return {name,description,servings,ingredients,instructions,coverPhoto:schemaPhotos(recipe.image)[0]||''};
    }


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

    // Some publishers mark up recipes directly in the page instead of using JSON-LD.
    const fields = (scope, property) => [...scope.querySelectorAll(`[itemprop~="${property}"]`)].filter(item =>
      item.parentElement?.closest('[itemscope]') === scope);
    const valueOf = item => item?.getAttribute('content') ?? item?.getAttribute('value') ?? item?.innerHTML;
    const scopePhoto = item=>elementPhoto(item) || elementPhoto(fields(item,'contentUrl')[0]) ||
      elementPhoto(fields(item,'url')[0]) || elementPhoto(item.querySelector('img'));
    function readInstruction(item) {
      const children = item.hasAttribute('itemscope') ? fields(item,'itemListElement') : [];
      const name = valueOf(fields(item,'name')[0]);
      const image = fields(item,'image').map(scopePhoto);
      if (children.length) return {name,image,itemListElement:children.map(readInstruction)};
      return {name,image,text:valueOf(fields(item,'text')[0]) ?? valueOf(item)};
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
        recipeInstructions:fields(scope,'recipeInstructions').map(readInstruction),
        image:fields(scope,'image').map(scopePhoto)
      });
    }
    const microdataRecipe = findRecipe(microdata);

    const normalizedText = value=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('pl')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    const sameRecipe = (one,two)=>one && two && normalizedText(one.name)===normalizedText(two.name);
    const instructionsText = instructions=>normalizedText(instructions.flatMap(section=>section.steps).join(' '));
    function supplementInstructions(instructions,other) {
      const mainText = instructionsText(instructions), otherText = instructionsText(other);
      let position = 0;
      const containsSteps = instructions.flatMap(section=>section.steps).map(normalizedText).filter(Boolean).every(step=>{
        const index = otherText.indexOf(step,position);
        position = index+step.length;
        return index>=0;
      });
      if (!mainText || (otherText.length>mainText.length && containsSteps)) return mergePhotos(other,instructions);
      return mergePhotos(instructions,other);
    }
    function mergePhotos(instructions,other) {
      return instructions.map(section=>{
        const text = instructionsText([section]);
        const matching = other.filter(candidate=>{
          const alternate = instructionsText([candidate]);
          return alternate && text.includes(alternate);
        });
        return {...section,photos:unique([...section.photos,...matching.flatMap(candidate=>candidate.photos)])};
      });
    }

    const ignored = 'nav,aside,footer,[hidden],[aria-hidden="true"],[role="complementary"],.related-recipes,.advertisement';
    const visible = node=>!node.closest(ignored);
    const pageTitle = [...page.content.querySelectorAll('h1')].filter(visible);
    const stepBlocks = '.recipe-step,.recipeStep,.step-content,.stepContent,.recipe-step-content,.step';
    const methodBlocks = '.recipe-steps,.recipe-instructions,.recipe-preparation,.preparation-instructions';
    const ingredientHeading = /^(?:składniki|ingredients)(?:\s*[:–—-]\s*.*|\s+na\b.*)?$/iu;
    const methodHeading = /^(?:przygotowanie|sposób przygotowania|jak przygotować|wykonanie|directions|instructions|method|kroki postępowania|krok po kroku)(?:\s*[:–—-]\s*.*)?$|^przepis i sposób przygotowania na\b/iu;
    const stepHeading = /^(?:krok|etap|step)\s+\d+\b/iu;

    function readVisibleRecipe(scope, assumeMethod = false) {
      const title = scope===page.content ? pageTitle : [...scope.querySelectorAll('h1')].filter(visible);
      const heading = title.length===1 ? title[0] : !title.length&&pageTitle.length===1 ? pageTitle[0] : null;
      if (!heading) return null;
      const titleText = normalizedText(heading.textContent);
      const matchesMetadata = [jsonRecipe,microdataRecipe].some(recipe=>recipe && normalizedText(recipe.name)===titleText);
      const ingredients = [], steps = [];
      let section = assumeMethod ? 'method' : '', level = 1, stepName = '', text = [], photos = [];
      function flush() {
        if (text.length) steps.push({name:stepName,text:text.join('\n'),image:photos});
        stepName = '';
        text = [];
        photos = [];
      }
      for (const node of scope.querySelectorAll(`h2,h3,h4,h5,h6,li,p,img,${stepBlocks}`)) {
        if (!visible(node) || node.parentElement?.closest(stepBlocks) && scope.contains(node.parentElement.closest(stepBlocks))) continue;
        if (/^H[2-6]$/.test(node.tagName)) {
          const depth = Number(node.tagName[1]);
          const label = node.textContent.trim();
          const headingText = normalizedText(label);
          const matchesRecipeHeading = (matchesMetadata || ingredients.length) &&
            (headingText===titleText+' przepis' || headingText==='przepis na '+titleText);
          if (ingredientHeading.test(label)) {
            if (section==='method' && (steps.length || text.length)) break;
            section = 'ingredients';
            level = depth;
          } else if (methodHeading.test(label) || matchesRecipeHeading) {
            section = 'method';
            level = depth;
          } else if (section==='method' && stepHeading.test(label)) {
            flush();
            stepName = label;
          } else if (!assumeMethod && depth<=level) {
            if (section==='method' && (steps.length || text.length)) break;
            section = '';
          }
          continue;
        }
        if (!section || node.parentElement?.closest('li')) continue;
        if (section==='ingredients' && ingredients.length<100 && node.textContent.trim()) {
          ingredients.push(node.innerHTML);
        } else if (section==='method' && steps.length<100) {
          if (node.matches('img')) {
            photos.push(elementPhoto(node));
          } else if (node.textContent.trim()) {
            if (node.matches(stepBlocks)) {
              const name = text.length ? '' : stepName;
              flush();
              steps.push({name,text:node.innerHTML});
            } else {
              text.push(node.innerHTML);
            }
          }
        }
      }
      flush();
      return normalize({name:heading.innerHTML,recipeIngredient:ingredients,recipeInstructions:steps});
    }

    const scopes = [...page.content.querySelectorAll('article,main')].slice(0,32);
    const visibleRecipes = [...scopes,page.content].map(scope=>readVisibleRecipe(scope)).filter(Boolean);
    const explicitMethods = [...page.content.querySelectorAll(methodBlocks)].filter(visible).slice(0,16);
    for (const method of explicitMethods) {
      const recipe = readVisibleRecipe(method,true);
      if (recipe) visibleRecipes.push(recipe);
    }
    const recipe = jsonRecipe || microdataRecipe || visibleRecipes.find(item=>item.ingredients.length&&item.instructions.length);
    if (!recipe) return null;
    for (const alternative of [microdataRecipe,...visibleRecipes]) {
      if (alternative===recipe || !sameRecipe(recipe,alternative)) continue;
      if (!recipe.ingredients.length) recipe.ingredients = alternative.ingredients;
      if (!recipe.description) recipe.description = alternative.description;
      if (!recipe.coverPhoto) recipe.coverPhoto = alternative.coverPhoto;
      recipe.instructions = supplementInstructions(recipe.instructions,alternative.instructions);
    }
    if (!recipe.description) {
      recipe.description = plainText(page.content.querySelector('meta[property="og:description"]')?.getAttribute('content')) ||
        plainText(page.content.querySelector('meta[name="description"]')?.getAttribute('content'));
    }
    if (!recipe.coverPhoto) {
      recipe.coverPhoto = elementPhoto(page.content.querySelector('meta[property="og:image:secure_url"]')) ||
        elementPhoto(page.content.querySelector('meta[property="og:image"]'));
    }
    return recipe;
  }

  globalThis.recipeLinkImport = {parse};
})();
