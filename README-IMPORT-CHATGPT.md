# Import receptury z ChatGPT

[Przykładowy przepis JSON](chatgpt-recipe.example.json) · [Schemat JSON](chatgpt-recipe.schema.json)

1. Dołącz schemat do rozmowy w ChatGPT i skopiuj polecenie poniżej.
2. W Mojej kuchni otwórz dział i wybierz **Import receptury z ChatGPT**. Użyj opcji **Wklej JSON** dla skopiowanego tekstu albo **Plik JSON** dla pliku na urządzeniu.
3. Sprawdź składniki, kroki i docelowy dział w szkicu. Zapisz przepis.

## Przepis ze zdjęcia

W oknie **Import receptury z ChatGPT** wybierz **Kopiuj wytyczne do zdjęcia**.
Wklej polecenie w ChatGPT i dołącz zdjęcie. Wygenerowany JSON wklej w aplikacji
albo wczytaj go jako plik, a potem sprawdź szkic przed zapisem.

## Polecenie do skopiowania

> Przygotuj poniższy przepis do importu w aplikacji Moja kuchnia. Zwróć jeden plik `przepis.json` zgodny z dołączonym schematem `chatgpt-recipe.schema.json`. Ustaw `version` na 1. Wpisz nazwę, kategorię, liczbę porcji, składniki i kroki przygotowania. Każdy składnik zapisz w osobnym obiekcie z polami `name`, `quantity` i `unit`. Ilości podaj jako liczby, a ułamki lub zakresy możesz zapisać jako tekst. Gdy brak ilości, wpisz `null`. Gdy brak jednostki, wpisz `""`. Zapisz osobne części receptury, np. sos, w `components`, a uwagi w `notes`. Zachowaj podane ilości, czasy i temperatury. Jeśli nie możesz utworzyć pliku, zwróć samą treść JSON.
>
> Treść przepisu: [wklej tutaj]

## Import z adresu

W opcji **Adres URL** podaj bezpośredni publiczny adres pliku JSON bez logowania. Jeśli jest to adres HTTP, do pobrania potrzebna jest usługa importu. Przy pobraniu bezpośrednio przez przeglądarkę serwer pod inną domeną musi zezwolić na odczyt z aplikacji w nagłówku CORS. Jeśli go blokuje, aplikacja może pobrać plik przez skonfigurowaną usługę importu. Do importu receptury z rozmowy w ChatGPT użyj tekstu JSON lub pobranego pliku.
