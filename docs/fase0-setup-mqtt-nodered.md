# Fase 0 — Setup Backend (Mosquitto + Node-RED su Termux)

## Architettura scelta

Host: **vecchio smartphone Android con Termux**, sempre in carica, IP riservato sul router.

- **Mosquitto** — broker MQTT (porta 1883), riceve/inoltra i messaggi da tutti i nodi ESP32
- **Node-RED** — dashboard/logica (porta 1880), si iscrive ai topic MQTT e visualizza i dati
- **SSH** (porta 8022) — per gestire il telefono comodamente da PC invece che digitare sullo schermo

Tutti i servizi sono gestiti da **runit** (via `termux-services`), così ripartono da soli se Termux si chiude o il telefono va in standby.

---

## Configurazione di rete necessaria

- **IP riservato** sul router per il telefono (DHCP reservation sul MAC address) → nel nostro caso: `192.168.1.80`
- Verificato che **non c'è isolamento AP** attivo sul router (WindTre HUB) — il ping e le connessioni TCP tra dispositivi sulla stessa WiFi funzionano
- ⚠️ Problema riscontrato e risolto: Mosquitto di default (senza config esplicita) ascoltava solo su `localhost`, non raggiungibile da altri dispositivi. Risolto forzando `listener 1883 0.0.0.0` nel file di configurazione.

---

## Setup SSH (accesso da PC)

Da Termux (una volta sola, per installare):
```bash
pkg install openssh
passwd          # imposta una password per il login SSH
```

**Username Termux**: `u0_a275` (verificabile con `whoami`)

### Avvio manuale di SSH (da fare ogni volta se non persistente)
```bash
sshd
```
Ascolta su porta **8022** (non 22, richiede privilegi che Termux non ha).

### Connessione da PC (PowerShell/CMD)
```powershell
ssh -p 8022 u0_a275@192.168.1.80
```

> Nota: al momento sshd va riavviato manualmente se il telefono si riavvia o Termux si chiude del tutto. Se serve, si può rendere persistente come servizio runit allo stesso modo di Mosquitto/Node-RED (vedi sotto).

---

## Setup Mosquitto (broker MQTT)

### Installazione
```bash
pkg update && pkg upgrade
pkg install mosquitto
pkg install termux-services
```

### File di configurazione
Percorso: `$PREFIX/etc/mosquitto/mosquitto.conf`

Contenuto:
```
listener 1883 0.0.0.0
allow_anonymous true
```

> ⚠️ **Da fare prima di esporre il sistema in modo stabile**: sostituire `allow_anonymous true` con autenticazione utente/password (comando `mosquitto_passwd`). Per ora va bene perché siamo su rete locale protetta da WiFi.

### Servizio persistente (runit)
```bash
mkdir -p $PREFIX/var/service/mosquitto
printf '#!/data/data/com.termux/files/usr/bin/sh\nexec mosquitto -c /data/data/com.termux/files/usr/etc/mosquitto/mosquitto.conf\n' > $PREFIX/var/service/mosquitto/run
chmod +x $PREFIX/var/service/mosquitto/run
sv-enable mosquitto
sv up mosquitto
```

### Comandi utili di gestione
```bash
sv status mosquitto     # controlla se è attivo
sv restart mosquitto    # riavvia (es. dopo modifica config)
sv down mosquitto        # ferma
sv up mosquitto          # avvia
```

### Test rapido (pubblica/sottoscrivi da locale)
```bash
mosquitto_sub -h localhost -t test/heartbeat -v      # in una sessione
mosquitto_pub -h localhost -t test/heartbeat -m '{"status":"online"}'   # in un'altra
```

### Test di raggiungibilità da rete esterna (da PC, PowerShell)
```powershell
Test-NetConnection -ComputerName 192.168.1.80 -Port 1883
```
Deve restituire `TcpTestSucceeded : True`.

---

## Setup Node-RED (dashboard/logica)

### Installazione
```bash
pkg install nodejs
npm install -g --unsafe-perm node-red
```

### Modulo dashboard (widget grafici)
```bash
cd ~/.node-red
npm install node-red-dashboard
```

### Servizio persistente (runit)
```bash
mkdir -p $PREFIX/var/service/node-red
printf '#!/data/data/com.termux/files/usr/bin/sh\nexec node-red\n' > $PREFIX/var/service/node-red/run
chmod +x $PREFIX/var/service/node-red/run
sv-enable node-red
sv up node-red
```

### Comandi utili di gestione
```bash
sv status node-red
sv restart node-red     # necessario dopo aver installato nuovi moduli npm
sv down node-red
sv up node-red
```

### Accesso all'editor
Da browser (PC o telefono, stessa rete):
```
http://192.168.1.80:1880
```

---

## Checklist di avvio rapido (dopo riavvio telefono o problemi)

Se qualcosa non risponde, controllare in ordine:

1. Il telefono è acceso, in carica, connesso al WiFi di casa (non a dati mobili)
2. `ssh -p 8022 u0_a275@192.168.1.80` da PC — se non si connette, serve rilanciare `sshd` fisicamente da telefono
3. `sv status mosquitto` e `sv status node-red` — se non sono `run: ... (pid ...)`, rilanciare con `sv up <nome>`
4. Test rapido di raggiungibilità: `Test-NetConnection -ComputerName 192.168.1.80 -Port 1883` da PC

---

## Stato attuale — cosa funziona

- [x] Mosquitto installato, configurato, persistente, raggiungibile dalla rete locale
- [x] Node-RED installato, persistente, editor accessibile da PC
- [x] Modulo dashboard installato
- [x] SSH funzionante per gestione comoda da PC
- [x] Testato: publish MQTT da locale → ricevuto correttamente in Node-RED (nodo mqtt-in + debug)
- [x] Flusso Node-RED meteo (Open-Meteo) completo e funzionante in dashboard
- [x] Sketch ESP32 Gateway: WiFi + MQTT + heartbeat periodico, con riconnessione automatica
- [x] Heartbeat del Gateway visibile in dashboard Node-RED

## Flusso Node-RED — Meteo (Fase 1, anticipata)

**Catena nodi**: `inject (timer)` → `http request (Open-Meteo)` → `function (estrazione + logica allerta)` → `switch (condizioniOk true/false)` → `function (formattazione testo)` → `text widget (dashboard)`

### Nodo http request — Open-Meteo
- URL: endpoint `hourly` con `temperature_2m` e `precipitation`, limitato con parametro per ridurre il numero di ore restituite (invece delle 48+ di default)
- **Importante**: campo "Return"/"a parsed JSON object" — di default Open-Meteo non setta Content-Type correttamente, quindi va forzato il parsing JSON o `msg.payload` resta una stringa grezza (causa dell'errore iniziale `Cannot read properties of undefined`)

### Nodo function — logica allerta
Trova l'indice dell'ora corrente nell'array `hourly.time`, ritaglia una finestra di N ore avanti, controlla soglie di pioggia (`SOGLIA_PIOGGIA_MM`) e temperatura (`TEMP_MIN`/`TEMP_MAX`), produce:
```json
{ "condizioniOk": true/false, "motivi": [...], "finestraOraria": [...], "temperature": [...], "pioggia": [...] }
```

### Nodo switch
Controlla `msg.payload.condizioniOk` (property esplicita, non solo `msg.payload`) — tipo confronto impostato su **boolean**, non string. Nota: lo switch NON manda mai a un'uscita se la regola è falsa; se sembrano "sparare" entrambe le uscite, controllare tipo di dato nelle regole o se si sta confondendo il pannello Debug storico (che accumula messaggi nel tempo) con un invio simultaneo reale.

### Dashboard
Scelto un solo widget di testo (non due, uno per ramo) alimentato da un function che genera un messaggio human-readable condizionale — più pulito che avere due box sempre visibili con l'ultimo valore "congelato".

**Tab/Gruppi**: Tab = pagina della dashboard (es. "Meteo", in futuro "Robot", "Sensori"). Gruppo = riquadro/card dentro una tab che raggruppa widget correlati (es. "Condizioni attuali").

---

## Sketch ESP32 — Nodo Gateway (Fase 0, output finale)

Libreria usata: **PubSubClient** (di Nick O'Leary) — installabile da Arduino IDE (Gestisci librerie → "PubSubClient") o PlatformIO (`lib_deps = knolleary/PubSubClient@^2.8`).
Repo: https://github.com/knolleary/pubsubclient — documentazione API leggibile: https://pubsubclient.knolleary.net/api

### Struttura dello sketch
```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "...";
const char* password = "...";
const char *mqtt_broker = "192.168.1.80";
const char *topic = "tagliaerba/gateway/heartbeat";
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long ultimoInvio = 0;
const unsigned long intervalloHeartbeat = 30000; // 30 secondi

void callback(char* topic, byte* payload, unsigned int length) {
    // vuoto per ora, il Gateway non riceve comandi ancora
}

void reconnect() {
    while (!client.connected()) {
        String client_id = "esp32-gateway-" + String(WiFi.macAddress());
        if (client.connect(client_id.c_str())) {
            Serial.println("connesso");
        } else {
            Serial.print("fallito, stato="); Serial.println(client.state());
            delay(5000);
        }
    }
}

void setup(){
    Serial.begin(115200);
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);
    while(WiFi.status() != WL_CONNECTED){ delay(100); }
    client.setServer(mqtt_broker, mqtt_port);
    client.setCallback(callback);
}

void loop(){
    if (!client.connected()) reconnect();
    client.loop();

    unsigned long adesso = millis();
    if (adesso - ultimoInvio >= intervalloHeartbeat) {
        ultimoInvio = adesso;
        String payload = "{\"status\":\"online\",\"uptime\":" + String(adesso / 1000) + "}";
        client.publish(topic, payload.c_str());
    }
}
```

### Note importanti
- **Nessuna autenticazione MQTT** (`client.connect(client_id.c_str())` senza username/password) perché Mosquitto ha `allow_anonymous true` — da rivedere insieme quando si aggiunge sicurezza
- **`client.loop()`** va chiamato di continuo nel loop principale: gestisce i PINGREQ/PINGRESP che tengono viva la connessione TCP persistente con il broker, oltre a processare eventuali messaggi in arrivo (via `callback`). Se non chiamato abbastanza spesso, il broker droppa la connessione per timeout senza preavviso visibile
- **`reconnect()`** gestisce la riconnessione automatica se il WiFi o il broker hanno un blip — usa `delay()` solo qui dentro (mentre si è già disconnessi), mai nel corpo principale del `loop()` per non bloccare `client.loop()`
- Timing basato su `millis()` (non `delay()`) nel loop principale, per non bloccare l'esecuzione

### Test da terminale (verifica indipendente da Node-RED)
```bash
mosquitto_sub -h 192.168.1.80 -t tagliaerba/gateway/heartbeat -v
```

### Metodo per studiare una libreria Arduino/C++ in autonomia
1. Cercare prima documentazione "human readable" (sito ufficiale/README), non il codice sorgente direttamente
2. Se serve il codice, partire dal file header (`.h`) — contiene le dichiarazioni con brevi commenti, più veloce da scorrere del `.cpp`
3. Usare la ricerca (tasto `/` su GitHub) per saltare a un metodo specifico una volta noto il nome
4. Consultare la cartella `examples/` della repo — spesso più chiara della lettura del codice sorgente stesso

---

## Prossimi passi

- [ ] Collegare l'heartbeat del Gateway a un widget dashboard dedicato (nuovo gruppo/tab "Gateway")
- [ ] Fase 2: rilevamento rientro in base via NFC (Nodo Base)
- [ ] (Rimandato) Sicurezza: autenticazione MQTT invece di `allow_anonymous`
- [ ] (Rimandato) Rendere SSH persistente come servizio, se utile
- [ ] (Rimandato) Avvio automatico dei servizi al boot del telefono (richiede Termux:Boot)
- [ ] (Idea futura) Indicatore "ultimo heartbeat visto" in dashboard, per rilevare Gateway offline oltre una soglia di tempo

## Note tecniche/troubleshooting incontrate

- **WSL vs Termux**: attenzione a non confondere terminali — un `ifconfig` lanciato per errore su WSL (PC) invece che su Termux (telefono) ha dato un IP fuorviante (subnet Hyper-V, prefisso MAC `00:15:5d`)
- **`nc` non esiste su Windows nativo** → usare `Test-NetConnection` in PowerShell
- **`ss`/`lsof`/lettura diretta `/proc/net/tcp`** spesso danno "permission denied" su Termux/Android per restrizioni di sistema — non affidarsi a questi per diagnosi, verificare piuttosto tramite test di connessione reale (`mosquitto_sub`/`pub`, `Test-NetConnection`)
- **Causa reale del "No route to host" iniziale**: non era isolamento router (escluso con ping riuscito in entrambe le direzioni), ma il binding di default di Mosquitto limitato a `localhost` — risolto con `listener 1883 0.0.0.0` esplicito nel config
