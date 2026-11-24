const fc = require('fast-check');
const { applicaEvento, statoIniziale, creaEvento } = require('./stato-gateway');

// Convenzione: ogni proprietà contiene UNA expect. Se la expect fallisce lancia un
// errore, fast-check lo intercetta, riduce il controesempio (shrinking) e lo riporta.
// Attenzione: dentro le graffe una espressione booleana senza expect non verifica nulla.

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

// --- Soglia dei 3 intervalli ------------------------------------------------
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

describe('stato gateway (proprietà)', () => {
  test('dopo uno status offline, heartbeat e controlli non cambiano mai lo stato', () => {
    const offline = applicaEvento(statoIniziale(), { tipo: 'status', status: 'offline', adesso: 0 });
    fc.assert(
      fc.property(fc.array(eventoNonStatus), (eventi) => {
        expect(applicaTutti(offline, eventi).stato).toBe('offline');
      })
    );
  });

  test('l\'intervalloS nello stato è sempre un intero', () => {
    fc.assert(
      fc.property(fc.array(eventoQualsiasi), (eventi) => {
        expect(Number.isInteger(applicaTutti(statoIniziale(), eventi).intervalloS)).toBe(true);
      })
    );
  });

  test('l\'intervalloS nello stato non è mai sotto il minimo di 1', () => {
    fc.assert(
      fc.property(fc.array(eventoQualsiasi), (eventi) => {
        expect(applicaTutti(statoIniziale(), eventi).intervalloS).toBeGreaterThanOrEqual(1);
      })
    );
  });

  test('l\'intervalloS nello stato non è mai sopra il massimo di 300', () => {
    fc.assert(
      fc.property(fc.array(eventoQualsiasi), (eventi) => {
        expect(applicaTutti(statoIniziale(), eventi).intervalloS).toBeLessThanOrEqual(300);
      })
    );
  });

  test('applicaEvento non modifica mai lo stato ricevuto', () => {
    fc.assert(
      fc.property(fc.array(eventoQualsiasi), eventoQualsiasi, (eventi, evento) => {
        const prima = applicaTutti(statoIniziale(), eventi);
        const copia = JSON.stringify(prima);
        applicaEvento(prima, evento);
        expect(JSON.stringify(prima)).toBe(copia);
      })
    );
  });

  test('un controllo entro 3 intervalli dall\'ultimo contatto lascia lo stato online', () => {
    fc.assert(
      fc.property(intervalloConDeltaEntro, adesso, ([i, delta], t0) => {
        const dopo = applicaEvento(onlineConIntervallo(i, t0), { tipo: 'controllo', adesso: t0 + delta });
        expect(dopo.stato).toBe('online');
      })
    );
  });

  test('un controllo oltre 3 intervalli dall\'ultimo contatto porta a sospetto', () => {
    fc.assert(
      fc.property(intervalloConDeltaOltre, adesso, ([i, delta], t0) => {
        const dopo = applicaEvento(onlineConIntervallo(i, t0), { tipo: 'controllo', adesso: t0 + delta });
        expect(dopo.stato).toBe('sospetto');
      })
    );
  });
});

// --- creaEvento -------------------------------------------------------------
const TOPIC_STATUS = 'tagliaerba/gateway/status';
const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';
const TOPIC_CONTROLLO = 'controllo';
const RISULTATI_AMMESSI = [null, 'status', 'heartbeat', 'controllo'];

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
        expect(RISULTATI_AMMESSI).toContain(evento?.tipo ?? null);
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
      fc.property(coppie, payloadQualsiasi, adesso, ([topic, tipo], payload, t) => {
        expect(creaEvento(topic, payload, t).tipo).toBe(tipo);
      })
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
      fc.property(fc.array(messaggio), (messaggi) => {
        expect(Number.isInteger(applicaMessaggi(statoIniziale(), messaggi).intervalloS)).toBe(true);
      })
    );
  });

  test('dopo qualunque sequenza di messaggi l\'intervalloS non è mai sotto 1', () => {
    fc.assert(
      fc.property(fc.array(messaggio), (messaggi) => {
        expect(applicaMessaggi(statoIniziale(), messaggi).intervalloS).toBeGreaterThanOrEqual(1);
      })
    );
  });

  test('dopo qualunque sequenza di messaggi l\'intervalloS non è mai sopra 300', () => {
    fc.assert(
      fc.property(fc.array(messaggio), (messaggi) => {
        expect(applicaMessaggi(statoIniziale(), messaggi).intervalloS).toBeLessThanOrEqual(300);
      })
    );
  });
});