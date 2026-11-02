// Collega gli scenari al client MQTT del simulatore: ascolta i comandi
// tagliaerba/gateway/cmd/simula/<scenario> e pubblica gli eventi corrispondenti.
// Esiste SOLO nel simulatore: il gateway reale riceve gli eventi dai nodi via ESP-NOW.
const { SCENARI, scenarioDaTopic } = require('./scenari');

function collegaScenari({ client, ora, casuale }) {
  // La sessione è pulita: dopo ogni (ri)connessione la sottoscrizione va rifatta.
  client.on('connect', () => {
    client.subscribe('tagliaerba/gateway/cmd/simula/#', { qos: 1 });
  });

  client.on('message', (topic, _payload, pacchetto) => {
    // Un comando retained verrebbe riconsegnato a ogni riconnessione: si ignora.
    if (pacchetto.retain) {
      console.log(`Comando retained ignorato: ${topic}`);
      return;
    }

    const nome = scenarioDaTopic(topic);
    if (nome === null) {
      console.log(`Comando di simulazione sconosciuto ignorato: ${topic}`);
      return;
    }

    SCENARI[nome]({ ora: ora(), casuale }).forEach((messaggio) => {
      client.publish(messaggio.topic, JSON.stringify(messaggio.payload), {
        qos: messaggio.qos,
        retain: messaggio.retain,
      });
    });
  });
}

module.exports = { collegaScenari };