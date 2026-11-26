# Import przepisu z linku

**Moja kuchnia** może odczytać przepis ze strony internetowej, jeśli strona
zezwala przeglądarce na odczyt albo aplikacja ma skonfigurowaną własną usługę
importu. Usługa jest przydatna przy stronach takich jak AniaGotuje. Działa z
publicznymi stronami HTML. Aplikacja szuka danych przepisu lub wyraźnie
oznaczonych sekcji składników i przygotowania. Jakość importu zależy od źródła.

## Uruchomienie na Render

[Wdróż gotową konfigurację na Render](https://render.com/deploy?repo=https://github.com/marcinsuchy23-hue/Ksiazka-kucharska).

Po zalogowaniu zatwierdź wdrożenie. Konfiguracja wybiera darmowy plan,
Dockerfile i adres Mojej kuchni. Gdy usługa ma status **Live**, skopiuj
jej adres HTTPS i podaj go w Mojej kuchni w **Ustawieniach importu**.
Pierwszy import po przerwie może wymagać chwili na uruchomienie usługi.

## Uruchomienie na innym hostingu

1. Wdróż katalog `recipe-import-server` na hostingu, który uruchamia
   kontenery Docker i udostępnia im publiczny adres HTTPS. W panelu hostingu
   wskaż go jako katalog główny usługi oraz wybierz dołączony
   `Dockerfile`. Kontener nasłuchuje na porcie z ustawienia `PORT`
   hostingu lub na 8080. Do sprawdzenia działania serwera służy `/health`.
2. Przy standardowym linku GitHub Pages ustaw `APP_ORIGIN` na
   `https://marcinsuchy23-hue.github.io`. Przy własnej domenie podaj jej
   origin, czyli protokół i nazwę domeny bez ścieżki. Dla usługi prywatnej
   ustaw też `IMPORT_PATH` jako długą, losową ścieżkę poprzedzoną `/`.
3. W Mojej kuchni wejdź do działu i wybierz **Dodaj przepis z linku**.
   Rozwiń ustawienia importu i podaj adres HTTPS usługi. Jeśli ustawiłeś
   `IMPORT_PATH`, dopisz tę ścieżkę do adresu. Wklej link do przepisu,
   sprawdź szkic i zapisz go w aplikacji.

Do uruchomienia poza kontenerem wystarczy Node.js 22 lub nowszy i polecenie
`node recipe-import-server/server.mjs`. Serwer przyjmuje
`GET /?url=<zakodowany adres>` lub ten sam parametr pod ścieżką
`IMPORT_PATH`. Dostawca hostingu może naliczać własne opłaty.

Serwer rozwiązuje adres DNS i sprawdza publiczny adres IP przed każdym
połączeniem, także po przekierowaniu. Ustawione są limity czasu, rozmiaru
strony i liczby żądań. Konto lub logowanie na stronie źródłowej nie jest
obsługiwane. Link do przepisu trafia do skonfigurowanej usługi, a przepis
zapisujesz w Mojej kuchni po sprawdzeniu szkicu.
