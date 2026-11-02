const mqtt = require('mqtt');
const { creaGateway } = require('../creaGateway');
const { collegaScenari } = require('../simulazione');
const { PASSWORD_GATEWAY, avviaBroker, raccogliMessaggi } = require('./helpers');
const {
  attendiSuback,
  pubblicaComando,
  attendiMessaggioDopo,
  raccogliMessaggiDopo,
} = require('./helpersScenari');

const CMD = 'tagliaerba/gateway/cmd/simula/';

let broker;
let gateway;

// Gateway + scenari collegati al broker di test; restituisce quando il gateway
// ha confermato la sottoscrizione ai comandi.
async function avviaSimulatore() {
  gateway = creaGateway({
    host: broker.host,
    porta: broker.porta,
    password: PASSWORD_GATEWAY,
    intervalloS: 30,
    mqttLib: mqtt,
  });
  const sottoscrizione = attendiSuback(gateway.client);
  collegaScenari({ client: gateway.client, ora: Date.now, casuale: Math.random });
  await sottoscrizione;
}

const inviaComando = (scenario) => () => pubblicaComando(broker, `${CMD}${scenario}`);

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

describe('comandi di simulazione', () => {
  test('il comando rientro produce l\'evento nfc-rilevato con il tag simulato', async () => {
    await avviaSimulatore();
    const evento = await attendiMessaggioDopo(broker, 'tagliaerba/base/nfc-rilevato', inviaComando('rientro'));
    expect(JSON.parse(evento.payload).tag_id).toBe('04A1B2C3');
  });

  test('l\'evento di rientro non è retained: chi si sottoscrive dopo non lo riceve', async () => {
    await avviaSimulatore();
    await attendiMessaggioDopo(broker, 'tagliaerba/base/nfc-rilevato', inviaComando('rientro'));
    const messaggi = await raccogliMessaggi(broker, 'tagliaerba/base/nfc-rilevato', 1500);
    expect(messaggi).toEqual([]);
  });

  test('il comando ambiente produce umidita_terreno numerica', async () => {
    await avviaSimulatore();
    const evento = await attendiMessaggioDopo(broker, 'tagliaerba/base/ambiente', inviaComando('ambiente'));
    expect(typeof JSON.parse(evento.payload).umidita_terreno).toBe('number');
  });

  test('il comando partenza produce una confidenza numerica', async () => {
    await avviaSimulatore();
    const evento = await attendiMessaggioDopo(broker, 'tagliaerba/robot/partenza-rilevata', inviaComando('partenza'));
    expect(typeof JSON.parse(evento.payload).confidenza).toBe('number');
  });

  test('un comando sconosciuto non produce nessun evento del nodo base', async () => {
    await avviaSimulatore();
    const messaggi = await raccogliMessaggiDopo(broker, 'tagliaerba/base/+', inviaComando('inesistente'), 1500);
    expect(messaggi).toEqual([]);
  });
});