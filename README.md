# Robot Tagliaerba IoT

Sistema IoT modulare per ridare funzionalità "smart" a un robot tagliaerba con modulo Bluetooth integrato non funzionante, costruito con 3 ESP32 in architettura distribuita.

## Architettura

```
[Nodo Robot] --ESP-NOW--> [Nodo Gateway] --WiFi/MQTT--> [Mosquitto + Node-RED] --> [Dashboard]
[Nodo Base]  --ESP-NOW-->        ^
                                  |
                          [API meteo esterna] (via WiFi)
```

- **Nodo Robot** — a bordo del robot, a batteria (AA), gestisce sensori locali (microfono, eventualmente tag NFC)
- **Nodo Base** — presso la stazione di ricarica, gestisce lettore NFC e sensori ambientali
- **Nodo Gateway** — unico nodo connesso al WiFi di casa, fa da ponte tra ESP-NOW e MQTT, e interroga le API esterne (es. meteo)
- **Backend** — Mosquitto (broker MQTT) + Node-RED (logica/dashboard), in esecuzione su un vecchio smartphone Android via Termux

Comunicazione tra i nodi: **ESP-NOW** (peer-to-peer, basso consumo, non richiede router). Il Gateway fa da traduttore tra ESP-NOW e MQTT.

## Stato del progetto

| Fase | Descrizione | Stato |
|---|---|---|
| 0 | Fondamenta (backend + Gateway online) | ✅ Completa |
| 1 | Allerte meteo | ✅ Completa (via Node-RED + Open-Meteo) |
| 2 | Rilevamento rientro in base (NFC) | ⏳ Da iniziare |
| 3 | Sensori ambientali (SHT31, DS18B20) | ⏳ Da iniziare |
| 4 | Rilevamento partenza (audio + ML/FFT) | ⏳ Da iniziare |
| 5 | Stima posizione (RSSI, esplorativa) | ⏳ Da iniziare |
| 6 | Integrazione e rifinitura | ⏳ Da iniziare |

Dettagli completi di setup e note tecniche: [`docs/fase0-setup-mqtt-nodered.md`](docs/fase0-setup-mqtt-nodered.md)

## Struttura del repo

```
.
├── docs/                    # documentazione di progetto, note tecniche
├── gateway-node/            # sketch ESP32 Gateway (WiFi + MQTT bridge)
├── base-node/               # sketch ESP32 Base (NFC, sensori ambientali)
├── robot-node/               # sketch ESP32 Robot (microfono, eventuale tag NFC)
└── node-red-flows/          # export JSON dei flussi Node-RED
```

## Requisiti

**Hardware**
- 3× ESP32
- Lettore NFC PN532 + tag NFC
- Sensore SHT31 (umidità/temperatura aria)
- Sonda DS18B20 (temperatura terreno)
- Microfono MEMS (recuperato da cuffie JBL)
- Contenitori batterie AA

**Software/Backend**
- Mosquitto (broker MQTT)
- Node-RED con modulo `node-red-dashboard`
- Arduino IDE o PlatformIO
- Libreria [PubSubClient](https://github.com/knolleary/pubsubclient) per gli sketch ESP32

## Setup rapido

1. Clona il repo
2. In ogni cartella nodo (`gateway-node/`, ecc.) che ne ha bisogno, copia `secrets.h.example` in `secrets.h` e inserisci le tue credenziali WiFi/MQTT reali (il file `secrets.h` è escluso da Git, non verrà mai committato)
3. Segui `docs/fase0-setup-mqtt-nodered.md` per il setup del backend (Mosquitto + Node-RED su Termux)
4. Importa `node-red-flows/flows.json` nel tuo Node-RED (menu hamburger → Import)
5. Flasha lo sketch del Gateway sul primo ESP32

## Note

Progetto sviluppato a scopo di apprendimento pratico su fondamentali IoT (MQTT, ESP-NOW, integrazione sensori, dashboard), oltre che per risolvere un problema concreto. Ogni fase è pensata per essere funzionante e testabile in autonomia.
