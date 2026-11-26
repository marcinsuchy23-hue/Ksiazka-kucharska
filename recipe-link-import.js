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
          const children = Array.isArray(item) ? item : item?.itemListElement || item?.steps;
          if (children) {
            flush();
            readInstructions(children,plainText(item.name)||sectionName,schemaPhotos(item.image));
            continue;
          }
          const value = typeof item==='string' ? item : item?.text || item?.name;
          const lines = plainText(value).split('\n').map(line=>line.trim()).filter(line=>line && !/^\d+$/u.test(line));
          if (!lines.length) continue;
          const stepPhotos = [...schemaPhotos(item?.image),...photosFromHtml(value)];
          const name = typeof item==='object' && item?.text ? plainText(item.name) : '';
          if (name && !sectionName) {
            flush();
            instructions.push({name,steps:lines,photos:unique(stepPhotos)});
          } else {
            steps.push(...lines);
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
    const scopePhoto = item=>item && (elementPhoto(item) || elementPhoto(fields(item,'contentUrl')[0]) ||
      elementPhoto(fields(item,'url')[0]) || elementPhoto(item.querySelector('img')));
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
      const richerLayout = other.length>instructions.length && other.some(stage=>stage.photos.length);
      if (!mainText || (containsSteps && (otherText.length>mainText.length || richerLayout))) return mergePhotos(other,instructions);
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

    const ignored = 'nav,aside,footer,form,button,script,style,template,figcaption,noscript,svg,[hidden],[aria-hidden="true"],[role="complementary"],.advertisement,[class*="ads-slot"],[class*="related-"],[class*="newsletter"],[class~="comments"],[class~="recipe-tools"]';
    const visible = node=>!node.closest(ignored);
    function recipeHeadings(scope) {
      const headings = [...scope.querySelectorAll('h1')].filter(visible);
      return [...new Map(headings.map(node=>[normalizedText(node.textContent),node])).values()];
    }
    const pageTitle = recipeHeadings(page.content);
    const stepBlocks = '.recipe-step,.recipeStep,.step-content,.stepContent,.recipe-step-content,.step';
    const methodBlocks = '.recipe-steps,.recipe-instructions,.recipe-preparation,.preparation-instructions';
    const ingredientHeading = /^(?:składniki|ingredients)(?:\s*[:–—-]\s*.*|\s+na\b.*)?$/iu;
    const methodHeading = /^(?:przygotowanie|sposób przygotowania|wykonanie|directions|instructions|method|kroki postępowania|krok po kroku)(?:\s*[:–—-]\s*.*)?$|^przepis i sposób przygotowania na\b|^jak (?:to )?(?:zrobić|przygotować|przyrządzić|ugotować|usmażyć|upiec)(?=\s|[?:]|$)/iu;
    const stepHeading = /^(?:krok|etap|step)\s+\d+\b/iu;
    const endHeading = /^(?:komentarz(?:e|y)?|zobacz (?:także|też|podobne|również)|(?:inne|podobne|polecane|powiązane) przepisy|polecane|newsletter|użyj w przepisie|ten przepis w waszym wykonaniu|wartości odżywcze|ocena(?: przepisu)?|related recipes|leave a comment)\b/iu;
    const headingSelector = 'h1,h2,h3,h4,h5,h6';

    function orderedInstructions(scope,start,depth=1) {
      const range = parsed.createRange();
      if (start?.matches(headingSelector) && stepHeading.test(start.textContent.trim())) range.setStartBefore(start);
      else if (start) range.setStartAfter(start);
      else range.setStart(scope,0);
      range.setEnd(scope,scope.childNodes.length);
      const instructions = [];
      let name = '', chunks = [], photos = [], stopped = false;
      const lines = ()=>chunks.join('').replace(/[^\S\n]+/g,' ').split(/\n+/u)
        .map(line=>line.trim()).filter(line=>line && !/^\d+$/u.test(line));
      function flush() {
        const steps = lines();
        if (steps.length) instructions.push({name,steps,photos:unique(photos)});
        else if (photos.length && instructions.length) {
          const previous = instructions.at(-1);
          previous.photos = unique([...previous.photos,...photos]);
        }
        chunks = [];
        photos = [];
        name = '';
      }

      function walk(node,explicitStep=false) {
        if (stopped || instructions.length>=100) return;
        if (node.nodeType===3) {
          chunks.push(node.textContent);
          return;
        }
        if (node.nodeType!==1 || !visible(node)) return;
        if (node.matches(headingSelector)) {
          const label = node.textContent.trim();
          if (endHeading.test(label)) stopped = true;
          else if (stepHeading.test(label)) {
            flush();
            name = label;
          } else if (!methodHeading.test(label) && Number(node.tagName[1])<=depth) stopped = true;
          return;
        }
        if (node.matches('img')) {
          const photo = elementPhoto(node);
          if (photo) {
            photos.push(photo);
            if (!explicitStep && chunks.some(chunk=>chunk.trim())) flush();
          }
          return;
        }
        if (node.matches('br')) {
          chunks.push('\n');
          return;
        }
        const step = !explicitStep && node.matches(stepBlocks);
        const block = node.matches('p,li,div,section,blockquote,pre');
        if (step && chunks.some(chunk=>chunk.trim())) flush();
        if (block) chunks.push('\n');
        for (const child of node.childNodes) walk(child,explicitStep||step);
        if (block) chunks.push('\n');
        if (step) flush();
      }

      for (const node of range.cloneContents().childNodes) walk(node);
      flush();
      return instructions;
    }

    function readVisibleRecipe(scope, assumeMethod = false) {
      const title = scope===page.content ? pageTitle : recipeHeadings(scope);
      const heading = title.length===1 ? title[0] : !title.length&&pageTitle.length===1 ? pageTitle[0] : null;
      const metaTitle = page.content.querySelector('meta[property="og:title"]')?.getAttribute('content');
      const fallback = !heading && !pageTitle.length && metaTitle
        ? [...scope.querySelectorAll('h2')].filter(visible).find(node=>{
          const label = normalizedText(node.textContent);
          return label && normalizedText(metaTitle).includes(label);
        }) : null;
      const titleNode = heading || fallback;
      if (!titleNode) return null;
      const titleText = normalizedText(titleNode.textContent);
      const matchesMetadata = [jsonRecipe,microdataRecipe].some(recipe=>recipe && normalizedText(recipe.name)===titleText);
      const ingredients = [];
      let collecting = false, level = 1, methodStart = null, ingredientEnd = null, uncertainLayout = false;
      for (const node of scope.querySelectorAll('h2,h3,h4,h5,h6,li,p')) {
        if (!visible(node)) continue;
        if (node.matches(headingSelector)) {
          const depth = Number(node.tagName[1]);
          const label = node.textContent.trim();
          const headingText = normalizedText(label);
          const matchesTitle = (matchesMetadata || ingredients.length) &&
            (headingText===titleText+' przepis' || headingText==='przepis na '+titleText ||
              (collecting && headingText===titleText));
          if (ingredientHeading.test(label)) {
            collecting = true;
            level = depth;
          } else if (methodHeading.test(label) || matchesTitle ||
              (collecting && ingredients.length && (/^przepis na\s/iu.test(label) || stepHeading.test(label)))) {
            methodStart = node;
            break;
          } else if (collecting && ingredients.length && depth<=level) {
            if (scope!==page.content && !endHeading.test(label)) {
              methodStart = node;
              uncertainLayout = true;
            }
            break;
          }
          continue;
        }
        if (!collecting || node.parentElement?.closest('li') || !node.textContent.trim() || ingredients.length>=100) continue;
        if (node.matches('p') && ingredientEnd && !node.closest('ul,ol,dl')) break;
        ingredients.push(node.innerHTML);
        const list = node.closest('ul,ol,dl');
        if (list && scope.contains(list)) ingredientEnd = list;
      }
      const boundary = methodStart || ingredientEnd;
      const startDepth = methodStart ? Number(methodStart.tagName[1]) : level;
      const methodContainer = methodStart?.parentElement;
      const scoped = methodContainer && methodContainer!==scope && scope.contains(methodContainer) &&
        !stepHeading.test(methodStart.textContent.trim()) ? orderedInstructions(methodContainer,methodStart,startDepth) : [];
      const instructions = scoped.length ? scoped : assumeMethod || boundary ? orderedInstructions(scope,boundary,startDepth) : [];
      const recipe = normalize({
        name:titleNode.innerHTML,
        description:valueOf(scope.querySelector('[itemprop~="description"]')),
        recipeYield:valueOf(scope.querySelector('[itemprop~="recipeYield"],.field-name-field-ilosc-porcji')),
        recipeIngredient:ingredients,
        image:scopePhoto(scope.querySelector('[itemprop~="image"]'))
      });
      if (recipe) {
        recipe.instructions = instructions;
        recipe.uncertainLayout = Boolean(instructions.length && (uncertainLayout || !methodStart&&!assumeMethod));
        return recipe;
      }
      if (instructions.length && (assumeMethod || matchesMetadata)) {
        return {name:plainText(titleNode.innerHTML),description:'',servings:1,ingredients,instructions,coverPhoto:'',uncertainLayout};
      }
      return null;
    }

    const recipeScopes = [...page.content.querySelectorAll('[itemscope][itemtype]')]
      .filter(scope=>hasType(scope.getAttribute('itemtype').split(/\s+/),'Recipe'));
    const scopes = [...recipeScopes,...page.content.querySelectorAll('article,main')].slice(0,32);
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
      const instructions = supplementInstructions(recipe.instructions,alternative.instructions);
      if (instructions.length===alternative.instructions.length &&
          instructions.every((stage,index)=>stage.steps===alternative.instructions[index].steps)) {
        recipe.uncertainLayout = Boolean(alternative.uncertainLayout);
      }
      recipe.instructions = instructions;
    }
    const recipeTitle = normalizedText(recipe.name);
    const methodScopes = [...page.content.querySelectorAll('[itemprop~="recipeInstructions"]')]
      .filter(node=>visible(node) && node.children.length && !node.parentElement?.closest('[itemprop~="recipeInstructions"]'))
      .slice(0,16);
    for (const scope of methodScopes) {
      const owner = scope.closest('[itemscope][itemtype]');
      const ownerNames = owner && hasType(owner.getAttribute('itemtype').split(/\s+/),'Recipe')
        ? fields(owner,'name').map(item=>normalizedText(plainText(valueOf(item)))).filter(Boolean) : [];
      if (ownerNames.length && !ownerNames.includes(recipeTitle)) continue;
      const ingredientsArea = scope.querySelector('[itemprop~="recipeIngredient"],[id*="Ingredients"],[class*="ingredients"]');
      const headings = [...scope.querySelectorAll(headingSelector)].filter(node=>visible(node) && !endHeading.test(node.textContent.trim()));
      const afterIngredients = headings.filter(node=>!ingredientsArea || ingredientsArea.compareDocumentPosition(node)&4 && !ingredientsArea.contains(node));
      const methodTitle = afterIngredients.find(node=>{
        const label = normalizedText(node.textContent);
        return methodHeading.test(node.textContent.trim()) || label===recipeTitle+' przepis' || label==='przepis na '+recipeTitle;
      }) || afterIngredients.find(node=>normalizedText(node.textContent)===recipeTitle);
      if (ingredientsArea && !methodTitle) continue;
      const instructions = orderedInstructions(scope,methodTitle,methodTitle ? Number(methodTitle.tagName[1]) : 1);
      if (!instructions.length) continue;
      const merged = supplementInstructions(recipe.instructions,instructions);
      if (methodTitle && ingredientsArea && ownerNames.includes(recipeTitle) && instructions.some(stage=>stage.photos.length)) {
        recipe.instructions = instructions;
        recipe.uncertainLayout = false;
      } else {
        recipe.instructions = merged;
      }
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
