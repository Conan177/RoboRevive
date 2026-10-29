const { creaGateway } = require('./creaGateway');
const { creaMqttFinto } = require('./test-utils/clientFinto');

// Valori scritti in chiaro di proposito: i test verificano il contratto MQTT,
// non devono dipendere da costanti del sorgente.
const HOST = 'broker.test';
const PASSWORD = 'password-di-prova';
const TOPIC_STATUS = 'tagliaerba/gateway/status';
const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';

let mqttFinto;
let gateway;

function avviaGateway(opzioni = {}) {
  mqttFinto = creaMqttFinto();
  gateway = creaGateway({
    host: HOST,
    password: PASSWORD,
    intervalloS: 30,
    mqttLib: mqttFinto.mqttLib,
    ...opzioni,
  });
  return gateway;
}

const client = () => mqttFinto.client;
const opzioniConnect = () => mqttFinto.mqttLib.connect.mock.calls[0][1];
const pubblicazioniSu = (topic) =>
  client().publish.mock.calls.filter(([t]) => t === topic);

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (gateway) gateway.stop();
  gateway = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('configurazione della connessione', () => {
  test('si connette all\'URL mqtt://<host>:1883', () => {
    avviaGateway();
    expect(mqttFinto.mqttLib.connect.mock.calls[0][0]).toBe('mqtt://broker.test:1883');
  });

  test('usa la porta indicata quando viene passata', () => {
    avviaGateway({ porta: 4321 });
    expect(mqttFinto.mqttLib.connect.mock.calls[0][0]).toBe('mqtt://broker.test:4321');
  });

  test('usa lo username gateway', () => {
    avviaGateway();
    expect(opzioniConnect().username).toBe('gateway');
  });

  test('usa la password ricevuta', () => {
    avviaGateway();
    expect(opzioniConnect().password).toBe(PASSWORD);
  });

  test('il Last Will è sul topic tagliaerba/gateway/status', () => {
    avviaGateway();
    expect(opzioniConnect().will.topic).toBe(TOPIC_STATUS);
  });

  test('il Last Will ha payload {"status":"offline"}', () => {
    avviaGateway();
    expect(opzioniConnect().will.payload).toBe('{"status":"offline"}');
  });

  test('il Last Will ha QoS 1', () => {
    avviaGateway();
    expect(opzioniConnect().will.qos).toBe(1);
  });

  test('il Last Will è retained', () => {
    avviaGateway();
    expect(opzioniConnect().will.retain).toBe(true);
  });
});

describe('periodo del timer di heartbeat', () => {
  test('imposta il timer a intervalloS secondi espressi in millisecondi', () => {
    const spy = jest.spyOn(global, 'setInterval');
    avviaGateway({ intervalloS: 10 });
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 10000);
  });

  // Documenta il comportamento attuale: nessuna validazione dell'intervallo.
  // Un delay negativo viene poi trattato da Node come 1 ms (heartbeat continui):
  // possibile bug, vedi report. Il timer finto non viene fatto avanzare di proposito.
  test('passa a setInterval un delay negativo se intervalloS è negativo', () => {
    const spy = jest.spyOn(global, 'setInterval').mockImplementation(() => 0);
    avviaGateway({ intervalloS: -5 });
    expect(spy).toHaveBeenCalledWith(expect.any(Function), -5000);
  });
});

describe('evento connect', () => {
  test('pubblica lo status sul topic tagliaerba/gateway/status', () => {
    avviaGateway();
    client().emit('connect');
    expect(pubblicazioniSu(TOPIC_STATUS)).toHaveLength(1);
  });

  test('pubblica lo status con payload {"status":"online"}', () => {
    avviaGateway();
    client().emit('connect');
    expect(pubblicazioniSu(TOPIC_STATUS)[0][1]).toBe('{"status":"online"}');
  });

  test('pubblica lo status con QoS 1 e retain true', () => {
    avviaGateway();
    client().emit('connect');
    expect(pubblicazioniSu(TOPIC_STATUS)[0][2]).toEqual({ qos: 1, retain: true });
  });

  test('pubblica subito un primo heartbeat senza attendere l\'intervallo', () => {
    avviaGateway();
    client().connected = true;
    client().emit('connect');
    expect(pubblicazioniSu(TOPIC_HEARTBEAT)).toHaveLength(1);
  });

  test('logga "Connesso al broker come gateway"', () => {
    avviaGateway();
    client().emit('connect');
    expect(console.log).toHaveBeenCalledWith('Connesso al broker come gateway');
  });

  test('logga "Status online pubblicato" se la publish dello status riesce', () => {
    avviaGateway();
    client().emit('connect');
    pubblicazioniSu(TOPIC_STATUS)[0][3](null);
    expect(console.log).toHaveBeenCalledWith('Status online pubblicato');
  });

  test('logga l\'errore se la publish dello status fallisce', () => {
    avviaGateway();
    const errore = new Error('publish fallita');
    client().emit('connect');
    pubblicazioniSu(TOPIC_STATUS)[0][3](errore);
    expect(console.log).toHaveBeenCalledWith(errore);
  });

  test('non logga "Status online pubblicato" se la publish dello status fallisce', () => {
    avviaGateway();
    client().emit('connect');
    pubblicazioniSu(TOPIC_STATUS)[0][3](new Error('publish fallita'));
    expect(console.log).not.toHaveBeenCalledWith('Status online pubblicato');
  });

  test('non crea un secondo timer se connect viene emesso più volte', () => {
    avviaGateway({ intervalloS: 30 });
    client().connected = true;
    client().emit('connect');
    client().emit('connect');
    client().publish.mockClear();
    jest.advanceTimersByTime(30000);
    expect(pubblicazioniSu(TOPIC_HEARTBEAT)).toHaveLength(1);
  });
});

describe('pubblicaHeartbeat', () => {
  test('pubblica sul topic tagliaerba/gateway/heartbeat', () => {
    avviaGateway();
    client().connected = true;
    gateway.pubblicaHeartbeat();
    expect(client().publish.mock.calls[0][0]).toBe(TOPIC_HEARTBEAT);
  });

  test('pubblica con QoS 0', () => {
    avviaGateway();
    client().connected = true;
    gateway.pubblicaHeartbeat();
    expect(client().publish.mock.calls[0][2].qos).toBe(0);
  });

  test('pubblica con retain false', () => {
    avviaGateway();
    client().connected = true;
    gateway.pubblicaHeartbeat();
    expect(client().publish.mock.calls[0][2].retain).toBe(false);
  });

  test('il payload è JSON valido', () => {
    avviaGateway();
    client().connected = true;
    gateway.pubblicaHeartbeat();
    expect(() => JSON.parse(client().publish.mock.calls[0][1])).not.toThrow();
  });

  test('pubblica l\'heartbeat con status online', () => {
    avviaGateway();
    client().connected = true;
    gateway.pubblicaHeartbeat();
    expect(JSON.parse(client().publish.mock.calls[0][1]).status).toBe('online');
  });

  test('arrotonda per difetto l\'uptime (123.9 diventa 123)', () => {
    jest.spyOn(process, 'uptime').mockReturnValue(123.9);
    avviaGateway();
    client().connected = true;
    gateway.pubblicaHeartbeat();
    expect(JSON.parse(client().publish.mock.calls[0][1]).uptime).toBe(123);
  });

  test('non pubblica nulla se il client non è connesso', () => {
    avviaGateway();
    client().connected = false;
    gateway.pubblicaHeartbeat();
    expect(client().publish).not.toHaveBeenCalled();
  });

  test('dopo 3 intervalli vengono eseguite 3 pubblicazioni', () => {
    avviaGateway({ intervalloS: 10 });
    client().connected = true;
    jest.advanceTimersByTime(30000);
    expect(pubblicazioniSu(TOPIC_HEARTBEAT)).toHaveLength(3);
  });

  test('non pubblica prima dello scadere dell\'intervallo', () => {
    avviaGateway({ intervalloS: 10 });
    client().connected = true;
    jest.advanceTimersByTime(9999);
    expect(pubblicazioniSu(TOPIC_HEARTBEAT)).toHaveLength(0);
  });

  test('pubblica allo scadere esatto dell\'intervallo', () => {
    avviaGateway({ intervalloS: 10 });
    client().connected = true;
    jest.advanceTimersByTime(10000);
    expect(pubblicazioniSu(TOPIC_HEARTBEAT)).toHaveLength(1);
  });
});

describe('evento error', () => {
  test('logga l\'errore con console.error e il prefisso "Errore MQTT:"', () => {
    avviaGateway();
    client().emit('error', new Error('connessione rifiutata'));
    expect(console.error).toHaveBeenCalledWith('Errore MQTT:', 'connessione rifiutata');
  });

  test('non lancia eccezioni quando riceve un errore', () => {
    avviaGateway();
    expect(() => client().emit('error', new Error('qualunque'))).not.toThrow();
  });
});

describe('stop', () => {
  test('dopo stop il timer non pubblica più heartbeat', () => {
    avviaGateway({ intervalloS: 10 });
    client().connected = true;
    gateway.stop();
    jest.advanceTimersByTime(30000);
    expect(pubblicazioniSu(TOPIC_HEARTBEAT)).toHaveLength(0);
  });

  test('stop chiude la connessione del client', () => {
    avviaGateway();
    gateway.stop();
    expect(client().end).toHaveBeenCalledTimes(1);
  });
});