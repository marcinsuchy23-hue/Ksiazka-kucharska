(() => {
  'use strict';

  const safeId = /^[A-Za-z0-9_-]{1,160}$/;

  function invalid() {
    throw new TypeError('Nieprawidłowa struktura kopii zapasowej.');
  }

  function record(value) {
    if (!value || typeof value!=='object' || Array.isArray(value)) invalid();
    return value;
  }

  function list(value,optional=false) {
    if (value===undefined && optional) return [];
    if (!Array.isArray(value)) invalid();
    return value;
  }

  function checkTextFields(value,fields) {
    for (const field of fields) {
      if (value[field]!==undefined && typeof value[field]!=='string') invalid();
    }
  }

  function checkId(value,seen) {
    if (typeof value!=='string' || !safeId.test(value) || Object.hasOwn(Object.prototype,value) || seen?.has(value)) invalid();
    seen?.add(value);
  }

  function checkEntity(value,seen) {
    record(value);
    checkId(value.id,seen);
    if (typeof value.name!=='string' || !value.name.trim()) invalid();
    checkTextFields(value,['photo']);
  }

  function checkedIngredient(value) {
    record(value);
    checkTextFields(value,['name','amount']);
    if (value.recipeLink!==undefined) checkId(value.recipeLink);
    if (value.tableLink!==undefined) {
      if (typeof value.tableLink!=='string') invalid();
      const parts = value.tableLink.split(':');
      if (parts.length!==2) invalid();
      parts.forEach(id=>checkId(id));
    }
    return value;
  }

  function checkedRecipe(value,seen) {
    checkEntity(value,seen);
    checkTextFields(value,['description','sourceUrl']);
    if (value.prep!==undefined || value.kind==='prep-sv') {
      checkTextFields(record(value.prep),['name','size','duration','notes']);
    }
    const sections = list(value.sections,true).map(section=>{
      record(section);
      checkTextFields(section,['name','description','instructions']);
      if (list(section.photos,true).some(photo=>typeof photo!=='string')) invalid();
      return {...section,ingredients:list(section.ingredients,true).map(checkedIngredient)};
    });
    list(value.notes,true).forEach(note=>checkTextFields(record(note),['date','text','photo']));
    return {...value,sections};
  }

  function checkedTable(value,seen) {
    checkEntity(value,seen);
    const columnIds = new Set();
    const columns = list(value.columns);
    if (!columns.length) invalid();
    for (const column of columns) {
      record(column);
      checkId(column.id,columnIds);
      if (typeof column.label!=='string' || !column.label.trim()) invalid();
    }
    const rowIds = new Set();
    const rows = list(value.rows).map(row=>{
      record(row);
      checkId(row.id,rowIds);
      if (row.recipeLink!==undefined) checkId(row.recipeLink);
      const cells = Object.fromEntries(Object.entries(record(row.cells)).map(([key,cell])=>{
        if (!columnIds.has(key) || !['string','number'].includes(typeof cell)) invalid();
        return [key,String(cell)];
      }));
      const components = list(row.components,true).map(checkedIngredient);
      return {...row,cells,components};
    });
    return {...value,rows};
  }

  function normalize(data) {
    record(data);
    if ((data.format!==undefined && data.format!=='domowa-kuchnia') ||
        (data.version!==undefined && data.version!==1)) invalid();
    const bookIds = new Set();
    const recipeIds = new Set();
    const prepIds = new Set();
    const tableIds = new Set();
    const prepEntries = list(data.prepEntries,true).map(value=>{
      const recipe = checkedRecipe(value,prepIds);
      record(recipe.prep);
      return {...recipe,kind:'prep-sv'};
    });
    const books = list(data.books).map(book=>{
      checkEntity(book,bookIds);
      const categoryIds = new Set();
      const categories = list(book.categories).map(category=>{
        checkEntity(category,categoryIds);
        const recipes = [];
        for (const item of list(category.recipes)) {
          const recipe = checkedRecipe(item,item?.kind==='prep-sv'?null:recipeIds);
          if (recipe.kind!=='prep-sv') recipes.push(recipe);
          else if (!prepIds.has(recipe.id)) {
            prepEntries.push(recipe);
            prepIds.add(recipe.id);
          }
        }
        return {...category,recipes};
      });
      return {...book,categories};
    });
    const prepTile = data.prepTile===undefined ? {} : record(data.prepTile);
    checkTextFields(prepTile,['name','photo']);
    return {books,prepEntries,prepTile,tables:list(data.tables,true).map(table=>checkedTable(table,tableIds))};
  }

  function recipeEntries(cookbook) {
    return cookbook.books.flatMap(book=>book.categories.flatMap(category=>
      category.recipes.map(recipe=>({book,category,recipe}))));
  }

  function withDependencies(selected,source,current) {
    const entries = new Map(selected.map(entry=>[entry.recipe.id,entry]));
    const currentRecipes = new Set(recipeEntries(current).map(({recipe})=>recipe.id));
    const sourceRecipes = new Map(recipeEntries(source).map(entry=>[entry.recipe.id,entry]));
    const tables = new Map(source.tables.map(table=>[table.id,table]));
    const requiredRows = new Map();
    function appendRecipe(recipeId) {
      const entry = sourceRecipes.get(recipeId);
      if (entry && !currentRecipes.has(recipeId) && !entries.has(recipeId)) entries.set(recipeId,entry);
    }
    // The map grows while we visit recipes, which also follows links through multiple stages.
    for (const {recipe} of entries.values()) {
      for (const ingredient of recipe.sections.flatMap(section=>section.ingredients)) {
        appendRecipe(ingredient.recipeLink);
        if (!ingredient.tableLink || requiredRows.has(ingredient.tableLink)) continue;
        const [tableId,rowId] = ingredient.tableLink.split(':');
        const table = tables.get(tableId);
        const row = table?.rows.find(item=>item.id===rowId);
        if (!row) continue;
        const existingRow = current.tables.find(item=>item.id===tableId)?.rows.find(item=>item.id===rowId);
        if (!existingRow) requiredRows.set(ingredient.tableLink,{table,row});
        appendRecipe(existingRow ? existingRow.recipeLink : row.recipeLink);
      }
    }
    return {entries:[...entries.values()],rows:[...requiredRows.values()]};
  }

  function importRecipes(current,source,selected,includeDependencies,makeId) {
    const planned = includeDependencies ? withDependencies(selected,source,current) : {entries:selected,rows:[]};
    const books = structuredClone(current.books);
    const tables = structuredClone(current.tables);
    const occupiedIds = new Set(recipeEntries(current).map(({recipe})=>recipe.id));
    const reservedIds = new Set([...occupiedIds,...planned.entries.map(({recipe})=>recipe.id)]);
    const importedIds = new Map(planned.entries.map(({recipe})=>{
      // Keeping the original identity allows links to resolve even if the referenced recipe arrives later.
      if (!occupiedIds.has(recipe.id)) return [recipe.id,recipe.id];
      let newId = makeId();
      while (reservedIds.has(newId)) newId = makeId();
      reservedIds.add(newId);
      return [recipe.id,newId];
    }));

    for (const {book:sourceBook,category:sourceCategory,recipe,destination} of planned.entries) {
      let book = destination ? books.find(item=>item.id===destination.book.id)
        : books.find(item=>item.name===sourceBook.name);
      if (!book) {
        book = {...sourceBook,id:makeId(),categories:[]};
        books.push(book);
      }
      let category = destination?.category ? book.categories.find(item=>item.id===destination.category.id)
        : book.categories.find(item=>item.name===sourceCategory.name);
      if (!category) {
        category = {...sourceCategory,id:makeId(),recipes:[]};
        book.categories.push(category);
      }
      const copy = structuredClone(recipe);
      copy.id = importedIds.get(recipe.id);
      for (const ingredient of copy.sections.flatMap(section=>section.ingredients)) {
        if (importedIds.has(ingredient.recipeLink)) ingredient.recipeLink = importedIds.get(ingredient.recipeLink);
      }
      delete copy.notes;
      delete copy.hideFromPrepIndex;
      category.recipes.push(copy);
    }

    for (const {table:sourceTable,row:sourceRow} of planned.rows) {
      let table = tables.find(item=>item.id===sourceTable.id);
      if (!table) {
        table = structuredClone({...sourceTable,rows:[]});
        tables.push(table);
      }
      const row = structuredClone(sourceRow);
      const sourceColumns = sourceTable.columns.filter(column=>Object.hasOwn(row.cells,column.id));
      const tableColumns = new Set(table.columns.map(column=>column.id));
      table.columns.push(...sourceColumns.filter(column=>!tableColumns.has(column.id)));
      if (importedIds.has(row.recipeLink)) row.recipeLink = importedIds.get(row.recipeLink);
      table.rows.push(row);
    }
    return {cookbook:{...current,books,tables},recipeCount:planned.entries.length,rowCount:planned.rows.length};
  }

  function restoreSnapshot(mode,snapshot) {
    return new Promise((resolve,reject)=>{
      const request = indexedDB.open('moja-kuchnia-recovery',1);
      request.onupgradeneeded = ()=>request.result.createObjectStore('snapshots');
      request.onerror = ()=>reject(request.error);
      request.onblocked = ()=>reject(new Error('Magazyn kopii jest niedostępny.'));
      request.onsuccess = ()=>{
        const db = request.result;
        const transaction = db.transaction('snapshots',mode==='read'?'readonly':'readwrite');
        const store = transaction.objectStore('snapshots');
        const result = mode==='read' ? store.get('before-restore')
          : snapshot ? store.put(snapshot,'before-restore') : store.delete('before-restore');
        transaction.oncomplete = ()=>{
          db.close();
          resolve(result.result);
        };
        transaction.onabort = ()=>{
          db.close();
          reject(transaction.error);
        };
      };
    });
  }

  window.cookbookStorage = {normalize,recipeEntries,importRecipes,restoreSnapshot};
})();
