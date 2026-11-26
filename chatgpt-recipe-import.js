(() => {
  'use strict';

  const maxImportLength = 524288;
  const recipeLinkPrefix = '#receptura=';
  const recipeKeys = ['version','name','category','servings','ingredients','preparation','description','components','notes'];
  const componentKeys = ['name','ingredients','preparation','notes'];
  const ingredientKeys = ['name','quantity','unit'];
  const numberText = new Intl.NumberFormat('en-US',{useGrouping:false,maximumSignificantDigits:21});

  function checkObject(value,label,keys) {
    if (!value || typeof value!=='object' || Array.isArray(value)) {
      throw new Error(`${label} powinien mieć postać obiektu JSON.`);
    }
    for (const key of Object.keys(value)) {
      if (!keys.includes(key)) {
        throw new Error(`${label} zawiera nieobsługiwane pole „${key.slice(0,50)}”.`);
      }
    }
  }

  function readText(value,label,max,{allowEmpty=false,optional=false}={}) {
    if (optional && value===undefined) return '';
    if (typeof value!=='string') throw new Error(`${label} musi być tekstem.`);
    const text = value.trim();
    if (!allowEmpty && !text) throw new Error(`${label} nie może być puste.`);
    if (text.length>max) throw new Error(`${label} może mieć najwyżej ${max} znaków.`);
    return text;
  }

  function readSingleLine(...args) {
    return readText(...args).replace(/[ \t]*[\r\n]+[ \t]*/g,' ');
  }

  function readList(value,label,max) {
    if (!Array.isArray(value)) throw new Error(`${label} musi być listą.`);
    if (value.length>max) throw new Error(`${label} może mieć najwyżej ${max} pozycji.`);
    return value;
  }

  function readIngredients(value,label) {
    return readList(value,`Lista składników (${label})`,150).map((item,index)=>{
      const position = `Składnik ${index+1} (${label})`;
      checkObject(item,position,ingredientKeys);
      const name = readSingleLine(item.name,`Pole „name” w pozycji ${position}`,200);
      const unit = readSingleLine(item.unit,`Pole „unit” w pozycji ${position}`,30,{allowEmpty:true});
      let quantity = '';
      if (typeof item.quantity==='number' && Number.isFinite(item.quantity) && item.quantity>=0) {
        quantity = item.quantity===0 ? '0' : numberText.format(item.quantity);
      } else if (typeof item.quantity==='string') {
        quantity = readSingleLine(item.quantity,`Pole „quantity” w pozycji ${position}`,40,{allowEmpty:true});
      } else if (item.quantity!==null) {
        throw new Error(`${position} musi mieć pole „quantity” z liczbą nieujemną, tekstem lub wartością null.`);
      }
      return {name,amount:[quantity,unit].filter(Boolean).join(' ')};
    });
  }

  function readPreparation(value,label) {
    return readList(value,`Lista kroków (${label})`,100).map((step,index)=>
      readText(step,`Pole kroku ${index+1} (${label})`,4000));
  }

  function readComponent(item,index) {
    const label = `Półprodukt ${index+1}`;
    checkObject(item,label,componentKeys);
    const name = readSingleLine(item.name,`Pole „name” w części ${label}`,60);
    const ingredients = readIngredients(item.ingredients,label);
    const steps = readPreparation(item.preparation,label);
    const notes = readText(item.notes,`Pole „notes” w części ${label}`,4000,{allowEmpty:true,optional:true});
    if (!ingredients.length && !steps.length) throw new Error(`${label} musi zawierać składnik lub krok przygotowania.`);
    const instructions = [...steps,...(notes ? [`Uwagi: ${notes}`] : [])].join('\n\n');
    return {name,ingredients,instructions};
  }

  function parse(text) {
    if (typeof text!=='string') throw new Error('Wklej przepis w formacie JSON.');
    if (text.length>maxImportLength) throw new Error('Tekst jest za długi. Maksymalna długość to 524 288 znaków.');
    const source = text.trim();
    if (!source) throw new Error('Wklej przepis w formacie JSON.');
    const fenced = /^\x60{3}(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}$/iu.exec(source);
    let recipe;
    try {
      recipe = JSON.parse(fenced ? fenced[1].trim() : source);
    } catch {
      throw new Error('Wklejony tekst nie jest poprawnym JSON-em. Skopiuj cały przepis z ChatGPT.');
    }
    checkObject(recipe,'Przepis',recipeKeys);
    if (recipe.version!==1) throw new Error('W polu „version” wpisz liczbę 1.');

    const name = readSingleLine(recipe.name,'Pole „name” z nazwą przepisu',90);
    const categoryName = readSingleLine(recipe.category,'Pole „category” z nazwą działu',70);
    if (!Number.isInteger(recipe.servings) || recipe.servings<1 || recipe.servings>100) {
      throw new Error('Pole „servings” musi zawierać liczbę całkowitą od 1 do 100.');
    }
    const description = readText(recipe.description,'Pole „description”',280,{allowEmpty:true,optional:true});
    const remarks = readText(recipe.notes,'Pole „notes”',4000,{allowEmpty:true,optional:true});
    const ingredients = readIngredients(recipe.ingredients,'Przygotowanie');
    const steps = readPreparation(recipe.preparation,'Przygotowanie');
    if (!steps.length) throw new Error('Lista „preparation” musi zawierać przynajmniej jeden krok.');
    const sections = recipe.components===undefined ? [] : readList(recipe.components,'Lista półproduktów',20).map(readComponent);
    sections.push({name:'Przygotowanie',ingredients,instructions:steps.join('\n\n')});
    return {categoryName,draft:{name,servings:recipe.servings,description,remarks,sections}};
  }

  function parseLink(hash) {
    if (typeof hash!=='string' || !hash.startsWith(recipeLinkPrefix)) return null;
    const payload = hash.slice(recipeLinkPrefix.length);
    if (!payload) throw new Error('W linku brakuje danych przepisu.');
    if (payload.length>maxImportLength) throw new Error('Link jest za długi. Wczytaj recepturę z pliku JSON.');

    let text;
    try {
      if (payload.startsWith('b64:')) {
        const encoded = payload.slice(4);
        if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || encoded.length%4===1) throw new Error('Invalid base64url');
        const binary = atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));
        text = new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,char=>char.charCodeAt(0)));
      } else {
        text = decodeURIComponent(payload);
      }
    } catch {
      throw new Error('Link zawiera uszkodzone dane przepisu.');
    }

    try {
      return parse(text);
    } catch (error) {
      throw new Error(`Nie udało się odczytać receptury z linku. ${error.message}`);
    }
  }

  globalThis.chatGPTRecipeImport = {parse,parseLink};
})();
