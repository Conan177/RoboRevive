// Logica di stato del gateway, per Node-RED. Funzioni pure: nessun timer,
// nessuna lettura dell'orologio. L'istante arriva dentro l'evento (campo `adesso`).

const INTERVALLO_INIZIALE_S = 300;
const MOLTIPLICATORE_SOGLIA = 3;
const INTERVALLO_MIN_S = 1;
const INTERVALLO_MAX_S = 300;

const TOPIC_STATUS = 'tagliaerba/gateway/status';
const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';
const TOPIC_CONTROLLO = 'controllo';

function statoIniziale() {
  return { stato: 'sconosciuto', ultimoContatto: null, intervalloS: INTERVALLO_INIZIALE_S };
}

function intervalloValido(valore) {
  return Number.isInteger(valore) && valore >= INTERVALLO_MIN_S && valore <= INTERVALLO_MAX_S;
}

function applicaStatus(attuale, evento) {
  if (evento.status === 'offline') return { ...attuale, stato: 'offline' };
  if (evento.status === 'online') {
    return { stato: 'online', ultimoContatto: evento.adesso, intervalloS: INTERVALLO_INIZIALE_S };
  }
  return attuale;
}

function applicaHeartbeat(attuale, evento) {
  if (attuale.stato === 'offline') return attuale;
  return {
    stato: 'online',
    ultimoContatto: evento.adesso,
    intervalloS: intervalloValido(evento.intervalloS) ? evento.intervalloS : attuale.intervalloS,
  };
}

function applicaControllo(attuale, evento) {
  if (attuale.stato !== 'online') return attuale;
  const sogliaMs = MOLTIPLICATORE_SOGLIA * attuale.intervalloS * 1000;
  return evento.adesso - attuale.ultimoContatto > sogliaMs
    ? { ...attuale, stato: 'sospetto' }
    : attuale;
}

function applicaEvento(attuale, evento) {
  switch (evento.tipo) {
    case 'status': return applicaStatus(attuale, evento);
    case 'heartbeat': return applicaHeartbeat(attuale, evento);
    case 'controllo': return applicaControllo(attuale, evento);
    default: return attuale;
  }
}

function provaParse(testo) {
  try {
    return JSON.parse(testo);
  } catch (errore) {
    return undefined;
  }
}

// Restituisce sempre un oggetto: qualunque payload sconosciuto diventa {}.
function comeOggetto(payload) {
  const valore = typeof payload === 'string' ? provaParse(payload) : payload;
  return valore !== null && typeof valore === 'object' ? valore : {};
}

function creaEvento(topic, payload, adesso) {
  const dati = comeOggetto(payload);
  switch (topic) {
    case TOPIC_STATUS: return { tipo: 'status', status: dati.status, adesso };
    case TOPIC_HEARTBEAT: return { tipo: 'heartbeat', intervalloS: dati.intervalloS, adesso };
    case TOPIC_CONTROLLO: return { tipo: 'controllo', adesso };
    default: return null;
  }
}

module.exports = {
  applicaEvento,
  statoIniziale,
  creaEvento,
  INTERVALLO_INIZIALE_S,
  MOLTIPLICATORE_SOGLIA
};