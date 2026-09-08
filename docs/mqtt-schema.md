# Schema Topic MQTT — RoboRevive

## Convenzione naming

```
tagliaerba/{nodo}/{tipo_messaggio}
```

- `{nodo}`: `gateway`, `base`, `robot`
- `{tipo_messaggio}`: nome descrittivo dell'evento/dato (kebab-case)

Namespace riservato per comandi verso i nodi (non ancora implementato, vedi sezione dedicata):
```
tagliaerba/{nodo}/cmd/{comando}
```

Ogni payload è un oggetto JSON. Ogni messaggio include, dove rilevante, un campo timestamp in formato ISO 8601 (`"2026-09-07T10:30:00Z"`).

**Nota sulla generazione del timestamp**: da definire per ciascun nodo se generato lato dispositivo (richiede sync NTP o RTC dedicato su ESP32) o lato Node-RED all'arrivo del messaggio. Finché gli ESP32 non hanno sync NTP configurato, i timestamp nei payload sotto sono indicativi/placeholder — verificare in fase di implementazione quale sia la sorgente effettiva per ciascun topic, per evitare inconsistenze tra nodi diversi.

---

## QoS — linee guida per categoria

| Categoria messaggio | QoS consigliato | Motivazione |
|---|---|---|
| Heartbeat / stato periodico | 0 | Periodico, la perdita di un singolo messaggio è ininfluente (il prossimo arriva comunque a breve) |
| Eventi one-shot (NFC rilevato, partenza rilevata) | 1 | Eventi non ripetuti automaticamente — perderli significa perdere un dato reale non recuperabile |
| Letture sensori periodiche (ambiente, RSSI) | 0 | Stesso ragionamento dell'heartbeat, il prossimo campionamento sostituisce il precedente |
| Comandi verso i nodi (namespace `cmd/`) | 1 (minimo) | Un comando perso può lasciare il sistema in uno stato non voluto |

---

## Retain — linee guida

Il flag `retain` fa sì che il broker conservi l'ultimo messaggio pubblicato su un topic e lo consegni immediatamente a ogni nuovo subscriber, senza dover aspettare il prossimo evento naturale.

| Topic | Retain consigliato | Motivazione |
|---|---|---|
| `gateway/heartbeat` | No | Il valore ha senso solo se recente, un retained heartbeat vecchio sarebbe fuorviante |
| `gateway/status` (LWT) | Sì | Un client che si connette deve sapere subito se il Gateway è online/offline senza aspettare |
| `base/nfc-rilevato` | Valutare | Utile se si vuole sapere "stato attuale: in base/fuori" senza aspettare il prossimo evento; da confermare in fase di implementazione |
| `base/ambiente` | No | Dato periodico, il prossimo campionamento arriva comunque a breve |
| `robot/partenza-rilevata` | No | Evento puntuale, non uno stato persistente |
| `robot/rssi` | No | Dato periodico |

---

## Topic attivi

### `tagliaerba/gateway/heartbeat`

Pubblicato da: **Nodo Gateway**, ogni 30 secondi
Sottoscritto da: Node-RED (dashboard "Gateway online/offline")
QoS: 0 · Retain: No

Payload:
```json
{
  "status": "online",
  "uptime": 1234
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `status` | string | Sempre `"online"` quando pubblicato |
| `uptime` | number | Secondi trascorsi dall'ultimo avvio del dispositivo |

### `tagliaerba/gateway/status` *(Last Will and Testament)*

Pubblicato da: **broker Mosquitto**, automaticamente, quando la connessione TCP del Gateway cade in modo anomalo (crash, perdita WiFi, spegnimento improvviso — non una disconnessione pulita)
Sottoscritto da: Node-RED (rilevamento offline affidabile, non basato solo su timeout dell'heartbeat)
QoS: 1 · Retain: Sì

Payload:
```json
{
  "status": "offline"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `status` | string | Sempre `"offline"` — pubblicato dal broker per conto del client, non dal Gateway stesso |

**Implementazione lato ESP32**: configurare con `client.setWill(topic, payload, qos, retain)` **prima** della chiamata a `client.connect()`. Da implementare — al momento il Gateway non ha ancora un LWT configurato, il rilevamento offline si basa solo sull'assenza di heartbeat per >60s.

---

## Namespace comandi (riservato, non ancora implementato)

```
tagliaerba/{nodo}/cmd/{comando}
```

Riservato fin da ora per garantire coerenza quando si implementerà la comunicazione in verso opposto (Node-RED/app → nodi), attualmente tutto lo schema è unidirezionale (nodi → Node-RED).

Esempi previsti (da definire nel dettaglio quando implementati):
- `tagliaerba/gateway/cmd/restart` — richiesta di riavvio del Gateway
- `tagliaerba/robot/cmd/stop` — arresto di emergenza (da valutare con attenzione, probabilmente da gestire anche/soprattutto a livello hardware diretto, non solo software, per motivi di sicurezza)

QoS consigliato: minimo 1, da confermare in fase di implementazione.

---

## Topic pianificati (non ancora implementati)

> Le voci sotto sono proposte di design, da confermare/aggiustare durante l'implementazione di ciascuna fase. Spostare qui sopra, in "Topic attivi", una volta implementate e verificate.

### Fase 1 — Allerte meteo

Attualmente il flusso meteo (Open-Meteo → logica allerta → dashboard) è interamente interno a Node-RED e **non transita su MQTT**. Scelta di design legittima (il dato non proviene da un nodo ESP32, quindi non c'è un vincolo tecnico a farlo passare dal broker). Da confermare se si vuole comunque pubblicarlo su un topic MQTT in futuro (es. per renderlo disponibile ad altri eventuali subscriber oltre a Node-RED stesso) — se sì, proposta:

#### `tagliaerba/gateway/meteo-allerta` *(da confermare se necessario)*
QoS: 0 · Retain: Sì (utile sapere l'ultimo stato senza aspettare il prossimo ciclo)
```json
{
  "condizioni_ok": true,
  "motivi": [],
  "timestamp": "2026-09-07T10:30:00Z"
}
```

### Fase 2 — NFC / rilevamento rientro in base

#### `tagliaerba/base/nfc-rilevato`

Pubblicato da: **Nodo Base**, quando il lettore rileva il tag NFC sul robot
QoS: 1 · Retain: valutare (vedi tabella sopra)

```json
{
  "tag_id": "04A1B2C3",
  "timestamp": "2026-09-07T10:30:00Z"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `tag_id` | string | ID univoco del tag NFC letto |
| `timestamp` | string (ISO 8601) | Istante di lettura |

### Fase 3 — Sensori ambientali

#### `tagliaerba/base/ambiente`

Pubblicato da: **Nodo Base**, periodicamente (frequenza da definire, es. ogni 5 min)
QoS: 0 · Retain: No

```json
{
  "temp_aria": 22.4,
  "umidita_aria": 61.0,
  "temp_terreno": 18.9,
  "timestamp": "2026-09-07T10:30:00Z"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `temp_aria` | number | Temperatura aria in °C (sensore SHT31) |
| `umidita_aria` | number | Umidità relativa aria in % (sensore SHT31) |
| `temp_terreno` | number | Temperatura terreno in °C (sonda DS18B20) |
| `timestamp` | string (ISO 8601) | Istante di lettura |

### Fase 4 — Rilevamento partenza (audio)

#### `tagliaerba/robot/partenza-rilevata`

Pubblicato da: **Nodo Robot**, quando il pattern audio del motore in avvio viene riconosciuto
QoS: 1 · Retain: No

```json
{
  "confidenza": 0.87,
  "timestamp": "2026-09-07T10:30:00Z"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `confidenza` | number (0-1) | Punteggio di confidenza del rilevamento (utile soprattutto se si passa a TinyML) |
| `timestamp` | string (ISO 8601) | Istante del rilevamento |

### Fase 5 — Stima posizione (esplorativa)

#### `tagliaerba/robot/rssi`

Pubblicato da: **Nodo Robot**, periodicamente, con letture RSSI dai nodi/ancore visibili
QoS: 0 · Retain: No

```json
{
  "letture": [
    { "ancora_id": "base", "rssi": -62 },
    { "ancora_id": "gateway", "rssi": -71 }
  ],
  "timestamp": "2026-09-07T10:30:00Z"
}


```

## Sicurezza — autenticazione e ACL

Ogni client si connette con credenziali dedicate (username/password via `mosquitto_passwd`), nessun accesso anonimo consentito.

| Utente | Write | Read |
|---|---|---|
| `gateway` | `tagliaerba/gateway/#` | `tagliaerba/gateway/cmd/#` |
| `nodered` | `tagliaerba/#` | `tagliaerba/#` |
| `admin` | `#` | `#` |

Principio applicato: minimo privilegio per ruolo — es. `gateway` non ha permesso di lettura sui propri topic di pubblicazione (non gli serve), solo sul proprio namespace comandi futuro (`cmd/#`), non ancora utilizzato ma già riservato per coerenza.

> Fase esplorativa — schema soggetto a revisione in base ai risultati dei primi test.

---

## Note generali

- Autenticazione MQTT attiva (`allow_anonymous false`, `password_file` con utenti dedicati per ruolo: `gateway`, `nodered`, `admin`) e ACL sui topic configurate (vedi tabella permessi sotto). Prossimo passo: accesso remoto sicuro via VPN, prima di qualsiasi esposizione a internet.
- Nessun meccanismo di deduplicazione/idempotenza sui messaggi ancora implementato — da considerare se si osservano messaggi duplicati in condizioni di rete instabile
- QoS e retain ora documentati per categoria (vedi tabelle sopra) — da rivedere singolarmente in fase di implementazione di ciascun topic pianificato
- Last Will and Testament (LWT) documentato per il Gateway (`gateway/status`) ma non ancora implementato lato firmware — da aggiungere quando si rivede lo sketch del Gateway
- Namespace comandi (`{nodo}/cmd/{comando}`) riservato ma non implementato — nessun nodo attualmente riceve comandi via MQTT
