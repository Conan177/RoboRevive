# RoboRevive

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
- **Nodo Gateway** — unico nodo connesso al WiFi di casa, fa da ponte tra ESP-NOW e MQTT
- **Backend** — Mosquitto (broker MQTT) + Node-RED (logica/dashboard), in esecuzione su un vecchio smartphone Android via Termux, raggiungibile con WireGuard e DuckDNS.
- **Deployment di valutazione** — gli stessi servizi in container Docker (docker/), con un simulatore del gateway al posto del firmware, che non è ancora implementato.

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

Stato: il simulatore e la logica di Node-RED sono implementati e testati; il firmware del gateway reale e la stima della posizione (RSSI) sono fuori dal perimetro del progetto d'esame. Il contratto che il firmware dovrà rispettare è in docs/mqtt-schema.md.

## Struttura del repo

```
.
├── docs/                    # documentazione di progetto, note tecniche
├── gateway-node/            # sketch ESP32 Gateway (WiFi + MQTT bridge)
├── node-red-flows/          # export JSON dei flussi Node-RED
├── docker/                  # Mosquitto, Node-RED e simulatore del gateway (deployment di valutazione)
├── logica/                  # logica di Node-RED testata (allerta meteo, stato del gateway)
├── .github/workflows/       # pipeline CI/CD
├── termux-config/

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

## Avvio con Docker

Requisiti: Docker con il comando `docker compose`.

1. Crea il file `docker/.env` partendo dall'esempio e scegli tre password:

   ```bash
   cp docker/.env.example docker/.env
   ```

   Mosquitto crea gli utenti `gateway`, `nodered` e `admin` a ogni avvio, con queste password (non serve nessun comando `mosquitto_passwd` a mano). Evita virgolette, `$`, apici inversi e backslash nelle password: il comando di avvio le passa a una shell.
2. Alla prima esecuzione, configura le credenziali di Node-RED:
   - apri http://localhost:1880;
   - menu in alto a destra → *Configuration nodes* → apri la configurazione del broker `roborevive-mosquitto`;
   - nella scheda *Security* inserisci utente `nodered` e la password `MQTT_PASS_NODERED` scelta nel file `.env`;
   - *Update*, poi *Deploy*. I nodi MQTT passano da "connecting" a "connected".
3. Dalla cartella docker/:
```
# Avvio completo, costruendo le immagini locali
docker compose up -d --build

# Solo il simulatore, dall'immagine pubblicata dalla pipeline
docker compose pull simulatore
docker compose up -d --no-build simulatore

# Un'altra versione dell'immagine del simulatore
SIMULATORE_VERSIONE=1.0.0 docker compose up -d --no-build simulatore
```

La dashboard di Node-RED è raggiungibile sulla porta indicata in docker-compose.yml (`http://localhost:1880/ui`). Il simulatore pubblica heartbeat e stato del gateway; i pulsanti della dashboard inviano i comandi di simulazione (rientro, partenza, ambiente).

L'immagine del simulatore è pubblica: ghcr.io/conan177/roborevive-simulatore.

## Test
```
# Logica di Node-RED (unit e property-based)
cd logica && npm ci && npm run test:coverage

# Simulatore del gateway (unit e property-based)
cd docker/simulatore && npm ci && npm run test:coverage

# Integrazione contro un Mosquitto reale (richiede Docker e Node 22)
cd docker/simulatore && npm run test:integration

# Smoke test dell'immagine
cd docker/simulatore && bash smoke-test.sh
```

Strumenti: Jest, fast-check (property-based testing), testcontainers. Convenzioni dei test: un'asserzione per test, nessuna asserzione in try o if, nomi in italiano, orologio simulato con fake timers, coverage al 100% con condizioni verificate sui rami composti (&&, ||, ??).

## CI/CD

La pipeline (`.github/workflows/ci.yml`) parte a ogni push su `main`, a ogni pull request e a ogni tag vX.Y.Z:

  1. `test-logica`, `test-simulatore`: test unitari e di proprietà con coverage.
  2. `test-integrazione-simulatore`: test contro un Mosquitto reale.
  3. `smoke-test-simulatore`: costruisce l'immagine e verifica che il gateway parta e pubblichi.
  4. `pubblica-immagine` (solo se i quattro job precedenti passano, su `main` o su un tag): costruisce e pubblica l'immagine del simulatore su GitHub Container Registry. Su `main` aggiorna latest; su un tag `v1.0.0` pubblica la versione `1.0.0`. Ogni immagine ha anche il tag con lo SHA del commit.

## Versioni

Numerazione Semantic Versioning (`MAJOR.MINOR.PATCH`). Per rilasciare una versione:

```
git tag -a v1.0.1 -m "Descrizione della versione"
git push origin v1.0.1
```

## Setup rapido

1. Clona il repo
2. In ogni cartella nodo (`gateway-node/`, ecc.) che ne ha bisogno, copia `secrets.h.example` in `secrets.h` e inserisci le tue credenziali WiFi/MQTT reali (il file `secrets.h` è escluso da Git, non verrà mai committato)
3. Segui `docs/fase0-setup-mqtt-nodered.md` per il setup del backend (Mosquitto + Node-RED su Termux)
4. Importa `node-red-flows/flows.json` nel tuo Node-RED (menu hamburger → Import)
5. Flasha lo sketch del Gateway sul primo ESP32

## Documentazione
- `docs/mqtt-schema.md`: topic, payload, QoS, retain, Last Will, ACL e stato del gateway.

## Note

Progetto sviluppato a scopo di apprendimento pratico su fondamentali IoT (MQTT, ESP-NOW, integrazione sensori, dashboard), oltre che per risolvere un problema concreto. Ogni fase è pensata per essere funzionante e testabile in autonomia.
