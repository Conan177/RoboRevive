// Test dell'entry point: verifica solo come le variabili d'ambiente arrivano a
// creaGateway e come il client viene collegato agli scenari (la logica è testata altrove).
jest.mock('mqtt', () => ({ connect: jest.fn() }));
jest.mock('./creaGateway', () => ({
  ...jest.requireActual('./creaGateway'),
  creaGateway: jest.fn(() => ({ client: 'client-finto' })),
}));
jest.mock('./simulazione', () => ({ collegaScenari: jest.fn() }));

const CHIAVI = ['MQTT_HOST', 'MQTT_PASS_GATEWAY', 'INTERVALLO_HEARTBEAT_S'];
const ORIGINALI = Object.fromEntries(CHIAVI.map((k) => [k, process.env[k]]));

function impostaEnv(valori) {
  CHIAVI.forEach((chiave) => {
    const valore = valori[chiave];
    if (valore === undefined) delete process.env[chiave];
    else process.env[chiave] = valore;
  });
}

// Importa gateway.js in un registro di moduli isolato e restituisce i mock di quel registro.
function avviaEntryPoint(env) {
  impostaEnv(env);
  let creaGatewayMock;
  let collegaScenariMock;
  jest.isolateModules(() => {
    creaGatewayMock = require('./creaGateway').creaGateway;
    collegaScenariMock = require('./simulazione').collegaScenari;
    require('./gateway');
  });
  return { creaGatewayMock, collegaScenariMock };
}

afterEach(() => {
  impostaEnv(ORIGINALI);
  jest.clearAllMocks();
});

describe('variabili d\'ambiente passate alla factory', () => {
  test('passa MQTT_HOST come host', () => {
    const { creaGatewayMock } = avviaEntryPoint({ MQTT_HOST: 'broker.test' });
    expect(creaGatewayMock).toHaveBeenCalledWith(expect.objectContaining({ host: 'broker.test' }));
  });

  test('passa MQTT_PASS_GATEWAY come password', () => {
    const { creaGatewayMock } = avviaEntryPoint({ MQTT_PASS_GATEWAY: 'segreta' });
    expect(creaGatewayMock).toHaveBeenCalledWith(expect.objectContaining({ password: 'segreta' }));
  });

  test('passa la libreria mqtt come mqttLib', () => {
    const { creaGatewayMock } = avviaEntryPoint({});
    expect(creaGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ mqttLib: expect.objectContaining({ connect: expect.any(Function) }) })
    );
  });

  test('crea il gateway una sola volta', () => {
    const { creaGatewayMock } = avviaEntryPoint({});
    expect(creaGatewayMock).toHaveBeenCalledTimes(1);
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
    const { creaGatewayMock } = avviaEntryPoint({ INTERVALLO_HEARTBEAT_S: valore });
    expect(creaGatewayMock).toHaveBeenCalledWith(expect.objectContaining({ intervalloS: atteso }));
  });
});

describe('collegamento degli scenari di simulazione', () => {
  test('collega gli scenari al client del gateway', () => {
    const { collegaScenariMock } = avviaEntryPoint({});
    expect(collegaScenariMock).toHaveBeenCalledWith(expect.objectContaining({ client: 'client-finto' }));
  });

  test('usa Date.now come sorgente del tempo', () => {
    const { collegaScenariMock } = avviaEntryPoint({});
    expect(collegaScenariMock).toHaveBeenCalledWith(expect.objectContaining({ ora: Date.now }));
  });

  test('usa Math.random come sorgente casuale', () => {
    const { collegaScenariMock } = avviaEntryPoint({});
    expect(collegaScenariMock).toHaveBeenCalledWith(expect.objectContaining({ casuale: Math.random }));
  });
});