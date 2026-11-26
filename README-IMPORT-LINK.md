# Import przepisu z linku

GitHub Pages wyświetla aplikację. Osobny Cloudflare Worker pobiera stronę
z przepisem z AniaGotuje i przekazuje ją do formularza importu.

1. Zaloguj się na swoje konto Cloudflare z katalogu projektu poleceniem
   `npx wrangler login`.
2. Uruchom `npx wrangler deploy` i skopiuj wyświetlony adres HTTPS
   Workera w domenie `workers.dev`.
3. W Mojej kuchni otwórz dział i wybierz **Dodaj przepis z linku**.
   Rozwiń **Ustawienia importu z AniaGotuje** i wklej adres Workera
   w pole **Adres usługi importu**. W polu **Adres przepisu** wklej
   link do przepisu i wybierz **Pobierz przepis**. Adres Workera zostanie
   zapamiętany w tej przeglądarce.

Workera można też utworzyć w panelu **Workers & Pages** na Cloudflare.
W edytorze nowego Workera wklej całą zawartość
`recipe-import-worker.js`. W ustawieniach dodaj zmienną tekstową
`APP_ORIGIN` o wartości `https://marcinsuchy23-hue.github.io`,
wdrażając kod i konfigurację przed skopiowaniem adresu HTTPS.

Domyślna konfiguracja dopuszcza żądania z
`https://marcinsuchy23-hue.github.io`. Przy hostingu aplikacji pod innym
adresem zmień `APP_ORIGIN` w `wrangler.jsonc` na origin aplikacji, czyli
protokół i domenę bez ścieżki, i ponownie wdróż Workera.

Worker przyjmuje żądanie `GET /?url=<zakodowany adres przepisu>`.
Obsługuje wyłącznie adresy HTTPS przepisów z AniaGotuje i sprawdza także
każdy adres przekierowania. Dane przepisu użytkownik zatwierdza i zapisuje
w aplikacji.
