# Synchronizacja z Arkuszem Google

Konfiguracja korzysta z Apps Script i klucza synchronizacji. Arkusz pozostaje prywatny, a adres wdrożenia działa bez logowania. Nie wymaga Google Cloud Console ani klienta OAuth.

## Zaktualizuj skrypt i arkusz

1. W swoim arkuszu wybierz **Rozszerzenia → Apps Script**. Zastąp cały kod w pliku `Kod.gs` zawartością [Google-Arkusz.gs](Google-Arkusz.gs) i zapisz.
2. Wróć do arkusza i odśwież stronę. Kliknij **Moja kuchnia → Przygotuj wspólną tabelę**. Zatwierdź dostęp, jeśli Google o niego poprosi. Przepisy ze starych kart zostaną skopiowane z obecnymi identyfikatorami. Kolejne uruchomienie pomija identyfikatory istniejące w bazie.
3. W zakładce **Nowy przepis** wpisz nazwę, książkę, dział i porcje. Wpisz nazwę etapu w kolumnie A, a instrukcję w D tego samego wiersza. Kolejne wiersze zawierają po jednym składniku w B i C. Wybierz **Moja kuchnia → Dodaj przepis z szablonu**. W **Spisie przepisów** używaj filtrów, aby znaleźć przepis po nazwie, książce, dziale lub składniku. Zaznacz wiersz i wybierz **Moja kuchnia → Pokaż wybrany przepis**. Zakładka **Karta przepisu** wyświetla wybrany wpis. Pola takie jak nazwa, dział i porcje można edytować w zakładce **Baza przepisów**. Po zmianie wybierz **Odśwież spis**.

## Wdróż i połącz

1. Po zapisaniu nowego kodu odśwież arkusz. Wybierz **Moja kuchnia → Utwórz klucz synchronizacji** i skopiuj klucz. Przechowuj go prywatnie. Utworzenie nowego klucza unieważnia poprzedni.
2. W Apps Script wybierz **Wdróż → Zarządzaj wdrożeniami**, edytuj dotychczasowe wdrożenie i wybierz **Nowa wersja**. Ustaw **Wykonuj jako: Ja** i **Kto ma dostęp: Każdy** (także bez zalogowania). Wdróż. Adres `/exec` pozostaje ten sam. Dostęp do samego arkusza się nie zmienia, a operacje synchronizacji wymagają klucza.
3. Otwórz [Moją kuchnię na GitHub Pages](https://marcinsuchy23-hue.github.io/Ksiazka-kucharska/), naciśnij **↻** i wklej adres oraz klucz. Przy kolejnych kliknięciach aplikacja synchronizuje w tle i podaje liczby pobranych i wysłanych wpisów.

Synchronizacja przesyła nowe i zmienione przepisy w obu kierunkach. W razie konfliktu aplikacja wyświetla wybór wersji. Usunięcia stosuje się osobno. Lokalne dane aplikacji nadal są dostępne offline.
