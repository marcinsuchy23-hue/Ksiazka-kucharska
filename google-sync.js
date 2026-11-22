const GoogleRecipes = (() => {
  function flatten(state) {
    return state.books.flatMap(book => book.categories.flatMap(category =>
      category.recipes.map(recipe => normalize({ ...recipe, book: book.name, category: category.name }))));
  }

  function normalize(recipe) {
    return {
      id: recipe.id, book: recipe.book, category: recipe.category, name: recipe.name,
      servings: Number(recipe.servings) || 4, description: recipe.description || '',
      sections: (recipe.sections || []).map(section => ({
        name: section.name || '', instructions: section.instructions || '',
        ingredients: (section.ingredients || []).map(item => ({amount: item.amount || '', name: item.name || ''}))
      }))
    };
  }

  function apply(state, recipes, makeId) {
    for (const recipe of recipes) {
      let previousBook, previousCategory, previousRecipe;
      for (const book of state.books) {
        for (const category of book.categories) {
          const existing = category.recipes.find(item => item.id === recipe.id);
          if (existing) {
            previousRecipe = existing;
            previousBook = book;
            previousCategory = category;
            category.recipes = category.recipes.filter(item => item.id !== recipe.id);
          }
        }
      }
      const {book:bookName, category:categoryName, ...content} = recipe;
      let book = previousBook?.name === bookName ? previousBook : state.books.find(item => item.name === bookName);
      if (!book) state.books.push(book = {id:makeId(), name:bookName, categories:[]});
      let category = previousBook === book && previousCategory?.name === categoryName
        ? previousCategory : book.categories.find(item => item.name === categoryName);
      if (!category) book.categories.push(category = {id:makeId(), name:categoryName, recipes:[]});
      category.recipes.push({...previousRecipe, ...content});
    }
  }

  return {apply, flatten};
})();
