const fc = require('fast-check');
const { creaGateway } = require('./creaGateway');
const { creaMqttFinto } = require('./test-utils/clientFinto');

const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';

// Convenzione: ogni proprietà contiene UNA expect. Se fallisce lancia un errore,
// fast-check lo intercetta, riduce il controesempio e lo riporta con il messaggio di Jest.
// Attenzione: dentro le graffe una espressione booleana senza expect non verifica nulla.

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
    fc.assert(
      fc.property(uptimeArbitrario, (u) => {
        expect(Number.isInteger(payloadHeartbeatConUptime(u).uptime)).toBe(true);
      })
    );
  });

  test('l\'uptime pubblicato non è mai negativo', () => {
    fc.assert(
      fc.property(uptimeArbitrario, (u) => {
        expect(payloadHeartbeatConUptime(u).uptime).toBeGreaterThanOrEqual(0);
      })
    );
  });

  test('l\'uptime pubblicato non supera mai il valore di process.uptime()', () => {
    fc.assert(
      fc.property(uptimeArbitrario, (u) => {
        expect(payloadHeartbeatConUptime(u).uptime).toBeLessThanOrEqual(u);
      })
    );
  });

  // Le chiavi sono confrontate in ordine alfabetico (.sort()).
  test('il payload contiene sempre e solo le chiavi status, uptime e intervalloS', () => {
    fc.assert(
      fc.property(uptimeArbitrario, (u) => {
        expect(Object.keys(payloadHeartbeatConUptime(u)).sort()).toEqual(
          ['intervalloS', 'status', 'uptime']
        );
      })
    );
  });

  test('il payload ha sempre status online', () => {
    fc.assert(
      fc.property(uptimeArbitrario, (u) => {
        expect(payloadHeartbeatConUptime(u).status).toBe('online');
      })
    );
  });

  // Modello: ogni 'tick' fa scattare il timer; l'heartbeat parte solo se in
  // quel momento il client è connesso. Il numero di publish sul topic heartbeat
  // deve essere esattamente il numero di tick avvenuti con connected === true.
  test('i publish di heartbeat sono esattamente i tick avvenuti a client connesso', () => {
    const sequenze = fc.array(fc.constantFrom('connetti', 'disconnetti', 'tick'), { maxLength: 40 });

    fc.assert(
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
        expect(effettivi).toBe(attesi);
      })
    );
  });
});

describe('intervallo passato a setInterval (proprietà)', () => {
  const inputQualsiasi = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.double({ noNaN: false, noDefaultInfinity: false }),
    fc.integer({ min: -10, max: 5000 }).map(String),
    fc.constant(undefined)
  );
  let spiaSetInterval;

  beforeEach(() => {
    jest.useFakeTimers();
    spiaSetInterval = jest.spyOn(global, 'setInterval');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // mockClear a ogni giro: senza, mock.calls[0] sarebbe sempre il primo input generato.
  function msPassatiASetInterval(intervalloS) {
    spiaSetInterval.mockClear();
    const { mqttLib } = creaMqttFinto();
    const gateway = creaGateway({ host: 'h', password: 'p', intervalloS, mqttLib });
    gateway.stop();
    return spiaSetInterval.mock.calls[0][1];
  }

  // Valori in chiaro (1 s e 300 s), non letti dal sorgente: sono un contratto.
  test('setInterval non riceve mai meno del minimo', () => {
    fc.assert(
      fc.property(inputQualsiasi, (x) => {
        expect(msPassatiASetInterval(x)).toBeGreaterThanOrEqual(1000);
      })
    );
  });

  test('setInterval non riceve mai più del massimo', () => {
    fc.assert(
      fc.property(inputQualsiasi, (x) => {
        expect(msPassatiASetInterval(x)).toBeLessThanOrEqual(300000);
      })
    );
  });
});