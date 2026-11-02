const { collegaScenari } = require('./simulazione');
const { creaClientFinto } = require('./test-utils/clientFinto');

const TOPIC_COMANDO = 'tagliaerba/gateway/cmd/simula/';
const ORA = Date.UTC(2026, 10, 2, 10, 30, 0);

let client;

// Simula l'arrivo di un messaggio dal broker, come farebbe la libreria mqtt.
function ricevi(topic, { retain = false } = {}) {
  client.emit('message', topic, Buffer.from(''), { retain });
}

beforeEach(() => {
  client = creaClientFinto();
  collegaScenari({ client, ora: () => ORA, casuale: () => 0.5 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sottoscrizione ai comandi', () => {
  test('si sottoscrive ai comandi di simulazione alla connessione, con QoS 1', () => {
    client.emit('connect');
    expect(client.subscribe).toHaveBeenCalledWith('tagliaerba/gateway/cmd/simula/#', { qos: 1 });
  });

  test('si sottoscrive di nuovo dopo una riconnessione', () => {
    client.emit('connect');
    client.emit('connect');
    expect(client.subscribe).toHaveBeenCalledTimes(2);
  });

  test('non si sottoscrive prima della connessione', () => {
    expect(client.subscribe).not.toHaveBeenCalled();
  });
});

describe('comando rientro', () => {
  test('pubblica l\'evento sul topic nfc-rilevato', () => {
    ricevi(`${TOPIC_COMANDO}rientro`);
    expect(client.publish.mock.calls[0][0]).toBe('tagliaerba/base/nfc-rilevato');
  });

  test('pubblica il payload serializzato come JSON', () => {
    ricevi(`${TOPIC_COMANDO}rientro`);
    expect(JSON.parse(client.publish.mock.calls[0][1])).toEqual({
      tag_id: '04A1B2C3',
      timestamp: '2026-11-02T10:30:00Z',
    });
  });

  test('pubblica con QoS 1 e senza retain', () => {
    ricevi(`${TOPIC_COMANDO}rientro`);
    expect(client.publish.mock.calls[0][2]).toEqual({ qos: 1, retain: false });
  });

  test('pubblica un solo messaggio', () => {
    ricevi(`${TOPIC_COMANDO}rientro`);
    expect(client.publish).toHaveBeenCalledTimes(1);
  });
});

describe('altri comandi', () => {
  test('il comando ambiente pubblica con QoS 0 e senza retain', () => {
    ricevi(`${TOPIC_COMANDO}ambiente`);
    expect(client.publish.mock.calls[0][2]).toEqual({ qos: 0, retain: false });
  });

  test('il comando partenza pubblica sul topic partenza-rilevata', () => {
    ricevi(`${TOPIC_COMANDO}partenza`);
    expect(client.publish.mock.calls[0][0]).toBe('tagliaerba/robot/partenza-rilevata');
  });
});

describe('comandi non validi', () => {
  test('un comando sconosciuto non pubblica nulla', () => {
    ricevi(`${TOPIC_COMANDO}inesistente`);
    expect(client.publish).not.toHaveBeenCalled();
  });

  test('un comando sconosciuto viene registrato nel log', () => {
    ricevi(`${TOPIC_COMANDO}inesistente`);
    expect(console.log).toHaveBeenCalledWith(
      `Comando di simulazione sconosciuto ignorato: ${TOPIC_COMANDO}inesistente`
    );
  });

  test('un messaggio fuori dal namespace simula non pubblica nulla', () => {
    ricevi('tagliaerba/gateway/cmd/restart');
    expect(client.publish).not.toHaveBeenCalled();
  });

  test('un comando retained viene ignorato', () => {
    ricevi(`${TOPIC_COMANDO}rientro`, { retain: true });
    expect(client.publish).not.toHaveBeenCalled();
  });

  test('un comando retained viene registrato nel log', () => {
    ricevi(`${TOPIC_COMANDO}rientro`, { retain: true });
    expect(console.log).toHaveBeenCalledWith(`Comando retained ignorato: ${TOPIC_COMANDO}rientro`);
  });
});