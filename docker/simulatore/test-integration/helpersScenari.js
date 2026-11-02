// Helper per i test di integrazione degli scenari.
// Richiede che helpers.js esporti anche connettiOsservatore (vedi istruzioni).
const { attendiEvento, connettiOsservatore } = require('./helpers');

// Il gateway si sottoscrive ai comandi alla connessione: il broker risponde con un SUBACK.
// Riceverlo significa che un comando pubblicato ora verrà consegnato al simulatore.
// Va chiamata subito dopo creaGateway(), prima che la connessione sia avvenuta.
function attendiSuback(client) {
  return attendiEvento(client, 'packetreceive', (pacchetto) => pacchetto.cmd === 'suback');
}

// Pubblica un messaggio (senza retain) come osservatore: nel broker di test può scrivere ovunque.
function pubblicaComando(broker, topic) {
  return new Promise((resolve, reject) => {
    const osservatore = connettiOsservatore(broker);
    osservatore.on('error', (errore) => {
      osservatore.end(true);
      reject(errore);
    });
    osservatore.on('connect', () => {
      osservatore.publish(topic, '', { qos: 1, retain: false }, (errore) => {
        osservatore.end(true);
        if (errore) reject(errore);
        else resolve();
      });
    });
  });
}

// Si sottoscrive come osservatore e SOLO a sottoscrizione confermata esegue `azione`
// (che deve restituire una Promise), così l'evento non può arrivare prima dell'ascolto.
// Risolve col primo messaggio ricevuto.
function attendiMessaggioDopo(broker, topic, azione, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const osservatore = connettiOsservatore(broker);
    const fallisci = (errore) => {
      clearTimeout(timer);
      osservatore.end(true);
      reject(errore);
    };
    const timer = setTimeout(
      () => fallisci(new Error(`Nessun messaggio su ${topic} entro ${timeoutMs} ms`)),
      timeoutMs
    );

    osservatore.on('error', fallisci);
    osservatore.on('connect', () => {
      osservatore.subscribe(topic, { qos: 1 }, (errore) => {
        if (errore) fallisci(errore);
        else azione().catch(fallisci);
      });
    });
    osservatore.on('message', (topicRicevuto, payload) => {
      clearTimeout(timer);
      osservatore.end(true);
      resolve({ topic: topicRicevuto, payload: payload.toString() });
    });
  });
}

// Come sopra, ma raccoglie tutti i messaggi per `durataMs` dopo l'azione
// (serve a verificare che NON arrivi nulla).
function raccogliMessaggiDopo(broker, topic, azione, durataMs) {
  return new Promise((resolve, reject) => {
    const messaggi = [];
    const osservatore = connettiOsservatore(broker);
    const fallisci = (errore) => {
      osservatore.end(true);
      reject(errore);
    };

    osservatore.on('error', fallisci);
    osservatore.on('connect', () => {
      osservatore.subscribe(topic, { qos: 1 }, (errore) => {
        if (errore) {
          fallisci(errore);
          return;
        }
        azione().then(() => {
          setTimeout(() => {
            osservatore.end(true);
            resolve(messaggi);
          }, durataMs);
        }, fallisci);
      });
    });
    osservatore.on('message', (_topic, payload) => messaggi.push(payload.toString()));
  });
}

module.exports = { attendiSuback, pubblicaComando, attendiMessaggioDopo, raccogliMessaggiDopo };