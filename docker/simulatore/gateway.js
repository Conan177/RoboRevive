const mqtt = require('mqtt');
const { creaGateway, calcolaIntervalloS } = require('./creaGateway');

creaGateway({
  host: process.env.MQTT_HOST,
  password: process.env.MQTT_PASS_GATEWAY,
  intervalloS: calcolaIntervalloS(process.env.INTERVALLO_HEARTBEAT_S),
  mqttLib: mqtt,
});