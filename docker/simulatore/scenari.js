// Scenari simulati: funzioni PURE che descrivono i messaggi che il gateway reale
// pubblicherebbe quando riceve un evento da un nodo via ESP-NOW.
// Ora e generatore casuale arrivano dal chiamante, così i test sono deterministici.

const PREFISSO_COMANDI = 'tagliaerba/gateway/cmd/simula/';

// ISO 8601 senza millisecondi, come nello schema: 2026-11-02T10:30:00Z
function formattaTimestamp(ora) {
  return new Date(ora).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Numero in [min, max] arrotondato; `fattore` = 10 per un decimale, 100 per due.
function valoreIn(casuale, min, max, fattore) {
  return Math.round((min + casuale() * (max - min)) * fattore) / fattore;
}

function scenarioRientro({ ora }) {
  return [
    {
      topic: 'tagliaerba/base/nfc-rilevato',
      payload: { tag_id: '04A1B2C3', timestamp: formattaTimestamp(ora) },
      qos: 1,
      retain: false,
    },
  ];
}

function scenarioPartenza({ ora, casuale }) {
  return [
    {
      topic: 'tagliaerba/robot/partenza-rilevata',
      payload: {
        confidenza: valoreIn(casuale, 0.7, 0.99, 100),
        timestamp: formattaTimestamp(ora),
      },
      qos: 1,
      retain: false,
    },
  ];
}

function scenarioAmbiente({ ora, casuale }) {
  return [
    {
      topic: 'tagliaerba/base/ambiente',
      payload: {
        temp_aria: valoreIn(casuale, 10, 35, 10),
        umidita_aria: valoreIn(casuale, 30, 90, 10),
        umidita_terreno: valoreIn(casuale, 20, 80, 10),
        timestamp: formattaTimestamp(ora),
      },
      qos: 0,
      retain: false,
    },
  ];
}

const SCENARI = {
  rientro: scenarioRientro,
  partenza: scenarioPartenza,
  ambiente: scenarioAmbiente,
};

// Dal topic di un comando restituisce il nome dello scenario, oppure null.
// Object.hasOwn evita che nomi come "constructor" o "__proto__" risultino validi.
function scenarioDaTopic(topic) {
  if (!topic.startsWith(PREFISSO_COMANDI)) return null;
  const nome = topic.slice(PREFISSO_COMANDI.length);
  return Object.hasOwn(SCENARI, nome) ? nome : null;
}

module.exports = { SCENARI, scenarioDaTopic };