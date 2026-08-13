#include <WiFi.h>
#include <PubSubClient.h>
#include "secrets.h"

const char* ssid = WIFI_SSID ;
const char* password = WIFI_PASSWORD;

// MQTT Broker
const char *mqtt_broker = MQTT_BROKER;
const char *topic = "tagliaerba/gateway/heartbeat";
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

void setup(){
    Serial.begin(115200);
    delay(1000);

    WiFi.mode(WIFI_STA); //Optional
    WiFi.begin(ssid, password);
    Serial.println("\nConnecting");

    while(WiFi.status() != WL_CONNECTED){
        Serial.print(".");
        delay(100);
    }

    Serial.println("\nConnected to the WiFi network");
    Serial.print("Local ESP32 IP: ");
    Serial.println(WiFi.localIP());

    client.setServer(mqtt_broker, mqtt_port);
    client.setCallback(callback);
    while (!client.connected()) {
        String client_id = "esp32-gateway-";
        client_id += String(WiFi.macAddress());
        Serial.printf("The gateway %s connects to the public MQTT broker\n", client_id.c_str());
        if (client.connect(client_id.c_str())) {
            Serial.println("Public EMQX MQTT broker connected");
        } else {
            Serial.print("failed with state ");
            Serial.print(client.state());
            delay(2000);
        }
    }
}

void callback(char* topic, byte* payload, unsigned int length) {
    // per ora non serve fare nulla qui, il Gateway riceve comandi più avanti nel progetto
}


void reconnect() {
    while (!client.connected()) {
        String client_id = "esp32-gateway-";
        client_id += String(WiFi.macAddress());
        Serial.print("Tentativo di connessione MQTT...");
        if (client.connect(client_id.c_str())) {
            Serial.println("connesso");
        } else {
            Serial.print("fallito, stato=");
            Serial.print(client.state());
            Serial.println(" riprovo tra 5 secondi");
            delay(5000);
        }
    }
}

unsigned long ultimoInvio = 0;
const unsigned long intervalloHeartbeat = 30000; // 30 secondi, modificabile



void loop(){
    // Mantiene viva la connessione MQTT (va richiamato di continuo)
    if (!client.connected()) {
        reconnect();  // vedi sotto
    }
    client.loop();

    unsigned long adesso = millis();
    if (adesso - ultimoInvio >= intervalloHeartbeat) {
        ultimoInvio = adesso;

        // Costruzione JSON semplice a mano
        String payload = "{\"status\":\"online\",\"uptime\":" + String(adesso / 1000) + "}";

        client.publish(topic, payload.c_str());
        Serial.print("Heartbeat inviato: ");
        Serial.println(payload);
    }
}
