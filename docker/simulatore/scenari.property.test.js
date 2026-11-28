const fc = require('fast-check');
const { SCENARI, scenarioDaTopic } = require('./scenari');

// Convenzione: ogni proprietà contiene UNA expect. Se fallisce lancia un errore,
// fast-check lo intercetta, riduce il controesempio e lo riporta con il messaggio di Jest.
// Attenzione: dentro le graffe una espressione booleana senza expect non verifica nulla.

const NOMI = Object.keys(SCENARI);
const PREFISSO = 'tagliaerba/gateway/cmd/simula/';

const nomeScenario = fc.constantFrom(...NOMI);
// Da 1970 al 2100: oltre, toISOString usa il formato esteso (+YYYYYY).
const ora = fc.integer({ min: 0, max: 4102444800000 });
// Generatore casuale in [0, 1) come Math.random, mai 1.
const valoreCasuale = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

const messaggiDi = (nome, o, c) => SCENARI[nome]({ ora: o, casuale: () => c });
const payloadDi = (nome, o, c) => messaggiDi(nome, o, c)[0].payload;

// Un array lungo quanto `valori`, con lo stesso `atteso` ovunque: permette di
// confrontare con un'unica expect tutti i messaggi e di vedere quale viola la regola.
const ripetuto = (valori, atteso) => valori.map(() => atteso);

describe('scenari (proprietà)', () => {
  test('ogni topic prodotto ha esattamente tre livelli, come richiede l\'ACL tagliaerba/+/+', () => {
    fc.assert(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) => {
        const messaggi = messaggiDi(nome, o, c);
        expect(messaggi.map((m) => m.topic.split('/').length)).toEqual(ripetuto(messaggi, 3));
      })
    );
  });

  test('ogni topic prodotto inizia con tagliaerba/', () => {
    fc.assert(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) => {
        const messaggi = messaggiDi(nome, o, c);
        expect(messaggi.map((m) => m.topic.startsWith('tagliaerba/'))).toEqual(ripetuto(messaggi, true));
      })
    );
  });

  test('nessun evento è retained', () => {
    fc.assert(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) => {
        const messaggi = messaggiDi(nome, o, c);
        expect(messaggi.map((m) => m.retain)).toEqual(ripetuto(messaggi, false));
      })
    );
  });

  test('il payload serializzato è JSON valido e identico all\'originale', () => {
    fc.assert(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) => {
        const payload = payloadDi(nome, o, c);
        expect(JSON.stringify(JSON.parse(JSON.stringify(payload)))).toBe(JSON.stringify(payload));
      })
    );
  });

  test('il timestamp è sempre ISO 8601 UTC senza millisecondi', () => {
    fc.assert(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) => {
        expect(payloadDi(nome, o, c).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      })
    );
  });

  // Intervalli dei valori simulati: ogni grandezza ha due test, uno per il minimo e uno per il massimo.
  const GRANDEZZE = [
    ['la temperatura dell\'aria (°C)', 'ambiente', 'temp_aria', 10, 35],
    ['l\'umidità dell\'aria (%)', 'ambiente', 'umidita_aria', 0, 100],
    ['l\'umidità del terreno (%)', 'ambiente', 'umidita_terreno', 0, 100],
    ['la confidenza della partenza', 'partenza', 'confidenza', 0, 1],
  ];

  test.each(GRANDEZZE)('%s non scende mai sotto il minimo', (_nome, scenario, campo, minimo) => {
    fc.assert(
      fc.property(ora, valoreCasuale, (o, c) => {
        expect(payloadDi(scenario, o, c)[campo]).toBeGreaterThanOrEqual(minimo);
      })
    );
  });

  test.each(GRANDEZZE)('%s non supera mai il massimo', (_nome, scenario, campo, _minimo, massimo) => {
    fc.assert(
      fc.property(ora, valoreCasuale, (o, c) => {
        expect(payloadDi(scenario, o, c)[campo]).toBeLessThanOrEqual(massimo);
      })
    );
  });
});

describe('scenarioDaTopic (proprietà)', () => {
  test('per qualunque suffisso restituisce null oppure il nome di uno scenario esistente', () => {
    fc.assert(
      fc.property(fc.string(), (suffisso) => {
        expect([null, ...NOMI]).toContain(scenarioDaTopic(PREFISSO + suffisso));
      })
    );
  });

  test('un topic fuori dal namespace simula restituisce sempre null', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith(PREFISSO)),
        (topic) => {
          expect(scenarioDaTopic(topic)).toBeNull();
        }
      )
    );
  });
});