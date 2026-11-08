const mqtt = require('mqtt');
const { creaGateway } = require('./creaGateway');
const { collegaScenari } = require('./simulazione');

const gateway = creaGateway({
  host: process.env.MQTT_HOST,
  password: process.env.MQTT_PASS_GATEWAY,
  intervalloS: process.env.INTERVALLO_HEARTBEAT_S,
  mqttLib: mqtt,
});

collegaScenari({ client: gateway.client, ora: Date.now, casuale: Math.random });