const fc = require('fast-check');
const { applicaEvento, statoIniziale, creaEvento  } = require('./stato-gateway');

const proprietaValida = (proprieta, parametri) =>
  expect(() => fc.assert(proprieta, parametri)).not.toThrow();

// --- Generatori di eventi ---------------------------------------------------
const adesso = fc.integer({ min: 0, max: 1e12 });

const eventoStatus = fc.record({
  tipo: fc.constant('status'),
  status: fc.constantFrom('online', 'offline'),
  adesso,
});

// intervalloS è l'input "non fidato": può essere qualunque cosa. Il secondo ramo
// pesca fitto vicino ai bordi (-10..5000), dove un limite sbagliato si nasconde.
const eventoHeartbeat = fc.record({
  tipo: fc.constant('heartbeat'),
  intervalloS: fc.oneof(fc.anything(), fc.integer({ min: -10, max: 5000 })),
  adesso,
});

const eventoControllo = fc.record({ tipo: fc.constant('controllo'), adesso });

const eventoQualsiasi = fc.oneof(eventoStatus, eventoHeartbeat, eventoControllo);
const eventoNonStatus = fc.oneof(eventoHeartbeat, eventoControllo);

// Applica una sequenza di eventi, in ordine, partendo da uno stato.
const applicaTutti = (stato, eventi) =>
  eventi.reduce((corrente, evento) => applicaEvento(corrente, evento), stato);

describe('stato gateway (proprietà)', () => {
  test('dopo uno status offline, heartbeat e controlli non cambiano mai lo stato', () => {
    const offline = applicaEvento(statoIniziale(), { tipo: 'status', status: 'offline', adesso: 0 });
    proprietaValida(
      fc.property(fc.array(eventoNonStatus), (eventi) =>
        applicaTutti(offline, eventi).stato === 'offline'
      )
    );
  });

  test('l\'intervalloS nello stato è sempre un intero', () => {
    proprietaValida(
      fc.property(fc.array(eventoQualsiasi), (eventi) =>
        Number.isInteger(applicaTutti(statoIniziale(), eventi).intervalloS)
      )
    );
  });

  test('l\'intervalloS nello stato è sempre compreso tra 1 e 300', () => {
    proprietaValida(
      fc.property(fc.array(eventoQualsiasi), (eventi) => {
        const { intervalloS } = applicaTutti(statoIniziale(), eventi);
        return intervalloS >= 1 && intervalloS <= 300;
      })
    );
  });

  test('applicaEvento non modifica mai lo stato ricevuto', () => {
    proprietaValida(
      fc.property(fc.array(eventoQualsiasi), eventoQualsiasi, (eventi, evento) => {
        const prima = applicaTutti(statoIniziale(), eventi);
        const copia = JSON.stringify(prima);
        applicaEvento(prima, evento);
        return JSON.stringify(prima) === copia;
      })
    );
  });

  // Per ogni intervallo valido, un controllo entro 3 intervalli non cambia nulla...
  const intervalloConDeltaEntro = fc.integer({ min: 1, max: 300 }).chain((i) =>
    fc.tuple(fc.constant(i), fc.integer({ min: 0, max: 3 * i * 1000 }))
  );
  // ...e uno oltre i 3 intervalli porta a sospetto.
  const intervalloConDeltaOltre = fc.integer({ min: 1, max: 300 }).chain((i) =>
    fc.tuple(fc.constant(i), fc.integer({ min: 3 * i * 1000 + 1, max: 3 * i * 1000 + 1_000_000 }))
  );

  const onlineConIntervallo = (intervalloS, t0) =>
    applicaTutti(statoIniziale(), [
      { tipo: 'status', status: 'online', adesso: t0 },
      { tipo: 'heartbeat', intervalloS, adesso: t0 },
    ]);

  test('un controllo entro 3 intervalli dall\'ultimo contatto lascia lo stato online', () => {
    proprietaValida(
      fc.property(intervalloConDeltaEntro, adesso, ([i, delta], t0) =>
        applicaEvento(onlineConIntervallo(i, t0), { tipo: 'controllo', adesso: t0 + delta }).stato === 'online'
      )
    );
  });

  test('un controllo oltre 3 intervalli dall\'ultimo contatto porta a sospetto', () => {
    proprietaValida(
      fc.property(intervalloConDeltaOltre, adesso, ([i, delta], t0) =>
        applicaEvento(onlineConIntervallo(i, t0), { tipo: 'controllo', adesso: t0 + delta }).stato === 'sospetto'
      )
    );
  });
});

// --- creaEvento -------------------------------------------------------------
const TOPIC_STATUS = 'tagliaerba/gateway/status';
const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';
const TOPIC_CONTROLLO = 'controllo';
const TIPI_VALIDI = ['status', 'heartbeat', 'controllo'];

// Topic: i tre noti (altrimenti fc.anything() non li pescherebbe quasi mai) più spazzatura.
const topicQualsiasi = fc.oneof(
  fc.constantFrom(TOPIC_STATUS, TOPIC_HEARTBEAT, TOPIC_CONTROLLO),
  fc.string(),
  fc.anything()
);

// Payload: valori qualsiasi, stringhe qualsiasi, JSON valido come stringa, e
// oggetti "quasi giusti" (anche serializzati) con intervalloS vicino ai bordi.
const oggettoQuasiGiusto = fc.record({
  status: fc.oneof(fc.constantFrom('online', 'offline'), fc.anything()),
  intervalloS: fc.oneof(fc.anything(), fc.integer({ min: -10, max: 5000 })),
});
const payloadQualsiasi = fc.oneof(
  fc.anything(),
  fc.string(),
  fc.json(),
  oggettoQuasiGiusto,
  oggettoQuasiGiusto.map(JSON.stringify)
);

describe('creaEvento (proprietà)', () => {
  test('per qualunque topic e payload restituisce null o un evento di tipo valido', () => {
    fc.assert(
      fc.property(topicQualsiasi, payloadQualsiasi, adesso, (topic, payload, t) => {
        const evento = creaEvento(topic, payload, t);
        return evento === null || TIPI_VALIDI.includes(evento.tipo);
      })
    );
  });

  test('per i topic noti produce sempre un evento del tipo corrispondente', () => {
    const coppie = fc.constantFrom(
      [TOPIC_STATUS, 'status'],
      [TOPIC_HEARTBEAT, 'heartbeat'],
      [TOPIC_CONTROLLO, 'controllo']
    );
    fc.assert(
      fc.property(coppie, payloadQualsiasi, adesso, ([topic, tipo], payload, t) =>
        creaEvento(topic, payload, t).tipo === tipo
      )
    );
  });
});

// --- creaEvento + applicaEvento insieme -------------------------------------
const messaggio = fc.record({ topic: topicQualsiasi, payload: payloadQualsiasi, adesso });

// Applica una sequenza di messaggi grezzi, scartando quelli che non producono eventi.
const applicaMessaggi = (stato, messaggi) =>
  messaggi.reduce((corrente, m) => {
    const evento = creaEvento(m.topic, m.payload, m.adesso);
    return evento === null ? corrente : applicaEvento(corrente, evento);
  }, stato);

describe('messaggi grezzi e stato (proprietà)', () => {
  test('dopo qualunque sequenza di messaggi l\'intervalloS è un intero', () => {
    fc.assert(
      fc.property(fc.array(messaggio), (messaggi) =>
        Number.isInteger(applicaMessaggi(statoIniziale(), messaggi).intervalloS)
      )
    );
  });

  test('dopo qualunque sequenza di messaggi l\'intervalloS è compreso tra 1 e 300', () => {
    fc.assert(
      fc.property(fc.array(messaggio), (messaggi) => {
        const { intervalloS } = applicaMessaggi(statoIniziale(), messaggi);
        return intervalloS >= 1 && intervalloS <= 300;
      })
    );
  });
});