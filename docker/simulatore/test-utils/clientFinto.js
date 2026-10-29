const { EventEmitter } = require('events');

// Client MQTT finto: un EventEmitter vero, così i test possono emettere
// a mano gli eventi 'connect' ed 'error' come farebbe la libreria mqtt.
function creaClientFinto() {
  const client = new EventEmitter();
  client.connected = false;
  client.publish = jest.fn();
  client.end = jest.fn();
  return client;
}

// Restituisce il client finto e una "libreria mqtt" finta che lo restituisce da connect().
function creaMqttFinto() {
  const client = creaClientFinto();
  return { client, mqttLib: { connect: jest.fn(() => client) } };
}

module.exports = { creaClientFinto, creaMqttFinto };