// Logica del simulatore del gateway, senza effetti collaterali all'import.
// Il comportamento è quello del vecchio gateway.js: cambia solo il fatto che
// la connessione parte quando si chiama creaGateway(), non al require.

function calcolaIntervalloS(valoreGrezzo) {
  return Number(valoreGrezzo) || 30;
}

function creaGateway({ host, porta = 1883, password, intervalloS, mqttLib }) {
  const client = mqttLib.connect(`mqtt://${host}:${porta}`, {
    username: 'gateway',
    password: password,
    will: {
      topic: 'tagliaerba/gateway/status',
      payload: JSON.stringify({ status: 'offline' }),
      qos: 1,
      retain: true,
    },
  });

  function pubblicaHeartbeat() {
    if (!client.connected) return;
    const uptime = Math.floor(process.uptime());
    client.publish(
      'tagliaerba/gateway/heartbeat',
      JSON.stringify({ status: 'online', uptime: uptime }),
      { qos: 0, retain: false }
    );
  }

  client.on('connect', () => {
    console.log('Connesso al broker come gateway');

    client.publish(
      'tagliaerba/gateway/status',
      JSON.stringify({ status: 'online' }),
      { qos: 1, retain: true },
      (error) => {
        if (error) console.log(error);
        else console.log('Status online pubblicato');
      }
    );

    pubblicaHeartbeat(); // un primo heartbeat subito, senza aspettare l'intervallo
  });

  // Timer creato una sola volta, fuori da 'connect'
  const timer = setInterval(pubblicaHeartbeat, intervalloS * 1000);

  client.on('error', (err) => console.error('Errore MQTT:', err.message));

  // Nuovo: usato dai test (e in futuro per una chiusura pulita)
  function stop() {
    clearInterval(timer);
    client.end();
  }

  return { client, pubblicaHeartbeat, stop };
}

module.exports = { creaGateway, calcolaIntervalloS };