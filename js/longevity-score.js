// Scoring Longevity Score — estymacja VO2max wg modelu Jurca et al. 2005.
// Model zwraca wydolność w METs; VO2max [ml/kg/min] = METs × 3.5.
// Wynik jest estymacją ankietową, nie pomiarem (patrz LONGEVITY_SCORE_DOWODY_NAUKOWE.md).

// Punkty aktywności wg poziomów PA modelu Jurca (0–3.03),
// zmapowane na 4 opcje quizu: wcale / nieregularnie / regularnie / często+intensywnie.
const PA_SCORE = [0, 0.75, 1.76, 3.03];

export function computeResult({ age, sex, heightCm, weightKg, rhr, activity, issue }) {
  const bmi = weightKg / (heightCm / 100) ** 2;
  const restHr = rhr ?? 62 - activity * 3;

  const sexF = sex === 'm' ? 2.77 : 0;
  const mets = 18.07 + sexF - 0.10 * age - 0.17 * bmi - 0.03 * restHr + PA_SCORE[activity];
  // Clamp do fizjologicznie sensownego zakresu — model regresyjny źle ekstrapoluje
  // poza zakres danych treningowych (skrajne BMI/wiek).
  const vo2 = Math.min(75, Math.max(12, mets * 3.5));

  // Przybliżona norma populacyjna dla wieku (poziom C w mapie dowodów — heurystyka).
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
