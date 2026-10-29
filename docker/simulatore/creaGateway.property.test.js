// ⚠️ Se i test sono in una sottocartella, aggiorna SOLO queste tre righe di import
// (es. '../creaGateway' e '../test-utils/clientFinto').
const fc = require('fast-check');
const { creaGateway, calcolaIntervalloS } = require('./creaGateway');
const { creaMqttFinto } = require('./test-utils/clientFinto');

const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';

// Esegue la proprietà e fallisce (mostrando il controesempio ridotto da fast-check)
// se esiste almeno un input che la viola. È l'unica asserzione di ogni test.
const proprietaValida = (proprieta, parametri) =>
  expect(() => fc.assert(proprieta, parametri)).not.toThrow();

// ---------------------------------------------------------------------------
// calcolaIntervalloS (funzione pura: nessun timer, nessun mock)
// ---------------------------------------------------------------------------
describe('calcolaIntervalloS (proprietà)', () => {
  // Stringhe il cui valore numerico non è né positivo né negativo: NaN, 0, -0.
  const stringheNonNumericheOZero = fc.oneof(
    fc.string().filter((s) => !(Number(s) > 0 || Number(s) < 0)),
    fc.constantFrom('', ' ', '  ', '\n', '0', '-0', '+0', '0.0', '0e5', 'abc', 'NaN')
  );

  // Intervalli che setInterval gestisce davvero: da 1 ms a 2^31-1 ms (circa 24,8 giorni).
  const intervalloValido = fc.double({ min: 0.001, max: 2147483, noNaN: true });

  test('una stringa non numerica o uguale a zero ricade sul default di 30 s', () => {
    proprietaValida(
      fc.property(stringheNonNumericheOZero, (s) => calcolaIntervalloS(s) === 30)
    );
  });

  test('un numero positivo valido viene restituito invariato', () => {
    proprietaValida(
      fc.property(intervalloValido, (x) => calcolaIntervalloS(String(x)) === x)
    );
  });

  test('un valore undefined ricade sul default di 30 s', () => {
    expect(calcolaIntervalloS(undefined)).toBe(30);
  });

  // --- Comportamento ATTUALE problematico, documentato con test.failing ----
  // Il test descrive il comportamento DESIDERATO. Oggi fallisce (e quindi test.failing
  // risulta verde) perché manca la validazione. Quando la aggiungerai, questi test
  // diventeranno rossi: togli `.failing` e restano come test di regressione.
  test.failing('un numero negativo dovrebbe ricadere sul default di 30 s', () => {
    proprietaValida(
      fc.property(
        fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
        (x) => calcolaIntervalloS(String(x)) === 30
      )
    );
  });

  test.failing('un intervallo oltre il limite di setInterval dovrebbe ricadere su 30 s', () => {
    proprietaValida(
      fc.property(
        fc.double({ min: 2147484, noNaN: true }),
        (x) => calcolaIntervalloS(String(x)) === 30
      )
    );
  });
});

// ---------------------------------------------------------------------------
// pubblicaHeartbeat
// ---------------------------------------------------------------------------
describe('heartbeat (proprietà)', () => {
  const uptimeArbitrario = fc.double({ min: 0, max: 1e9, noNaN: true });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Crea un gateway connesso, con process.uptime() controllato, e restituisce
  // il payload già parsato dell'heartbeat pubblicato.
  function payloadHeartbeatConUptime(uptime) {
    jest.spyOn(process, 'uptime').mockReturnValue(uptime);
    const { client, mqttLib } = creaMqttFinto();
    client.connected = true;
    const gateway = creaGateway({ host: 'h', password: 'p', intervalloS: 30, mqttLib });
    gateway.pubblicaHeartbeat();
    gateway.stop();
    return JSON.parse(client.publish.mock.calls[0][1]);
  }

  test('l\'uptime pubblicato è sempre un intero', () => {
    proprietaValida(
      fc.property(uptimeArbitrario, (u) => Number.isInteger(payloadHeartbeatConUptime(u).uptime))
    );
  });

  test('l\'uptime pubblicato non è mai negativo', () => {
    proprietaValida(
      fc.property(uptimeArbitrario, (u) => payloadHeartbeatConUptime(u).uptime >= 0)
    );
  });

  test('l\'uptime pubblicato non supera mai il valore di process.uptime()', () => {
    proprietaValida(
      fc.property(uptimeArbitrario, (u) => payloadHeartbeatConUptime(u).uptime <= u)
    );
  });

  test('il payload contiene sempre e solo le chiavi status e uptime', () => {
    proprietaValida(
      fc.property(uptimeArbitrario, (u) =>
        Object.keys(payloadHeartbeatConUptime(u)).sort().join(',') === 'status,uptime'
      )
    );
  });

  test('il payload ha sempre status online', () => {
    proprietaValida(
      fc.property(uptimeArbitrario, (u) => payloadHeartbeatConUptime(u).status === 'online')
    );
  });

  // Modello: ogni 'tick' fa scattare il timer; l'heartbeat parte solo se in
  // quel momento il client è connesso. Il numero di publish sul topic heartbeat
  // deve essere esattamente il numero di tick avvenuti con connected === true.
  test('i publish di heartbeat sono esattamente i tick avvenuti a client connesso', () => {
    const sequenze = fc.array(fc.constantFrom('connetti', 'disconnetti', 'tick'), { maxLength: 40 });

    proprietaValida(
      fc.property(sequenze, (sequenza) => {
        const { client, mqttLib } = creaMqttFinto();
        const gateway = creaGateway({ host: 'h', password: 'p', intervalloS: 1, mqttLib });
        let attesi = 0;

        sequenza.forEach((evento) => {
          if (evento === 'connetti') client.connected = true;
          else if (evento === 'disconnetti') client.connected = false;
          else {
            if (client.connected) attesi += 1;
            jest.advanceTimersByTime(1000);
          }
        });

        gateway.stop();
        const effettivi = client.publish.mock.calls.filter(([t]) => t === TOPIC_HEARTBEAT).length;
        return effettivi === attesi;
      })
    );
  });
});