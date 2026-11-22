# Synchronizacja z Arkuszem Google

Konfiguracja korzysta z Apps Script i prywatnego wdrożenia dla właściciela. Nie wymaga Google Cloud Console ani klienta OAuth.

## Zaktualizuj skrypt i arkusz

1. W swoim arkuszu wybierz **Rozszerzenia → Apps Script**. Zastąp cały kod w pliku `Kod.gs` zawartością [Google-Arkusz.gs](Google-Arkusz.gs) i zapisz.
2. Wróć do arkusza i odśwież stronę. Kliknij **Moja kuchnia → Przygotuj wspólną tabelę**. Zatwierdź dostęp, jeśli Google o niego poprosi. Przepisy ze starych kart zostaną skopiowane z obecnymi identyfikatorami. Kolejne uruchomienie pomija identyfikatory istniejące w bazie.
3. W zakładce **Nowy przepis** wpisz nazwę, książkę, dział i porcje. Wpisz nazwę etapu w kolumnie A, a instrukcję w D tego samego wiersza. Kolejne wiersze zawierają po jednym składniku w B i C. Wybierz **Moja kuchnia → Dodaj przepis z szablonu**. W **Spisie przepisów** używaj filtrów, aby znaleźć przepis po nazwie, książce, dziale lub składniku. Zaznacz wiersz i wybierz **Moja kuchnia → Pokaż wybrany przepis**. Zakładka **Karta przepisu** wyświetla wybrany wpis. Pola takie jak nazwa, dział i porcje można edytować w zakładce **Baza przepisów**. Po zmianie wybierz **Odśwież spis**.

## Wdróż i połącz

1. W edytorze Apps Script wybierz **Wdróż → Nowe wdrożenie → Aplikacja internetowa**. Ustaw **Wykonuj jako: Ja** i **Kto ma dostęp: Tylko ja**. Wdróż i skopiuj adres kończący się na `/exec`. W razie kolejnej zmiany kodu zaktualizuj to samo wdrożenie przez **Zarządzaj wdrożeniami** i wybierz nową wersję.
2. Otwórz aktualną wersję „Mojej kuchni” przez HTTPS lub na serwerze lokalnym. Kliknij **↻**, wklej adres wdrożenia i wybierz **Otwórz synchronizację**. Jeśli Google poprosi o zalogowanie, wybierz konto właściciela. Po zapisaniu adresu kliknięcie **↻** od razu rozpoczyna wymianę w obu kierunkach. Jeśli wykryje konflikt, okno Google pozostanie otwarte z wyborem wersji.
3. Jeśli przeglądarka odseparuje okna, w aplikacji rozwiń **Ręczne przekazanie danych**. Skopiuj kod wymiany do okna Google i wybierz **Synchronizuj**. Skopiuj wynik z okna Google do aplikacji i kliknij **Odbierz wynik**.

Synchronizacja przesyła nowe i zmienione przepisy w obu kierunkach. Skrypt zatrzymuje zapis, jeśli wykryje sprzeczne zmiany, i pozwala wskazać, którą stronę zachować dla zgłoszonych konfliktów. Usunięcia stosuje się osobno. Lokalne dane aplikacji nadal są dostępne offline.
