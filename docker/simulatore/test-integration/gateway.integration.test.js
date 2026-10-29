const mqtt = require('mqtt');
const { creaGateway } = require('../creaGateway');
const {
  PASSWORD_GATEWAY,
  avviaBroker,
  attendiEvento,
  attendiPuback,
  attendiMessaggio,
  raccogliMessaggi,
} = require('./helpers');

const TOPIC_STATUS = 'tagliaerba/gateway/status';
const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';

let broker;
let gateway;

// Gateway reale (libreria mqtt vera) collegato al broker di test.
function avviaGateway(opzioni = {}) {
  gateway = creaGateway({
    host: broker.host,
    porta: broker.porta,
    password: PASSWORD_GATEWAY,
    intervalloS: 1,
    mqttLib: mqtt,
    ...opzioni,
  });
  return gateway;
}

// Chiude la connessione TCP senza inviare DISCONNECT: è ciò che fa un gateway
// che perde la rete o si blocca. Si disattiva la riconnessione automatica, altrimenti
// mqtt.js si riconnetterebbe e ripubblicherebbe "online" sopra il Last Will.
function disconnettiBruscamente(client) {
  client.options.reconnectPeriod = 0;
  client.stream.destroy();
}

const statoDa = (messaggio) => JSON.parse(messaggio.payload).status;

// Un broker nuovo per ogni test: nessun messaggio retained rimasto da test precedenti,
// quindi i test non dipendono dall'ordine di esecuzione.
beforeEach(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  gateway = null;
  broker = await avviaBroker();
}, 120000);

afterEach(async () => {
  if (gateway) gateway.stop();
  await broker.ferma();
  jest.restoreAllMocks();
}, 60000);

describe('connessione autenticata', () => {
  test('con la password corretta il sottoscrittore riceve lo status online', async () => {
    avviaGateway();
    const messaggio = await attendiMessaggio(broker, TOPIC_STATUS);
    expect(statoDa(messaggio)).toBe('online');
  });
});

describe('password errata', () => {
  test('la connessione viene rifiutata con un errore di autorizzazione', async () => {
    avviaGateway({ password: 'password-sbagliata' });
    const errore = await attendiEvento(gateway.client, 'error');
    expect(errore.message).toMatch(/not authorized/i);
  });

  test('non viene pubblicato nessuno status', async () => {
    avviaGateway({ password: 'password-sbagliata' });
    await attendiEvento(gateway.client, 'error');
    gateway.stop();
    const messaggi = await raccogliMessaggi(broker, TOPIC_STATUS, 1500);
    expect(messaggi).toEqual([]);
  });
});

describe('heartbeat reale', () => {
  test('un sottoscrittore riceve un heartbeat con status online', async () => {
    avviaGateway({ intervalloS: 1 });
    const messaggio = await attendiMessaggio(broker, TOPIC_HEARTBEAT, { timeoutMs: 8000 });
    expect(statoDa(messaggio)).toBe('online');
  });

  test('l\'heartbeat non è retained', async () => {
    avviaGateway({ intervalloS: 1 });
    const messaggio = await attendiMessaggio(broker, TOPIC_HEARTBEAT, { timeoutMs: 8000 });
    expect(messaggio.retain).toBe(false);
  });
});

describe('Last Will', () => {
  test('dopo una disconnessione non pulita il broker pubblica lo status offline', async () => {
    avviaGateway();
    await attendiPuback(gateway.client);
    disconnettiBruscamente(gateway.client);
    const messaggio = await attendiMessaggio(broker, TOPIC_STATUS, {
      predicato: (m) => statoDa(m) === 'offline',
    });
    expect(statoDa(messaggio)).toBe('offline');
  });

  test('lo status offline del Last Will resta retained per chi si sottoscrive dopo', async () => {
    avviaGateway();
    await attendiPuback(gateway.client);
    disconnettiBruscamente(gateway.client);
    await attendiMessaggio(broker, TOPIC_STATUS, { predicato: (m) => statoDa(m) === 'offline' });
    const successivo = await attendiMessaggio(broker, TOPIC_STATUS);
    expect(successivo).toMatchObject({ payload: '{"status":"offline"}', retain: true });
  });
});

describe('messaggi retained', () => {
  test('chi si sottoscrive dopo la pubblicazione riceve comunque l\'ultimo status', async () => {
    avviaGateway();
    await attendiPuback(gateway.client);
    const messaggio = await attendiMessaggio(broker, TOPIC_STATUS);
    expect(messaggio).toMatchObject({ payload: '{"status":"online"}', retain: true });
  });
});