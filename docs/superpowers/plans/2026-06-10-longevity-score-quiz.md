# Longevity Score Quiz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quiz "Longevity Score" na stronie SSWB, zapisujący leady z wynikami do MailerLite (grupa `189925136723347234`) i uruchamiający 5-dniową sekwencję e-mail.

**Architecture:** Statyczny HTML + vanilla JS (jak reszta strony). Scoring w osobnym module ESM (testowalny w node). Lead idzie przez serverless proxy (`api/subscribe.js`, format Vercel) do MailerLite API. Sekwencję wysyła automatyzacja MailerLite (trigger: dołączenie do grupy).

**Tech Stack:** HTML/CSS/vanilla JS (ESM), Vercel Functions (node 18+), MailerLite API + MCP, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-10-longevity-score-quiz-design.md`
**Wzór wizualny:** `longevity-score-mockup.html` (zatwierdzony, commit 539f190)
**Twierdzenia zdrowotne wyłącznie z:** `LONGEVITY_SCORE_DOWODY_NAUKOWE.md`

**Już istnieje w MailerLite (NIE tworzyć ponownie):**
- grupa "Longevity Score — SSWB", id `189925136723347234`
- pola: `ls_score` (number), `ls_verdict`, `ls_vo2`, `ls_bmi` (text), `ls_rec` (number), `ls_goal`, `ls_issue` (text), `ls_age` (number), `ls_sex` (text)
- testowy subskrybent: trening.kamilorawczak@gmail.com (imię "Kamil (TEST)" — przywrócić w Task 9)

---

## File Structure

```
SSWB_LANDING/
├── index.html                  # MODYFIKACJA: nav link + sekcja #gotowosc + <script type="module">
├── js/
│   └── longevity-score.js      # NOWY: czysty scoring (ESM, bez DOM)
├── api/
│   └── subscribe.js            # NOWY: proxy → MailerLite (klucz w env)
├── tests/
│   └── longevity-score.test.mjs # NOWY: testy scoringu
├── package.json                # NOWY: type=module + script test
└── STATUS.md                   # MODYFIKACJA: status projektu
```

---

### Task 1: Moduł scoringu (TDD)

**Files:**
- Create: `package.json`
- Create: `tests/longevity-score.test.mjs`
- Create: `js/longevity-score.js`

- [ ] **Step 1: Utwórz `package.json`**

```json
{
  "name": "sswb-landing",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Napisz failing test**

`tests/longevity-score.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../js/longevity-score.js';

const base = { age: 42, sex: 'm', heightCm: 182, weightKg: 88, rhr: 62, activity: 2, issue: 'none' };

test('zwraca wszystkie pola wyniku', () => {
  const r = computeResult(base);
  for (const k of ['score', 'vo2', 'norm', 'bmi', 'rec', 'verdict']) {
    assert.ok(k in r, `brak pola ${k}`);
  }
});

test('BMI liczone poprawnie', () => {
  const r = computeResult(base);
  assert.equal(r.bmi, +(88 / 1.82 ** 2).toFixed(1)); // 26.6
});

test('brak RHR -> domyślne 62 - 3*aktywność', () => {
  const withRhr = computeResult({ ...base, rhr: 62 - 3 * 2 });
  const without = computeResult({ ...base, rhr: null });
  assert.equal(without.score, withRhr.score);
});

test('score w zakresie 0-100 dla skrajności', () => {
  const low = computeResult({ age: 70, sex: 'f', heightCm: 160, weightKg: 110, rhr: 95, activity: 0, issue: 'fatigue' });
  const high = computeResult({ age: 25, sex: 'm', heightCm: 183, weightKg: 76, rhr: 45, activity: 3, issue: 'none' });
  assert.ok(low.score >= 0 && low.score <= 100);
  assert.ok(high.score >= 0 && high.score <= 100);
  assert.ok(high.score > low.score);
});

test('progi werdyktów', () => {
  // werdykt zależy tylko od score — testujemy mapowanie pośrednio przez znane profile
  const high = computeResult({ age: 25, sex: 'm', heightCm: 183, weightKg: 76, rhr: 45, activity: 3, issue: 'none' });
  assert.equal(high.verdict, 'ZDOLNY');
  const low = computeResult({ age: 70, sex: 'f', heightCm: 160, weightKg: 115, rhr: 95, activity: 0, issue: 'fatigue' });
  assert.ok(['WYMAGA PRZYGOTOWANIA', 'ODBUDOWA BAZY'].includes(low.verdict));
});

test('dolegliwości obniżają indeks regeneracji', () => {
  const none = computeResult(base);
  const stress = computeResult({ ...base, issue: 'stress' });
  const fatigue = computeResult({ ...base, issue: 'fatigue' });
  assert.ok(stress.rec < none.rec);
  assert.ok(fatigue.rec < stress.rec);
});
```

- [ ] **Step 3: Uruchom — ma failować**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/longevity-score.js'`

- [ ] **Step 4: Implementacja**

`js/longevity-score.js` (logika 1:1 z zatwierdzonej makiety):

```js
// Scoring Longevity Score — estymacja VO2max wg modelu Jurca et al. 2005.
// Wynik jest estymacją ankietową, nie pomiarem (patrz LONGEVITY_SCORE_DOWODY_NAUKOWE.md).

export function computeResult({ age, sex, heightCm, weightKg, rhr, activity, issue }) {
  const bmi = weightKg / (heightCm / 100) ** 2;
  const restHr = rhr ?? 62 - activity * 3;

  const sexF = sex === 'm' ? 2.77 : 0;
  const actScore = [0, 1.5, 3.5, 5.5][activity];
  const vo2 = 18.07 + sexF - 0.10 * age - 0.17 * bmi - 0.03 * restHr + actScore * 2.2;
  const norm = (sex === 'm' ? 44 : 38) - (age - 30) * 0.35;

  let rec = 100 - Math.max(0, restHr - 50) * 1.8;
  if (issue === 'fatigue') rec -= 15;
  if (issue === 'stress') rec -= 10;
  rec = Math.round(Math.min(100, Math.max(20, rec)));

  const vo2Pts = Math.min(100, Math.max(0, (vo2 / norm) * 75));
  const bmiPts = bmi >= 18.5 && bmi <= 24.9 ? 100 : Math.max(0, 100 - Math.abs(bmi - 22) * 9);
  const score = Math.round(vo2Pts * 0.5 + bmiPts * 0.25 + rec * 0.25);

  const verdict =
    score >= 80 ? 'ZDOLNY' :
    score >= 60 ? 'ZDOLNY WARUNKOWO' :
    score >= 40 ? 'WYMAGA PRZYGOTOWANIA' : 'ODBUDOWA BAZY';

  return { score, vo2: +vo2.toFixed(1), norm: Math.round(norm), bmi: +bmi.toFixed(1), rec, verdict };
}
```

- [ ] **Step 5: Testy zielone**

Run: `npm test`
Expected: PASS (6 testów). Jeśli `score w zakresie...` failuje na `high.score > low.score` — sprawdź znaki w formule Jurca.

- [ ] **Step 6: Commit**

```bash
git add package.json js/longevity-score.js tests/longevity-score.test.mjs
git commit -m "Add longevity score computation module with tests"
```

---

### Task 2: Sekcja quizu w index.html (markup + style)

**Files:**
- Modify: `index.html` (nav links ~linia 2440-2455; nowa sekcja po `</section>` sekcji problemowej, przed `<section id="metoda">` ~linia 2520; style przed `</style>`)
- Źródło markupu: `longevity-score-mockup.html`

- [ ] **Step 1: Dodaj link w nav**

W `<ul class="nav-links">` przed linkiem "Rezerwacja":

```html
<li><a href="#gotowosc" style="color: var(--orange-ember);">▸ Test gotowości</a></li>
```

- [ ] **Step 2: Przenieś style quizu**

Z `longevity-score-mockup.html` skopiuj do `<style>` w `index.html` bloki CSS od komentarza `/* ════ NOWA SEKCJA: OCENA GOTOWOŚCI / LONGEVITY SCORE ════ */` do końca bloku `@media (max-width: 700px)` dotyczącego quizu (selektory: `.lscore-box`, `.lscore-corner-bl`, `.lscore-meta`, `.qscreen`, `.qprogress*`, `.q-title`, `.q-hint`, `.qopts`, `.qopt*`, `.qrow`, `.ff`, `.qnav`, `.qskip`, `.qlegal`, `.rstamp`, `.rscore`, `.ring*`, `.verdict`, `.rmetrics`, `.rmetric*`, `.good/.warn/.bad`, `.rdisclaimer`, `.rseq*`, `.rcta`, keyframe `fadeUp` jeśli nie istnieje).
**NIE kopiuj:** `.mockup-banner`, `.annot`, `.condensed*` (to adnotacje makiety). Sprawdź kolizje nazw klas z istniejącym CSS (`grep -c "\.ff " index.html` — jeśli `.ff` już istnieje na stronie, użyj istniejącego stylu zamiast duplikować).

- [ ] **Step 3: Wstaw sekcję quizu**

Po zamknięciu sekcji problemowej (ta z `problem-grid`), przed `<section id="metoda">`, wklej z makiety całą sekcję `<section class="dark" id="gotowosc">...</section>` z TRZEMA zmianami:

a) Copy bez "PDF" (spec, sekcja 2). W nagłówku sekcji i bramce e-mail:
- `Raport od razu na ekranie + PDF na maila.` → `Raport od razu na ekranie + pełny raport na maila.`
- `<div><span>◆ Raport PDF</span> — na maila</div>` → `<div><span>◆ Pełny raport</span> — na maila</div>`
- `Pełny raport PDF + plan 5 dni trafi na maila.` → `Pełny raport + plan 5 dni trafi na maila.`
- W `.rseq`: `Pełny raport PDF + Twój wynik...` → `Pełny raport + Twój wynik...`

b) Checkbox zgody w bramce e-mail — zamień akapit `.qlegal` na:

```html
<label class="qlegal" style="display: flex; gap: 10px; align-items: flex-start; cursor: pointer;">
  <input type="checkbox" id="consent" style="margin-top: 2px; accent-color: var(--orange-ember);">
  <span>Chcę otrzymać raport i serię 5 maili z planem. Akceptuję
  <a href="polityka-prywatnosci.html" target="_blank" style="color: var(--orange-ember);">politykę prywatności</a>.
  Wypisuję się jednym kliknięciem.</span>
</label>
<p class="qlegal" id="consent-error" style="display: none; color: var(--red-primary);">Zaznacz zgodę, żeby otrzymać raport.</p>
```

c) Usuń wartości `value="..."` z inputów (`age`, `height`, `weight`, `uname`) — w makiecie były wypełnione demonstracyjnie; na produkcji puste. Usuń też klasy `selected` z domyślnie zaznaczonych `.qopt` (każde pytanie startuje bez wyboru).

- [ ] **Step 4: Weryfikacja wizualna**

Run: `open index.html`
Expected: sekcja "Czy Twoje ciało przejdzie pierwszy filtr?" między problemami a metodą; klik "Rozpoczynam test" pokazuje pytanie 1 (jeszcze bez logiki wyniku — skrypt w Task 3). Brak czerwonych adnotacji. Mobile: zwęź okno <700px — pola w 1 kolumnie.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add Longevity Score quiz section markup and styles"
```

---

### Task 3: Logika quizu (DOM + submit)

**Files:**
- Modify: `index.html` (skrypt przed `</body>`)

- [ ] **Step 1: Dodaj skrypt quizu**

Przed `</body>` (po istniejących skryptach strony):

```html
<script type="module">
  import { computeResult } from './js/longevity-score.js';

  const track = (event) => { window.dataLayer?.push({ event: `ls_${event}` }); };

  const state = { sex: null, activity: null, goal: null, issue: null };
  let lastResult = null;

  window.lsPick = (el, key) => {
    el.parentElement.querySelectorAll('.qopt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    const v = el.dataset.v;
    state[key] = isNaN(v) ? v : Number(v);
  };

  window.lsGo = (id) => {
    // walidacja minimalna przed przejściem dalej
    const validators = {
      'q-2': () => Number(document.getElementById('age').value) >= 16 && state.sex,
      'q-3': () => Number(document.getElementById('height').value) >= 120 && Number(document.getElementById('weight').value) >= 35,
      'q-5': () => true, // tętno opcjonalne
      'q-4': () => state.activity !== null,
      'q-6': () => state.goal !== null,
      'q-email': () => state.issue !== null,
    };
    if (validators[id] && !validators[id]()) return; // brak danych — nie przechodzimy
    if (id === 'q-1') track('start');
    document.querySelectorAll('#gotowosc .qscreen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('gotowosc').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.lsSubmit = async () => {
    const email = document.getElementById('email').value.trim();
    const name = document.getElementById('uname').value.trim();
    const consent = document.getElementById('consent').checked;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    document.getElementById('consent-error').style.display = consent && emailOk ? 'none' : 'block';
    document.getElementById('consent-error').textContent = !consent
      ? 'Zaznacz zgodę, żeby otrzymać raport.'
      : 'Podaj poprawny adres e-mail.';
    if (!consent || !emailOk) return;

    lastResult = computeResult({
      age: Number(document.getElementById('age').value),
      sex: state.sex,
      heightCm: Number(document.getElementById('height').value),
      weightKg: Number(document.getElementById('weight').value),
      rhr: Number(document.getElementById('rhr').value) || null,
      activity: state.activity,
      issue: state.issue,
    });

    renderResult(name || 'Sportowcu', lastResult);
    track('complete');

    // wysyłka w tle — wynik pokazujemy niezależnie od powodzenia zapisu
    try {
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, name,
          fields: {
            ls_score: lastResult.score, ls_verdict: lastResult.verdict,
            ls_vo2: String(lastResult.vo2), ls_bmi: String(lastResult.bmi),
            ls_rec: lastResult.rec, ls_goal: state.goal, ls_issue: state.issue,
            ls_age: Number(document.getElementById('age').value), ls_sex: state.sex,
          },
        }),
      });
      track('subscribed');
    } catch (e) {
      console.error('subscribe failed', e);
    }
  };

  function renderResult(name, r) {
    const colors = {
      'ZDOLNY': 'var(--success)', 'ZDOLNY WARUNKOWO': 'var(--orange-ember)',
      'WYMAGA PRZYGOTOWANIA': 'var(--red-primary)', 'ODBUDOWA BAZY': 'var(--red-primary)',
    };
    const strokes = { 'var(--success)': '#4ADE80', 'var(--orange-ember)': '#EB5C1C', 'var(--red-primary)': '#C6352C' };
    const descriptions = {
      'ZDOLNY': 'Twoja baza jest powyżej przeciętnej. Teraz gra toczy się o optymalizację — wyciśnięcie pełni potencjału i utrzymanie go przez dekady. Na selekcji liczyć się będzie każdy procent.',
      'ZDOLNY WARUNKOWO': 'Jesteś w okolicach normy — to dobra wiadomość. Zła: norma to przeciętność, a warsztaty eliminują przeciętnych. Masz wyraźną rezerwę do zbudowania.',
      'WYMAGA PRZYGOTOWANIA': 'Wynik poniżej normy dla wieku. Da się to odwrócić — VO2max reaguje na trening szybciej niż myślisz, ale potrzebujesz struktury, nie przypadkowych treningów.',
      'ODBUDOWA BAZY': 'Wynik wymaga działania teraz. Dobra wiadomość: z tego poziomu pierwsze 8 tygodni daje największe przyrosty. Zacznij od fundamentów.',
    };
    const c = colors[r.verdict];
    document.getElementById('r-name').textContent = name;
    document.getElementById('r-stamp-text').textContent = r.verdict;
    const stamp = document.getElementById('r-stamp');
    stamp.style.color = c; stamp.style.borderColor = c;
    document.getElementById('verdict-p').textContent = descriptions[r.verdict];
    document.getElementById('score-n').textContent = r.score;
    document.getElementById('score-n').style.color = c;
    document.getElementById('m-vo2').textContent = r.vo2;
    document.getElementById('m-vo2').className = 'mv ' + (r.vo2 >= r.norm ? 'good' : r.vo2 >= r.norm * 0.85 ? 'warn' : 'bad');
    document.getElementById('m-vo2-norm').textContent = `norma dla wieku: ~${r.norm} ml/kg/min`;
    document.getElementById('m-bmi').textContent = r.bmi;
    document.getElementById('m-bmi').className = 'mv ' + (r.bmi >= 18.5 && r.bmi <= 24.9 ? 'good' : 'warn');
    document.getElementById('m-rec').textContent = r.rec;
    document.getElementById('m-rec').className = 'mv ' + (r.rec >= 75 ? 'good' : r.rec >= 55 ? 'warn' : 'bad');

    document.querySelectorAll('#gotowosc .qscreen').forEach(s => s.classList.remove('active'));
    document.getElementById('q-result').classList.add('active');
    document.getElementById('gotowosc').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const ring = document.getElementById('ring-fill');
    ring.style.stroke = strokes[c];
    setTimeout(() => { ring.style.strokeDashoffset = 477 - (477 * r.score / 100); }, 150);
  }
</script>
```

- [ ] **Step 2: Podmień handlery w markupie sekcji**

W sekcji `#gotowosc` zamień wszystkie wywołania z makiety na nowe globalne:
- `onclick="go('...')"` → `onclick="lsGo('...')"`
- `onclick="pick(this,'...')"` → `onclick="lsPick(this,'...')"`
- `onclick="showResult()"` → `onclick="lsSubmit()"`

(Prefiks `ls` zapobiega kolizji z ewentualnymi funkcjami `go`/`pick` w istniejących skryptach strony — sprawdź: `grep -n "function go(\|function pick(" index.html`.)

Dodatkowo do linku Calendly w `.rcta` (ekran wyniku) dodaj tracking — spec wymaga zdarzenia "klik Calendly":

```html
<a href="https://calendly.com/trening-kamilorawczak/30min" target="_blank" rel="noopener"
   class="btn btn-ember" onclick="window.dataLayer?.push({event:'ls_calendly'})">Zarezerwuj konsultację</a>
```

- [ ] **Step 3: Test ręczny w przeglądarce**

Run: `python3 -m http.server 8788` (ESM nie działa z file://), otwórz `http://localhost:8788`
Expected: pełny flow działa; bez zaznaczonej zgody pokazuje komunikat; z zaznaczoną pokazuje wynik (fetch do /api/subscribe może failować — to OK na tym etapie, wynik i tak się renderuje). Pytania nie przepuszczają dalej bez odpowiedzi.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Wire quiz logic: validation, scoring, consent, submit"
```

---

### Task 4: Proxy do MailerLite

**Files:**
- Create: `api/subscribe.js`

⚠️ **USER ACTION (Kamil):** wygenerować klucz API w MailerLite: panel → **Integrations → MailerLite API → Generate new token**. Klucz trafia do zmiennej środowiskowej `MAILERLITE_API_KEY` na hostingu (oraz lokalnie do `.env` przy testach). NIE commitować klucza.

- [ ] **Step 1: Implementacja**

`api/subscribe.js`:

```js
// Proxy: strona -> MailerLite. Trzyma klucz API poza publicznym JS.
const GROUP_ID = '189925136723347234'; // "Longevity Score — SSWB"
const ALLOWED_FIELDS = ['ls_score', 'ls_verdict', 'ls_vo2', 'ls_bmi', 'ls_rec', 'ls_goal', 'ls_issue', 'ls_age', 'ls_sex'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, fields } = req.body ?? {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const safeFields = { name: typeof name === 'string' ? name.slice(0, 100) : '' };
  for (const key of ALLOWED_FIELDS) {
    if (fields?.[key] !== undefined) safeFields[key] = String(fields[key]).slice(0, 100);
  }

  const upstream = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
    },
    body: JSON.stringify({ email, fields: safeFields, groups: [GROUP_ID] }),
  });

  if (!upstream.ok) {
    console.error('MailerLite error', upstream.status, await upstream.text());
    return res.status(502).json({ error: 'Subscription failed' });
  }
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Test lokalny**

Wymaga klucza od Kamila. Run:

```bash
echo "MAILERLITE_API_KEY=<klucz>" > .env
echo ".env" >> .gitignore   # jeśli .gitignore jeszcze nie zawiera .env
npx vercel dev --listen 3000
```

W drugim terminalu:

```bash
curl -s -X POST http://localhost:3000/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test-longevity@example.com","name":"Test E2E","fields":{"ls_score":55,"ls_verdict":"WYMAGA PRZYGOTOWANIA","ls_goal":"longevity"}}'
```

Expected: `{"ok":true}`, a subskrybent `test-longevity@example.com` widoczny w grupie w panelu MailerLite.
Test walidacji: `curl -s -X POST http://localhost:3000/api/subscribe -H 'Content-Type: application/json' -d '{"email":"zly-adres"}'` → `{"error":"Invalid email"}` (status 400).

- [ ] **Step 3: Commit**

```bash
git add api/subscribe.js .gitignore
git commit -m "Add MailerLite proxy endpoint for quiz subscriptions"
```

---

### Task 5: Automatyzacja MailerLite (przez MCP, nie kod)

Wykonuje Claude narzędziami MCP MailerLite (`build_custom_automation` lub `create_automation` + `dry_run_automation`).

- [ ] **Step 1: Utwórz automatyzację**

Struktura:
- Nazwa: `Longevity Score — sekwencja 5 dni`
- Trigger: subskrybent dołącza do grupy `189925136723347234`
- Krok 1: e-mail "Dzień 1 — Twój raport Longevity Score" (treść: Task 6)
- Krok 2: delay 24h → e-mail "Dzień 2" (placeholder do czasu danych Dariusza — patrz Step 3)
- Krok 3: delay 24h → e-mail "Dzień 3" (jw.)
- Krok 4: delay 24h → e-mail "Dzień 4 — oferta" (treść: Task 7)
- Krok 5: delay 24h → e-mail "Dzień 5" (placeholder)

- [ ] **Step 2: Dni 2/3/5 — automatyzacja startuje BEZ nich**

Jeśli MailerLite nie pozwala zapisać automatyzacji z pustymi krokami, w wersji startowej tworzymy tylko: Dzień 1 → delay 72h → Dzień 4. Dni 2/3/5 wpinamy edycją automatyzacji, gdy treści powstaną (wymagają danych od Kamila — spec, sekcja 8).

- [ ] **Step 3: Dry-run**

Narzędziem `dry_run_automation` zweryfikuj ścieżkę subskrybenta. Expected: trigger grupowy aktywny, kolejność e-mail/delay zgodna ze strukturą.

- [ ] **Step 4: Zapisz ID automatyzacji**

Dopisz ID do STATUS.md (Task 9), żeby kolejne sesje wiedziały co edytować.

---

### Task 6: Treść e-maila — Dzień 1 (raport)

Personalizacja MailerLite: `{$name}` + pola custom (składnia merge tagów do zweryfikowania w edytorze MailerLite — w API/edytorze pola custom wstawia się jako `{$ls_score}` itd.).

- [ ] **Step 1: Draft treści (poniżej) → akceptacja Kamila → instalacja w automatyzacji**

Temat: `{$name}, Twój Longevity Score: {$ls_score}/100`

```
Cześć {$name},

Twój wynik z testu: {$ls_score}/100 — werdykt: {$ls_verdict}.

CO OZNACZAJĄ TWOJE LICZBY

▸ Szacowany VO2max: {$ls_vo2} ml/kg/min
VO2max to jeden z najsilniejszych znanych medycynie pojedynczych predyktorów
długości życia. Badanie na 122 007 osobach (Mandsager 2018, JAMA Network Open)
nie znalazło górnej granicy korzyści — każdy punkt poprawy się liczy.
https://pmc.ncbi.nlm.nih.gov/articles/PMC6324439/

▸ BMI: {$ls_bmi}
Największa meta-analiza w historii (10,6 mln osób, Lancet 2016) pokazuje
najniższe ryzyko zgonu przy BMI 20-25. Uwaga: BMI nie rozróżnia mięśni od
tłuszczu — u osób mocno umięśnionych zawyża ryzyko.
https://pmc.ncbi.nlm.nih.gov/articles/PMC4995441/

▸ Indeks regeneracji: {$ls_rec}/100
Oparty na czynnikach o udokumentowanym związku ze śmiertelnością: tętnie
spoczynkowym (meta-analiza 1,25 mln osób: +10 uderzeń/min = +9% ryzyka)
i jakości snu (meta-analiza 1,38 mln osób).

WAŻNE: Twój wynik to estymacja ankietowa licząca walidowanym modelem
naukowym (Jurca 2005, korelacja z testem wysiłkowym r≈0,8) — nie pomiar
i nie diagnoza. Dokładny pomiar robimy w ramach Pakietu Zdrowia
(25-30 parametrów).

Jutro dostaniesz ode mnie historię człowieka, który przeszedł tę drogę
przed Tobą.

Kamil Orawczak
TRENUJ PROFESJONALNIE × SSWB

PS Nie chcesz czekać? Pierwsza konsultacja jest gratis:
https://calendly.com/trening-kamilorawczak/30min
```

Reguła: każda liczba w treści pochodzi z `LONGEVITY_SCORE_DOWODY_NAUKOWE.md`. Zdanie "Jutro dostaniesz..." usunąć, jeśli startujemy bez dnia 2 (wtedy: "Za kilka dni wrócę z konkretnym planem działania.").

- [ ] **Step 2: Test wysyłki**

Narzędziem `send_test_automation` (lub test z edytora) wyślij na trening.kamilorawczak@gmail.com. Expected: merge tagi wypełnione danymi testowego subskrybenta (score 72, ZDOLNY WARUNKOWO).

---

### Task 7: Treść e-maila — Dzień 4 (oferta)

- [ ] **Step 1: Draft (poniżej) → akceptacja Kamila → instalacja**

Temat: `{$name}, od wyniku {$ls_score}/100 do planu — konkret`

```
Cześć {$name},

Trzy dni temu zobaczyłeś swój Longevity Score: {$ls_score}/100.
Pytanie nie brzmi "czy da się to poprawić" — bo się da. Pytanie brzmi:
czy zrobisz to systemem, czy kolejną porcją przypadkowych treningów.

CO PROPONUJĘ

1. Pierwsza konsultacja — GRATIS (30 min)
   Przechodzimy przez Twój wynik punkt po punkcie. Sprawdzamy, czy pasujemy
   do siebie. Bez zobowiązań.

2. Pakiet Zdrowia — prawdziwa diagnostyka
   25-30 parametrów zdrowotnych: to, czego żadna ankieta nie zmierzy.
   Twój wynik z quizu to estymacja — tu dostajesz pomiar.

3. Indywidualny plan 1:1
   Pod Twój cel, Twój kalendarz i Twoje liczby. Nie szablon.

DLACZEGO TERAZ

Prowadzę maksymalnie 5-8 osób równocześnie — to nie marketing, tylko
warunek jakości pracy 1:1. Wolne miejsca w rosterze pojawiają się rzadko.

→ Zarezerwuj konsultację: https://calendly.com/trening-kamilorawczak/30min

Kamil Orawczak
TRENUJ PROFESJONALNIE × SSWB
```

Reguły: zero countdownu; limit miejsc tylko jeśli faktyczny stan rosteru to potwierdza (potwierdzić z Kamilem przed instalacją).

- [ ] **Step 2: Test wysyłki** — jak Task 6 Step 2.

---

### Task 8: Weryfikacja E2E + porządki

- [ ] **Step 1: Pełny flow lokalnie**

`npx vercel dev` → przejdź quiz w przeglądarce z prawdziwym mailem testowym (np. trening.kamilorawczak+e2e@gmail.com) → Expected: wynik na ekranie, subskrybent w grupie z polami, automatyzacja wysłała e-mail dnia 1.

- [ ] **Step 2: Posprzątaj dane testowe**

- usuń subskrybentów testowych (`test-longevity@example.com`, `+e2e`) narzędziem MCP `delete_subscriber`
- przywróć imię Kamila na karcie trening.kamilorawczak@gmail.com (z "Kamil (TEST)" na "Kamil") i usuń go z grupy quizu (`unassign_subscriber_from_group`) — inaczej automatyzacja będzie do niego strzelać

- [ ] **Step 3: Commit końcowy**

```bash
git add -A && git status   # przejrzyj listę przed commitem
git commit -m "Longevity Score quiz: final integration"
```

---

### Task 9: STATUS.md + otwarte punkty

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Dopisz sekcję**

```markdown
## Longevity Score Quiz (2026-06-10+)

- Spec: docs/superpowers/specs/2026-06-10-longevity-score-quiz-design.md
- Dowody naukowe (źródło prawdy treści): LONGEVITY_SCORE_DOWODY_NAUKOWE.md
- MailerLite: grupa 189925136723347234, pola ls_*, automatyzacja ID: [WPISAĆ]
- Sekwencja: dzień 1 i 4 aktywne; dni 2/3/5 czekają na:
  - [ ] dane przed/po Dariusza (dzień 2)
  - [ ] 5-10 pytań z grupy WhatsApp (dzień 5)
  - [ ] ćwiczenia z PDF "Wymagania sprawnościowe" (dzień 3)
- Hosting/domena: [DO DECYZJI] — api/subscribe.js wymaga hostingu z funkcjami
  (Vercel); MAILERLITE_API_KEY w env
```

- [ ] **Step 2: Commit**

```bash
git add STATUS.md
git commit -m "Update STATUS with Longevity Score quiz state"
```

---

## Zależności od Kamila (blokery częściowe)

1. **Klucz API MailerLite** (Task 4) — panel → Integrations → API → Generate token
2. **Akceptacja treści maili** dzień 1 i 4 (Task 6-7)
3. **Decyzja hosting/domena** — quiz działa lokalnie bez tego, ale publikacja wymaga
   hostingu obsługującego funkcje serverless (rekomendacja: Vercel, repo już na GitHubie)
4. Późniejsze: dane Dariusza, pytania z WhatsApp (dni 2/3/5)
