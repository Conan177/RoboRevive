// ⚠️ Se i test sono in una sottocartella, aggiorna i require (es. '../scenari').
const fc = require('fast-check');
const { SCENARI, scenarioDaTopic } = require('./scenari');

const proprietaValida = (proprieta, parametri) =>
  expect(() => fc.assert(proprieta, parametri)).not.toThrow();

const NOMI = Object.keys(SCENARI);
const PREFISSO = 'tagliaerba/gateway/cmd/simula/';

const nomeScenario = fc.constantFrom(...NOMI);
// Da 1970 al 2100: oltre, toISOString usa il formato esteso (+YYYYYY).
const ora = fc.integer({ min: 0, max: 4102444800000 });
// Generatore casuale in [0, 1) come Math.random, mai 1.
const valoreCasuale = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

const messaggiDi = (nome, o, c) => SCENARI[nome]({ ora: o, casuale: () => c });
const payloadDi = (nome, o, c) => messaggiDi(nome, o, c)[0].payload;

describe('scenari (proprietà)', () => {
  test('ogni topic prodotto ha esattamente tre livelli, come richiede l\'ACL tagliaerba/+/+', () => {
    proprietaValida(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) =>
        messaggiDi(nome, o, c).every((m) => m.topic.split('/').length === 3)
      )
    );
  });

  test('ogni topic prodotto inizia con tagliaerba/', () => {
    proprietaValida(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) =>
        messaggiDi(nome, o, c).every((m) => m.topic.startsWith('tagliaerba/'))
      )
    );
  });

  test('nessun evento è retained', () => {
    proprietaValida(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) =>
        messaggiDi(nome, o, c).every((m) => m.retain === false)
      )
    );
  });

  test('il payload serializzato è JSON valido e identico all\'originale', () => {
    proprietaValida(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) => {
        const payload = payloadDi(nome, o, c);
        return JSON.stringify(JSON.parse(JSON.stringify(payload))) === JSON.stringify(payload);
      })
    );
  });

  test('il timestamp è sempre ISO 8601 UTC senza millisecondi', () => {
    proprietaValida(
      fc.property(nomeScenario, ora, valoreCasuale, (nome, o, c) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payloadDi(nome, o, c).timestamp)
      )
    );
  });

  test('la temperatura dell\'aria resta tra 10 e 35 °C', () => {
    proprietaValida(
      fc.property(ora, valoreCasuale, (o, c) => {
        const t = payloadDi('ambiente', o, c).temp_aria;
        return t >= 10 && t <= 35;
      })
    );
  });

  test('l\'umidità dell\'aria resta tra 0 e 100 %', () => {
    proprietaValida(
      fc.property(ora, valoreCasuale, (o, c) => {
        const u = payloadDi('ambiente', o, c).umidita_aria;
        return u >= 0 && u <= 100;
      })
    );
  });

  test('l\'umidità del terreno resta tra 0 e 100 %', () => {
    proprietaValida(
      fc.property(ora, valoreCasuale, (o, c) => {
        const u = payloadDi('ambiente', o, c).umidita_terreno;
        return u >= 0 && u <= 100;
      })
    );
  });

  test('la confidenza della partenza resta tra 0 e 1', () => {
    proprietaValida(
      fc.property(ora, valoreCasuale, (o, c) => {
        const confidenza = payloadDi('partenza', o, c).confidenza;
        return confidenza >= 0 && confidenza <= 1;
      })
    );
  });
});

describe('scenarioDaTopic (proprietà)', () => {
  test('per qualunque suffisso restituisce null oppure il nome di uno scenario esistente', () => {
    proprietaValida(
      fc.property(fc.string(), (suffisso) => [null, ...NOMI].includes(scenarioDaTopic(PREFISSO + suffisso)))
    );
  });

  test('un topic fuori dal namespace simula restituisce sempre null', () => {
    proprietaValida(
      fc.property(
        fc.string().filter((s) => !s.startsWith(PREFISSO)),
        (topic) => scenarioDaTopic(topic) === null
      )
    );
  });
});