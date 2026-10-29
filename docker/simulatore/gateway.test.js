// Test dell'entry point: verifica solo come le variabili d'ambiente
// arrivano a creaGateway (la logica è testata in creaGateway.test.js).
jest.mock('mqtt', () => ({ connect: jest.fn() }));
jest.mock('./creaGateway', () => ({
  ...jest.requireActual('./creaGateway'),
  creaGateway: jest.fn(),
}));

const CHIAVI = ['MQTT_HOST', 'MQTT_PASS_GATEWAY', 'INTERVALLO_HEARTBEAT_S'];
const ORIGINALI = Object.fromEntries(CHIAVI.map((k) => [k, process.env[k]]));

function impostaEnv(valori) {
  CHIAVI.forEach((chiave) => {
    const valore = valori[chiave];
    if (valore === undefined) delete process.env[chiave];
    else process.env[chiave] = valore;
  });
}

// Importa gateway.js in un registro di moduli isolato e restituisce
// il mock di creaGateway di quel registro.
function avviaEntryPoint(env) {
  impostaEnv(env);
  let creaGatewayMock;
  jest.isolateModules(() => {
    creaGatewayMock = require('./creaGateway').creaGateway;
    require('./gateway');
  });
  return creaGatewayMock;
}

afterEach(() => {
  impostaEnv(ORIGINALI);
  jest.clearAllMocks();
});

describe('variabili d\'ambiente passate alla factory', () => {
  test('passa MQTT_HOST come host', () => {
    const mock = avviaEntryPoint({ MQTT_HOST: 'broker.test' });
    expect(mock).toHaveBeenCalledWith(expect.objectContaining({ host: 'broker.test' }));
  });

  test('passa MQTT_PASS_GATEWAY come password', () => {
    const mock = avviaEntryPoint({ MQTT_PASS_GATEWAY: 'segreta' });
    expect(mock).toHaveBeenCalledWith(expect.objectContaining({ password: 'segreta' }));
  });

  test('passa la libreria mqtt come mqttLib', () => {
    const mock = avviaEntryPoint({});
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ mqttLib: expect.objectContaining({ connect: expect.any(Function) }) })
    );
  });

  test('crea il gateway una sola volta', () => {
    const mock = avviaEntryPoint({});
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe('intervallo di heartbeat da INTERVALLO_HEARTBEAT_S', () => {
  test.each([
    ['variabile assente: usa 30 s', undefined, 30],
    ['valore valido "10": usa 10 s', '10', 10],
    ['valore non numerico "abc": usa 30 s', 'abc', 30],
    // Il numero 0 è falsy, quindi `Number('0') || 30` ricade sul default: comportamento attuale.
    ['valore "0": usa 30 s (0 è falsy)', '0', 30],
    // Comportamento attuale, probabile bug: nessun controllo sul segno (vedi report).
    ['valore negativo "-5": usa -5 s senza validazione', '-5', -5],
  ])('%s', (_nome, valore, atteso) => {
    const mock = avviaEntryPoint({ INTERVALLO_HEARTBEAT_S: valore });
    expect(mock).toHaveBeenCalledWith(expect.objectContaining({ intervalloS: atteso }));
  });
});