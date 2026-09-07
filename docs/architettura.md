# Architettura — RoboRevive

## Panoramica

RoboRevive è un sistema IoT che ripristina funzionalità "smart" su un robot
tagliaerba il cui Bluetooth integrato non è funzionante. Il sistema è
costruito come layer parallelo/modulare, indipendente dall'elettronica
originale del robot, basato su 3 nodi ESP32 in comunicazione distribuita.

## Nodi

### Nodo Robot
- Posizione: a bordo del robot tagliaerba
- Alimentazione: a batteria (AA)
- Sensori: microfono MEMS (recuperato da diffusori JBL), in futuro possibile tag NFC
- Responsabilità: rilevamento partenza/lavoro tramite analisi audio (Fase 4), stima posizione via RSSI (Fase 5, esplorativa)

### Nodo Base
- Posizione: presso la stazione di ricarica
- Alimentazione: da rete (stazionario)
- Sensori: lettore NFC, sensore umidità/temperatura aria (SHT31), sonda temperatura terreno (DS18B20)
- Responsabilità: rilevamento rientro/aggancio alla base (Fase 2), raccolta dati ambientali (Fase 3)

### Nodo Gateway
- Posizione: fissa, in casa, con accesso al WiFi domestico
- Responsabilità: unico punto di contatto tra la rete locale ESP-NOW e il mondo esterno (MQTT, API meteo); inoltra i dati ricevuti dagli altri due nodi verso il broker MQTT; pubblica il proprio heartbeat periodico
- Stato: implementato (Fase 0) — sketch con WiFi + MQTT + heartbeat, riconnessione automatica gestita

## Comunicazione tra nodi

- **Robot/Base → Gateway**: ESP-NOW (peer-to-peer, basso consumo, non richiede router dedicato tra i nodi)
- **Gateway → Backend**: MQTT, verso broker Mosquitto

```
[Nodo Robot]  --ESP-NOW-->  [Nodo Gateway]  --MQTT-->  [Mosquitto]
[Nodo Base]   --ESP-NOW-->        |                        |
                                    |                        v
                          (accesso WiFi/API              [Node-RED]
                           meteo esterne)                     |
                                                    +----------+----------+
                                                    |                     |
                                          [logica/*.js — moduli      [Dashboard]
                                           testati, richiamati
                                           dai function node]
```

## Perché questa architettura

- **ESP-NOW invece di WiFi diretto su ogni nodo**: basso consumo (importante per il Nodo Robot a batteria), non richiede che ogni nodo sia dentro il raggio del router di casa, solo il Gateway deve esserlo
- **Un solo nodo (Gateway) con accesso a MQTT/internet**: riduce la superficie di configurazione WiFi sui nodi a batteria, centralizza il punto di integrazione con servizi esterni (es. API meteo)
- **Logica di business estratta in moduli JS separati da Node-RED** (cartella `logica/`): permette di scrivere test automatici (unità, property-based) e misurare code coverage su codice che altrimenti vivrebbe solo dentro i function node, difficile da testare in isolamento

## Deployment

Il sistema ha due deployment paralleli, con scopi diversi:

### Deployment reale (uso quotidiano)
- Host: vecchio smartphone Android con Termux, sempre in carica, IP riservato sul router
- Mosquitto e Node-RED girano nativamente su Termux, gestiti come servizi persistenti tramite `runit`
- Gestione remota via SSH da PC

### Deployment di valutazione (esame)
- Stesso stack (Mosquitto + Node-RED) containerizzato tramite `docker-compose`, in `docker/`
- Usa gli stessi moduli di `logica/` del deployment reale — nessuna duplicazione di codice tra i due ambienti
- Pensato per permettere a chi valuta il progetto di avviare l'intero sistema software con un comando, senza bisogno del telefono fisico o degli ESP32 reali (il firmware resta testabile solo su hardware, per sua natura — vedi nota sotto)

> Nota: il firmware dei tre nodi ESP32 non è incluso nel deployment containerizzato — per un progetto IoT è normale e atteso che il codice embedded non sia containerizzato/testato con gli stessi strumenti del backend software.

## Stato di avanzamento

| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Fondamenta — Gateway heartbeat, Mosquitto+Node-RED su Termux | Completata |
| 1 | Allerte meteo (Open-Meteo, solo software) | Completata; logica estratta in `logica/allerta-meteo.js`, testata (unit + property-based) |
| 2 | Rilevamento rientro in base (NFC) | Da iniziare |
| 3 | Sensori ambientali | Da iniziare |
| 4 | Rilevamento partenza (audio + FFT/TinyML) | Da iniziare |
| 5 | Stima posizione (RSSI, esplorativa) | Da iniziare |
| 6 | Integrazione e rifinitura | Da iniziare |