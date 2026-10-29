const path = require('path');
const mqtt = require('mqtt');
const { GenericContainer, Wait } = require('testcontainers');

const UTENTE_GATEWAY = 'gateway';
const PASSWORD_GATEWAY = 'password-gateway-di-test';
const UTENTE_OSSERVATORE = 'osservatore';
const PASSWORD_OSSERVATORE = 'password-osservatore-di-test';

// Avvia un Mosquitto reale con autenticazione obbligatoria e due utenti.
// La porta 1883 del container è mappata su una porta casuale dell'host.
async function avviaBroker() {
  const comando =
    `mosquitto_passwd -b -c /tmp/passwd ${UTENTE_GATEWAY} ${PASSWORD_GATEWAY} && ` +
    `mosquitto_passwd -b /tmp/passwd ${UTENTE_OSSERVATORE} ${PASSWORD_OSSERVATORE} && ` +
    '(chown mosquitto:mosquitto /tmp/passwd 2>/dev/null || true) && ' +
    'exec mosquitto -c /mosquitto-test.conf';

  const container = await new GenericContainer('eclipse-mosquitto:2')
    .withExposedPorts(1883)
    .withCopyFilesToContainer([
      {
        source: path.join(__dirname, 'mosquitto-test.conf'),
        target: '/mosquitto-test.conf',
      },
    ])
    .withCommand(['sh', '-c', comando])
    // Si aspetta la porta, non il log: i test si collegano dall'host e il log
    // di Mosquitto compare prima che la porta mappata risponda.
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  console.log('Broker avviato:', container.getId());

  return {
    host: container.getHost(),
    porta: container.getMappedPort(1883),
    ferma: () => container.stop(),
  };
}

// Attende che un EventEmitter emetta `evento` (con filtro opzionale). Risolve col primo argomento.
function attendiEvento(emitter, evento, filtro = () => true, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off(evento, gestore);
      reject(new Error(`Evento "${evento}" non ricevuto entro ${timeoutMs} ms`));
    }, timeoutMs);

    function gestore(...argomenti) {
      if (!filtro(...argomenti)) return;
      clearTimeout(timer);
      emitter.off(evento, gestore);
      resolve(argomenti[0]);
    }
    emitter.on(evento, gestore);
  });
}

// Il gateway pubblica lo status con QoS 1: il broker risponde con un PUBACK.
// Riceverlo significa che lo status è già stato registrato dal broker.
// Va chiamata subito dopo creaGateway(), prima che la connessione sia avvenuta.
function attendiPuback(client) {
  return attendiEvento(client, 'packetreceive', (pacchetto) => pacchetto.cmd === 'puback');
}

function connettiOsservatore({ host, porta }) {
  return mqtt.connect(`mqtt://${host}:${porta}`, {
    username: UTENTE_OSSERVATORE,
    password: PASSWORD_OSSERVATORE,
    reconnectPeriod: 0,
  });
}

// Si connette come osservatore, si sottoscrive a `topic` e risolve col primo messaggio
// che soddisfa `predicato`. Il campo `retain` è true solo se il broker lo consegna
// come messaggio retained (cioè pubblicato prima della sottoscrizione).
function attendiMessaggio(broker, topic, { predicato = () => true, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const osservatore = connettiOsservatore(broker);
    const timer = setTimeout(() => {
      osservatore.end(true);
      reject(new Error(`Nessun messaggio utile su ${topic} entro ${timeoutMs} ms`));
    }, timeoutMs);

    osservatore.on('error', (errore) => {
      clearTimeout(timer);
      osservatore.end(true);
      reject(errore);
    });
    osservatore.on('connect', () => osservatore.subscribe(topic, { qos: 1 }));
    osservatore.on('message', (topicRicevuto, payload, pacchetto) => {
      const messaggio = {
        topic: topicRicevuto,
        payload: payload.toString(),
        retain: pacchetto.retain,
      };
      if (!predicato(messaggio)) return;
      clearTimeout(timer);
      osservatore.end(true);
      resolve(messaggio);
    });
  });
}

// Raccoglie tutti i messaggi su `topic` per `durataMs` (serve a verificare che NON arrivi nulla).
function raccogliMessaggi(broker, topic, durataMs) {
  return new Promise((resolve, reject) => {
    const messaggi = [];
    const osservatore = connettiOsservatore(broker);

    osservatore.on('error', (errore) => {
      osservatore.end(true);
      reject(errore);
    });
    osservatore.on('connect', () => osservatore.subscribe(topic, { qos: 1 }));
    osservatore.on('message', (_topic, payload) => messaggi.push(payload.toString()));

    setTimeout(() => {
      osservatore.end(true);
      resolve(messaggi);
    }, durataMs);
  });
}

module.exports = {
  PASSWORD_GATEWAY,
  avviaBroker,
  attendiEvento,
  attendiPuback,
  attendiMessaggio,
  raccogliMessaggi,
};