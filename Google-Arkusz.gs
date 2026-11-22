const ZNACZNIK_PRZEPISU = 'MOJA-KUCHNIA:1';
const SPIS_PRZEPISOW = 'Spis przepisów';
const NOWY_PRZEPIS = 'Nowy przepis';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Moja kuchnia')
    .addItem('Przygotuj wspólną tabelę', 'przejdzNaWspolnaTabele')
    .addItem('Dodaj przepis z szablonu', 'dodajDoTabeli')
    .addItem('Pokaż wybrany przepis', 'pokazWybranyPrzepis')
    .addItem('Odśwież spis', 'odswiezSpis')
    .addToUi();
}

function przygotujArkusz_() {
  const plik = SpreadsheetApp.getActiveSpreadsheet();
  if (!plik.getSheetByName(SPIS_PRZEPISOW)) {
    const spis = plik.insertSheet(SPIS_PRZEPISOW, 0);
    spis.getRange('A1:D1').setValues([['Nazwa przepisu', 'Książka', 'Dział', 'Porcje']])
      .setFontWeight('bold').setBackground('#e7eee4');
    spis.setFrozenRows(1);
    spis.setColumnWidths(1, 3, 200);
  }
  if (!plik.getSheetByName(NOWY_PRZEPIS)) {
    const szablon = plik.insertSheet(NOWY_PRZEPIS, 1);
    szablon.getRange('A2:A6').setValues([['Nazwa przepisu'], ['Książka'], ['Dział'], ['Porcje'], ['Opis']]);
    szablon.getRange('B5').setValue(4);
    szablon.getRange('A8:D8').setValues([['Część / etap', 'Ilość', 'Składnik', 'Przygotowanie']])
      .setFontWeight('bold').setBackground('#e7eee4');
    szablon.getRange('A9').setValue('Przygotowanie');
    szablon.getRange('A8').setNote('Wpisz nazwę etapu i jego instrukcję w jednym wierszu. Składniki wpisuj po jednym w kolejnych wierszach, w kolumnach B i C.');
    szablon.getRange('B9:C').setNumberFormat('@');
    szablon.getRange('B2:B4').setNumberFormat('@');
    szablon.getRange('A:D').setWrap(true).setVerticalAlignment('top');
    [220, 140, 260, 540].forEach((width, i) => szablon.setColumnWidth(i + 1, width));
    szablon.hideRows(1);
  }
  odswiezSpis();
}

function odswiezSpis() {
  SpreadsheetApp.getUi();
  const plik = SpreadsheetApp.getActiveSpreadsheet();
  if (plik.getSheetByName(BAZA_PRZEPISOW)) odswiezSpisTabeli_(plik);
}

const BAZA_PRZEPISOW = 'Baza przepisów';
const KARTA_PRZEPISU = 'Karta przepisu';
const NAGLOWKI = ['ID', 'Nazwa', 'Książka', 'Dział', 'Porcje', 'Opis', 'Etapy (dane)', 'Składniki'];

function przejdzNaWspolnaTabele() {
  SpreadsheetApp.getUi();
  const plik = SpreadsheetApp.getActiveSpreadsheet();
  przygotujArkusz_();
  const baza = plik.getSheetByName(BAZA_PRZEPISOW) || plik.insertSheet(BAZA_PRZEPISOW);
  baza.getRange(1,1,1,NAGLOWKI.length).setValues([NAGLOWKI]).setFontWeight('bold');
  baza.setFrozenRows(1);
  baza.hideColumns(1);
  baza.hideColumns(7);
  baza.setColumnWidths(2, 7, 170);
  const obecne = new Set(pobierzPrzepisy_(plik).map(r => r.id));
  const stare = plik.getSheets().flatMap(karta => {
    if (karta.getRange('A1').getValue() !== ZNACZNIK_PRZEPISU) return [];
    const dane = karta.getRange(1,1,karta.getLastRow(),4).getDisplayValues();
    const id = dane[0][1];
    if (obecne.has(id)) return [];
    obecne.add(id);
    return [odczytajKarte_(dane,id)];
  });
  zapiszDoBazy_(plik, stare);
  if (!plik.getSheetByName(KARTA_PRZEPISU)) plik.insertSheet(KARTA_PRZEPISU);
  odswiezSpisTabeli_(plik);
  plik.setActiveSheet(plik.getSheetByName(SPIS_PRZEPISOW));
}

function odczytajKarte_(dane,id) {
  const sections = [];
  for (const [name, amount, ingredient, instructions] of dane.slice(8)) {
    if (name || instructions) sections.push({name,instructions,ingredients:[]});
    if (amount || ingredient) {
      if (!sections.length) sections.push({name:'Składniki',instructions:'',ingredients:[]});
      sections[sections.length-1].ingredients.push({amount,name:ingredient});
    }
  }
  const [name,book,category,servings,description] = dane.slice(1,6).map(r => r[1]);
  return {id,book,category,name,servings:Number(servings)||4,description,sections};
}

function pobierzPrzepisy_(plik) {
  const baza = plik.getSheetByName(BAZA_PRZEPISOW);
  if (!baza || baza.getLastRow()<2) return [];
  return baza.getRange(2,1,baza.getLastRow()-1,7).getValues().filter(r => r[0])
    .map(([id,name,book,category,servings,description,etapy]) =>
      ({id,book,category,name,servings:Number(servings),description,sections:JSON.parse(etapy)}));
}

function zapiszDoBazy_(plik, przepisy) {
  if (!przepisy.length) return;
  const baza = plik.getSheetByName(BAZA_PRZEPISOW);
  const ostatni = baza.getLastRow();
  const indeks = new Map(ostatni < 2 ? [] : baza.getRange(2,1,ostatni-1,1).getValues().map(([id],i) => [id,i+2]));
  const tekst = value => /^['=]/.test(value) ? "'" + value : value;
  function wiersz(r) {
    return [r.id,r.name,r.book,r.category,String(r.servings),r.description,JSON.stringify(r.sections),
      r.sections.flatMap(s => s.ingredients.map(i => i.name)).join(', ')].map(tekst);
  }
  const nowe = [];
  for (const r of przepisy) {
    const numer = indeks.get(r.id);
    if (numer) baza.getRange(numer,1,1,8).setNumberFormat('@').setValues([wiersz(r)]);
    else nowe.push(wiersz(r));
  }
  if (nowe.length) {
    const zaMalo = ostatni+nowe.length-baza.getMaxRows();
    if (zaMalo > 0) baza.insertRowsAfter(baza.getMaxRows(),zaMalo);
    baza.getRange(ostatni+1,1,nowe.length,8).setNumberFormat('@').setValues(nowe);
  }
}

function odswiezSpisTabeli_(plik) {
  const spis = plik.getSheetByName(SPIS_PRZEPISOW);
  const przepisy = pobierzPrzepisy_(plik).sort((a,b) => a.name.localeCompare(b.name,'pl'));
  if (spis.getFilter()) spis.getFilter().remove();
  spis.getDataRange().clearContent();
  const rows = [['Nazwa przepisu','Książka','Dział','Porcje','Składniki','ID'],
    ...przepisy.map(r => [r.name,r.book,r.category,String(r.servings),
      r.sections.flatMap(s => s.ingredients.map(i => i.name)).join(', '),r.id])];
  const brak = rows.length-spis.getMaxRows();
  if (brak > 0) spis.insertRowsAfter(spis.getMaxRows(),brak);
  spis.getRange(1,1,rows.length,6).setRichTextValues(rows.map(row =>
    row.map(tekst => SpreadsheetApp.newRichTextValue().setText(tekst).build())));
  spis.getRange(1,1,1,6).setFontWeight('bold');
  spis.hideColumns(6);
  if (rows.length>1) spis.getRange(1,1,rows.length,6).createFilter();
}

function pokazWybranyPrzepis() {
  SpreadsheetApp.getUi();
  const plik = SpreadsheetApp.getActiveSpreadsheet();
  const active = plik.getActiveSheet();
  if (active.getName() !== SPIS_PRZEPISOW || active.getActiveCell().getRow()<2)
    return SpreadsheetApp.getUi().alert('Zaznacz wiersz przepisu w spisie.');
  const id = active.getRange(active.getActiveCell().getRow(),6).getDisplayValue();
  const r = pobierzPrzepisy_(plik).find(p => p.id===id);
  if (!r) return;
  const karta = plik.getSheetByName(KARTA_PRZEPISU);
  karta.getDataRange().clearContent();
  karta.getRange('A2:B6').setRichTextValues([
    ['Nazwa przepisu',r.name],['Książka',r.book],['Dział',r.category],['Porcje',String(r.servings)],['Opis',r.description]
  ].map(row=>row.map(value=>SpreadsheetApp.newRichTextValue().setText(value).build())));
  const rows = [['Część / etap','Ilość','Składnik','Przygotowanie'],
    ...r.sections.flatMap(s=>[[s.name,'','',s.instructions],...s.ingredients.map(i=>['',i.amount,i.name,''])])];
  if (rows.length+7>karta.getMaxRows()) karta.insertRowsAfter(karta.getMaxRows(),rows.length+7-karta.getMaxRows());
  karta.getRange(8,1,rows.length,4).setRichTextValues(rows.map(row=>row.map(value=>SpreadsheetApp.newRichTextValue().setText(value).build())));
  karta.getRange('A:D').setWrap(true);
  [220,140,260,540].forEach((width,i)=>karta.setColumnWidth(i+1,width));
  plik.setActiveSheet(karta);
}

function dodajDoTabeli() {
  SpreadsheetApp.getUi();
  const plik = SpreadsheetApp.getActiveSpreadsheet();
  const szablon = plik.getSheetByName(NOWY_PRZEPIS);
  const dane = szablon.getRange(1,1,szablon.getLastRow(),4).getDisplayValues();
  const r = odczytajKarte_(dane,Utilities.getUuid());
  if (![r.name,r.book,r.category].every(v=>v.trim()) || !Number.isInteger(r.servings) || r.servings<1 || r.servings>100)
    return SpreadsheetApp.getUi().alert('Wpisz nazwę, książkę, dział i liczbę porcji od 1 do 100.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    zapiszDoBazy_(plik,[r]);
    szablon.getRange('B2:B6').clearContent();
    szablon.getRange('B5').setValue(4);
    szablon.getRange('A9:D').clearContent();
    szablon.getRange('A9').setValue('Przygotowanie');
    odswiezSpisTabeli_(plik);
    plik.setActiveSheet(plik.getSheetByName(SPIS_PRZEPISOW));
  } finally { lock.releaseLock(); }
}
