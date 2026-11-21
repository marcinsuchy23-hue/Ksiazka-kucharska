# Moja kuchnia — wersja do instalacji na telefonie

To jest instalowalna aplikacja webowa przygotowana dla Androida i iPhone'a. Po opublikowaniu pod adresem HTTPS można dodać ją do ekranu głównego i korzystać z niej offline po pierwszym otwarciu. Aplikacja zapisuje przepisy lokalnie w przeglądarce telefonu — nie ma konta, synchronizacji ani opłat.

## Instalacja

- **Android:** otwórz adres aplikacji w Chrome i wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.
- **iPhone:** otwórz adres w Safari, wybierz „Udostępnij” → „Dodaj do ekranu głównego”, włącz „Otwórz jako aplikację internetową” i wybierz „Dodaj”.

## Publikacja

Pliki z tego folderu można opublikować jako statyczną stronę pod adresem HTTPS. Bezpłatną opcją jest GitHub Pages w publicznym repozytorium GitHub Free. Oznacza to, że pliki aplikacji będą publicznie dostępne; zapisane przepisy i zdjęcia nie są częścią tych plików, pozostają w pamięci przeglądarki telefonu.

Publikacja nie jest jeszcze wykonana. Przed nią należy wybrać nazwę publicznego adresu i zatwierdzić udostępnienie plików aplikacji.

## Dane i offline

Pierwsze otwarcie pobiera pliki aplikacji i polski model OCR (około 10 MB). Service worker zapisuje je na urządzeniu, aby aplikacja i rozpoznawanie zdjęć działały później bez internetu. Każde urządzenie przechowuje własną kopię przepisów. Do przeniesienia danych służy ręczny eksport i import kopii zapasowej.
