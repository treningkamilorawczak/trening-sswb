# Longevity Score Quiz — Design Doc

**Data:** 2026-06-10
**Strona:** landing SSWB (repo `treningkamilorawczak/trening-sswb`)
**Status:** spec do review użytkownika
**Makieta zatwierdzona:** `longevity-score-mockup.html` (sekcja "Ocena Gotowości")
**Źródło prawdy dla twierdzeń:** `LONGEVITY_SCORE_DOWODY_NAUKOWE.md` — żadne
twierdzenie zdrowotne spoza tego pliku nie wchodzi do quizu ani maili.

---

## 1. Cel i kontekst

Lead magnet kwalifikujący dla landing SSWB. Ruch: wąska, wyselekcjonowana grupa
klientów na WhatsApp (ciepły ruch, niski wolumen, wysokie wymaganie wiarygodności).

**Cel biznesowy:** 2-4 dobre konsultacje miesięcznie (roster 5-8 klientów premium).
Quiz pełni trzy funkcje:
1. Niski próg wejścia dla osób niegotowych od razu rezerwować konsultację
2. Kwalifikacja — lead przychodzi z wiekiem, BMI, aktywnością, celem, dolegliwościami
3. 5 dni budowania zaufania przed decyzją o pakiecie (550 PLN/mc)

**Świadomie NIE robimy:** sztucznego countdownu 48h (gryzie się z pozycjonowaniem
premium przy ciepłym ruchu) — pilność naturalna: limit miejsc w rosterze.

**Metryki sukcesu (mierzone od dnia 1):**
- wejścia na sekcję quizu → % ukończeń quizu → % zostawionych maili → % rezerwacji
  konsultacji z sekwencji
- przegląd po 30 dniach od startu

## 2. UX flow (zatwierdzone w makiecie)

Sekcja `#gotowosc` na stronie głównej, po sekcji problemowej ("pierwszy filtr"),
przed sekcją "Metoda". Dodatkowy link "▸ Test gotowości" w nav (kolor ember).

```
Intro ("Sprawdź, na czym stoisz")
 → P1: wiek + płeć
 → P2: wzrost + waga
 → P3: częstotliwość treningów (4 opcje)
 → P4: tętno spoczynkowe (opcjonalne, można pominąć)
 → P5: główny cel (selekcja / longevity / forma 40+ / energia w biznesie)
 → P6: główna dolegliwość (nic / zmęczenie-sen / bóle / stres)
 → bramka e-mail (imię + e-mail, checkbox zgody)
 → wynik na ekranie (stempel + ring + 3 metryki + zapowiedź sekwencji + CTA Calendly)
```

Werdykty (stemple): ZDOLNY (≥80, zielony) / ZDOLNY WARUNKOWO (60-79, ember) /
WYMAGA PRZYGOTOWANIA (40-59, czerwony) / ODBUDOWA BAZY (<40, czerwony).

**Korekta copy względem makiety:** makieta obiecuje "raport PDF" — w MVP raport
przychodzi jako e-mail HTML (PDF dopiero w fazie 2). Copy na stronie mówi
"pełny raport na maila", bez słowa PDF. Nie obiecujemy formatu, którego nie wysyłamy.

## 3. Scoring (z makiety, do przeniesienia 1:1)

- **VO2max:** estymacja modelem Jurca 2005 (płeć, wiek, BMI, RHR, aktywność);
  RHR pominięte → wartość domyślna `62 − 3×poziom_aktywności`
- **BMI:** waga / wzrost²; punkty: 100 w przedziale 18.5-24.9, poza nim
  `100 − |BMI−22|×9` (min 0)
- **Indeks regeneracji:** `100 − max(0, RHR−50)×1.8`, −15 przy zmęczeniu/śnie,
  −10 przy stresie; clamp 20-100
- **Longevity Score:** `0.5×pkt_VO2max + 0.25×pkt_BMI + 0.25×regeneracja`,
  gdzie pkt_VO2max = `min(100, (VO2/norma_wiekowa)×75)`
- Disclaimer przy wyniku zawsze: estymacja, nie pomiar; prawdziwy pomiar
  w Pakiecie Zdrowia

## 4. Architektura

Strona jest statycznym HTML (bez backendu). E-maile: MailerLite
(konto 1943078, uwierzytelnione, ten sam e-mail co właściciel repo).

```
[index.html — sekcja quizu, vanilla JS]
        │  POST (JSON: imię, email, score, vo2, bmi, rec, werdykt, cel,
        │        dolegliwość, wiek, płeć, zgoda)
        ▼
[mały endpoint serverless — proxy z kluczem API MailerLite]
        │  MailerLite API: upsert subscriber + custom fields + grupa
        ▼
[MailerLite]
  ├─ Grupa: "Longevity Score — SSWB"
  ├─ Custom fields: ls_score, ls_verdict, ls_vo2, ls_bmi, ls_rec,
  │                 ls_goal, ls_issue, ls_age, ls_sex
  └─ Automatyzacja (trigger: dołączenie do grupy):
       Dzień 1 (natychmiast) → Dzień 2 → 3 → 4 → 5 (odstęp 24h)
```

**Dlaczego proxy, a nie klucz w JS:** klucz API MailerLite w statycznym JS byłby
publiczny — każdy mógłby czytać/zapisywać listę subskrybentów. Endpoint proxy
(jedna funkcja, ~40 linii) trzyma klucz w zmiennej środowiskowej.
Wybór platformy proxy (Cloudflare Worker / Vercel) — decyzja w planie implementacji,
zależna od wyboru hostingu strony (otwarty punkt w STATUS.md).

**Dane:** MailerLite jest jedyną bazą leadów (bez Supabase w MVP).
Wynik na ekranie liczy się lokalnie w JS — quiz działa nawet zanim użytkownik
poda e-mail; bez e-maila nic nie jest nigdzie wysyłane.

## 5. Sekwencja e-mail (5 dni)

Personalizacja przez custom fields (imię, wynik, werdykt, cel). Treści powstaną
jako osobne zadanie po wdrożeniu quizu — każda przejdzie kontrolę względem
`LONGEVITY_SCORE_DOWODY_NAUKOWE.md`.

| Dzień | Treść | Zależności |
|---|---|---|
| 1 | Pełny raport: wynik + porównanie z normą wiekową + cytowane badania (z linkami) | mapa dowodów (gotowa) |
| 2 | Case study Dariusza Kostkowskiego — przygotowanie do zwycięstwa edycji SSWB | ⚠️ prawdziwe liczby przed/po + zgoda (STATUS.md: 4 liczby — HRV %, 1RM kg, 5km min, marsz +kg) |
| 3 | 3 ćwiczenia selekcyjne do domu | PDF "Wymagania sprawnościowe dla operatorów" (folder SSWB/) |
| 4 | Oferta: Pakiet Zdrowia + konsultacja gratis; pilność = limit miejsc w rosterze | bez countdownu |
| 5 | FAQ + historie uczestników | ⚠️ 5-10 prawdziwych pytań z grupy WhatsApp od Kamila |

**MVP raportu = e-mail HTML dzień 1** (nie PDF). Generowanie PDF to faza 2 —
nie blokuje startu, a HTML w skrzynce czyta się lepiej na telefonie (grupa WhatsApp = mobile).

## 6. Zgodność i zaufanie

- Checkbox zgody przy bramce e-mail + link do istniejącej `polityka-prywatnosci.html`
- Disclaimer medyczny przy wyniku (narzędzie edukacyjne, nie diagnoza)
- Każdy mail: stopka z wypisem jednym kliknięciem (MailerLite domyślnie)
- Zakazy z mapy dowodów: bez "pomiaru HRV", bez przewidywania długości życia,
  bez "+18% VO2max" dopóki nie ma udokumentowanego case

## 7. Fazy

**Faza 1 (MVP):**
1. Sekcja quizu w `index.html` (przeniesienie z makiety, bez adnotacji)
2. Endpoint proxy + konfiguracja MailerLite (grupa, pola, automatyzacja szkieletowa)
3. Treść maila dzień 1 (raport) + dzień 4 (oferta) — pozostałe dni mogą dojść
   w trakcie, automatyzacja wstrzymuje wysyłkę brakujących
4. Zdarzenia analytics (start quizu, ukończenie, e-mail, klik Calendly)

**Faza 2:**
- Treści dni 2/3/5 (po otrzymaniu danych Dariusza i pytań z WhatsApp)
- PDF raportu (opcjonalnie)
- Skórka quizu dla tier1-hyrox.pl (wspólny silnik scoringu)

## 8. Otwarte punkty (nie blokują implementacji quizu)

- [ ] Domena/hosting strony (istniejący punkt w STATUS.md) → determinuje platformę proxy
- [ ] Dane przed/po Dariusza (dzień 2)
- [ ] Pytania z grupy WhatsApp (dzień 5)
- [ ] Analytics na stronie — czy jest cokolwiek podpięte? (do sprawdzenia w implementacji)
