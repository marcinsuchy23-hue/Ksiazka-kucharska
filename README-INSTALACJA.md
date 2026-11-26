# Moja kuchnia — wersja do instalacji na telefonie

To jest instalowalna aplikacja webowa przygotowana dla Androida i iPhone'a. Po opublikowaniu pod adresem HTTPS można dodać ją do ekranu głównego i korzystać z niej offline po pierwszym otwarciu. Aplikacja zapisuje przepisy lokalnie w przeglądarce telefonu. Import z niektórych stron wymaga osobnej usługi opisanej w [instrukcji importu](README-IMPORT-LINK.md).

## Instalacja

- **Android:** otwórz adres aplikacji w Chrome i wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.
- **iPhone:** otwórz adres w Safari, wybierz „Udostępnij” → „Dodaj do ekranu głównego”, włącz „Otwórz jako aplikację internetową” i wybierz „Dodaj”.

## Publikacja

Pliki z tego folderu można opublikować jako statyczną stronę pod adresem HTTPS. Bezpłatną opcją jest GitHub Pages w publicznym repozytorium GitHub Free. Oznacza to, że pliki aplikacji będą publicznie dostępne; zapisane przepisy i zdjęcia nie są częścią tych plików, pozostają w pamięci przeglądarki telefonu.

[Otwórz opublikowaną Moją kuchnię](https://marcinsuchy23-hue.github.io/Ksiazka-kucharska/).

## Dane i offline

Pierwsze otwarcie zapisuje podstawowe pliki aplikacji do pracy offline. Moduł i polski model OCR pobierają się przy pierwszym skanowaniu zdjęcia i są zachowywane do kolejnych skanów. Każde urządzenie przechowuje własną kopię przepisów. Dane można przenieść przez eksport i import kopii zapasowej.
