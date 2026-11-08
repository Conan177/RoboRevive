// ⚠️ Se i test sono in una sottocartella, aggiorna SOLO queste tre righe di import
// (es. '../creaGateway' e '../test-utils/clientFinto').
const fc = require('fast-check');
const { creaGateway } = require('./creaGateway');
const { creaMqttFinto } = require('./test-utils/clientFinto');

const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';

// Esegue la proprietà e fallisce (mostrando il controesempio ridotto da fast-check)
// se esiste almeno un input che la viola. È l'unica asserzione di ogni test.
const proprietaValida = (proprieta, parametri) =>
  expect(() => fc.assert(proprieta, parametri)).not.toThrow();


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

  test('setInterval non riceve mai meno del minimo', () => {
    proprietaValida(
      fc.property(inputQualsiasi, (x) => msPassatiASetInterval(x) >= 1000)
    );
  });

  test('setInterval non riceve mai più del massimo', () => {
    proprietaValida(
      fc.property(inputQualsiasi, (x) => msPassatiASetInterval(x) <= 300000)
    );
  });
});