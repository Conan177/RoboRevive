# Schema Topic MQTT — RoboRevive

## Convenzione naming

```
tagliaerba/{nodo}/{tipo_messaggio}
```

- `{nodo}`: `gateway`, `base`, `robot`
- `{tipo_messaggio}`: nome descrittivo dell'evento/dato (kebab-case)

Namespace riservato per comandi verso i nodi (vedi sezione dedicata):
```
tagliaerba/{nodo}/cmd/{comando}
```

Ogni payload è un oggetto JSON. Ogni messaggio include, dove rilevante, un campo timestamp in formato ISO 8601 senza millisecondi (`"2026-09-07T10:30:00Z"`).

**Nota sulla generazione del timestamp**: da definire per ciascun nodo se generato lato dispositivo (richiede sync NTP o RTC dedicato su ESP32) o lato Node-RED all'arrivo del messaggio. Finché gli ESP32 non hanno sync NTP configurato, i timestamp nei payload sotto sono indicativi/placeholder — verificare in fase di implementazione quale sia la sorgente effettiva per ciascun topic, per evitare inconsistenze tra nodi diversi. Il simulatore Docker genera i timestamp con l'orologio della macchina che lo ospita.

**Stato di implementazione**: i topic "attivi" sono implementati nel **simulatore Docker** (`docker/simulatore`) e verificati dai test automatici. Il firmware dell'ESP32 Gateway reale non è ancora implementato: dovrà rispettare lo stesso contratto (topic, payload, QoS, retain, Last Will).

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

| Topic | Retain | Motivazione |
|---|---|---|
| `gateway/heartbeat` | No | Il valore ha senso solo se recente, un retained heartbeat vecchio sarebbe fuorviante |
| `gateway/status` (LWT) | Sì | Un client che si connette deve sapere subito se il Gateway è online/offline senza aspettare |
| `base/nfc-rilevato` | No | È un evento puntuale, non uno stato: con retain un nuovo subscriber (ad esempio Node-RED dopo un riavvio) riceverebbe un rientro già avvenuto come se fosse nuovo |
| `base/ambiente` | No | Dato periodico, il prossimo campionamento arriva comunque a breve |
| `robot/partenza-rilevata` | No | Evento puntuale, non uno stato persistente |
| `robot/rssi` | No | Dato periodico |
| `gateway/cmd/...` (comandi) | No | Un comando retained verrebbe riconsegnato a ogni riconnessione del destinatario, rieseguendolo |

---

## Topic attivi

### `tagliaerba/gateway/heartbeat`

Pubblicato da: **Nodo Gateway**, subito dopo la connessione e poi ogni 30 secondi (configurabile nel simulatore con `INTERVALLO_HEARTBEAT_S`)
Sottoscritto da: Node-RED (dashboard "Gateway online/offline")
QoS: 0 · Retain: No

Non viene pubblicato mentre il client non è connesso al broker.

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
| `uptime` | number (intero ≥ 0) | Secondi trascorsi dall'ultimo avvio (nel simulatore: del processo; sull'ESP32: del dispositivo) |

### `tagliaerba/gateway/status` *(Last Will and Testament)*

Pubblicato da: **broker Mosquitto** (`offline`, come Last Will) quando la connessione TCP del Gateway cade in modo anomalo (crash, perdita WiFi, spegnimento improvviso — non una disconnessione pulita); dal **Nodo Gateway** stesso (`online`), subito dopo ogni connessione riuscita (anche dopo una riconnessione)
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
| `status` | string | `"offline"` (LWT, pubblicato dal broker per conto del client) oppure `"online"` (pubblicato dal Gateway dopo la connessione) |

**Implementazione**: il simulatore Docker registra il Last Will alla connessione e pubblica `online` con retain e QoS 1; il comportamento è verificato anche contro un broker Mosquitto reale (disconnessione non pulita → `offline` retained).
**Implementazione lato ESP32**: configurare con `client.setWill(topic, payload, qos, retain)` **prima** della chiamata a `client.connect()`, poi pubblicare `{"status":"online"}` su questo topic con retain attivo e QoS 1 subito dopo `client.connect()` (il retained `offline` resta sul broker finché qualcuno non lo sostituisce). **Da implementare nel firmware**: al momento il Gateway fisico non ha un LWT configurato, il rilevamento offline si basa solo sull'assenza di heartbeat per >60s.

### `tagliaerba/base/nfc-rilevato`

Pubblicato da: **Nodo Gateway**, per conto del Nodo Base (che invia l'evento via ESP-NOW), quando il lettore rileva il tag NFC sul robot
Stato: implementato nel simulatore (scenario `rientro`); firmware reale da implementare
QoS: 1 · Retain: No

```json
{
  "tag_id": "04A1B2C3",
  "timestamp": "2026-09-07T10:30:00Z"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `tag_id` | string | ID univoco del tag NFC letto (nel simulatore: valore fisso `04A1B2C3`) |
| `timestamp` | string (ISO 8601) | Istante di lettura |

### `tagliaerba/base/ambiente`

Pubblicato da: **Nodo Gateway**, per conto del Nodo Base (via ESP-NOW), periodicamente (frequenza da definire, es. ogni 5 min)
Stato: implementato nel simulatore (scenario `ambiente`, su comando); firmware reale da implementare
QoS: 0 · Retain: No

```json
{
  "temp_aria": 22.4,
  "umidita_aria": 61.0,
  "umidita_terreno": 48.5,
  "timestamp": "2026-09-07T10:30:00Z"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `temp_aria` | number | Temperatura aria in °C (sensore SHT31). Il simulatore genera valori tra 10 e 35 |
| `umidita_aria` | number | Umidità relativa aria in % (sensore SHT31). Il simulatore genera valori tra 30 e 90 |
| `umidita_terreno` | number | Umidità del terreno in % (sensore capacitivo v1.2). Sostituisce il precedente `temp_terreno`, perché il sensore misura l'umidità e non la temperatura. Il simulatore genera valori tra 20 e 80 |
| `timestamp` | string (ISO 8601) | Istante di lettura |

### `tagliaerba/robot/partenza-rilevata`

Pubblicato da: **Nodo Gateway**, per conto del Nodo Robot (via ESP-NOW), quando il pattern audio del motore in avvio viene riconosciuto
Stato: implementato nel simulatore (scenario `partenza`); firmware reale da implementare
QoS: 1 · Retain: No

```json
{
  "confidenza": 0.87,
  "timestamp": "2026-09-07T10:30:00Z"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `confidenza` | number (0-1) | Punteggio di confidenza del rilevamento (utile soprattutto se si passa a TinyML). Il simulatore genera valori tra 0.7 e 0.99 |
| `timestamp` | string (ISO 8601) | Istante del rilevamento |

---

## Namespace comandi

```
tagliaerba/{nodo}/cmd/{comando}
```

Riservato per la comunicazione in verso opposto (Node-RED/app → nodi). Per il firmware reale **nessun nodo riceve ancora comandi via MQTT**.

Esempi previsti (da definire nel dettaglio quando implementati):
- `tagliaerba/gateway/cmd/restart` — richiesta di riavvio del Gateway
- `tagliaerba/robot/cmd/stop` — arresto di emergenza (da valutare con attenzione, probabilmente da gestire anche/soprattutto a livello hardware diretto, non solo software, per motivi di sicurezza)

QoS: minimo 1 · Retain: No.

### Comandi di simulazione (solo simulatore Docker)

```
tagliaerba/gateway/cmd/simula/{scenario}
```

Il simulatore si sottoscrive a `tagliaerba/gateway/cmd/simula/#` (QoS 1) a ogni connessione e, alla ricezione di un comando, pubblica l'evento corrispondente come farebbe il gateway reale. Pensati per dimostrazioni e test: i pulsanti della dashboard di Node-RED pubblicano questi comandi (QoS 1, **retain No**, payload vuoto).

| Comando | Evento pubblicato |
|---|---|
| `tagliaerba/gateway/cmd/simula/rientro` | `tagliaerba/base/nfc-rilevato` |
| `tagliaerba/gateway/cmd/simula/partenza` | `tagliaerba/robot/partenza-rilevata` |
| `tagliaerba/gateway/cmd/simula/ambiente` | `tagliaerba/base/ambiente` |

Regole:
- uno scenario sconosciuto viene ignorato (nessun evento, solo una riga di log);
- un comando **retained** viene ignorato, per non rieseguirlo a ogni riconnessione;
- il prefisso `simula/` separa questi comandi da quelli reali futuri: il firmware ESP32 non deve implementarli.

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

### Fase 5 — Stima posizione (esplorativa, fuori dal perimetro dell'esame)

#### `tagliaerba/robot/rssi`

Pubblicato da: **Nodo Gateway**, per conto del Nodo Robot (via ESP-NOW), periodicamente, con letture RSSI dai nodi/ancore visibili
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

---

## Sicurezza — autenticazione e ACL

Ogni client si connette con credenziali dedicate (username/password via `mosquitto_passwd`), nessun accesso anonimo consentito (`allow_anonymous false`). Porta `1883`, non cifrata (accesso remoto solo tramite VPN WireGuard).

| Utente | Write | Read |
|---|---|---|
| `gateway` | `tagliaerba/+/+` | `tagliaerba/gateway/cmd/#` |
| `nodered` | `tagliaerba/#` | `tagliaerba/#` |
| `admin` | `#` | `#` |

Principio applicato: minimo privilegio per ruolo. Il `gateway` è l'unico client MQTT e ripubblica anche i dati di Nodo Base e Nodo Robot (ricevuti via ESP-NOW), quindi può scrivere su `tagliaerba/+/+` (topic a due livelli dopo `tagliaerba`: `gateway/*`, `base/*`, `robot/*`). Il wildcard a un solo livello esclude i topic `{nodo}/cmd/{comando}`, che il Gateway può solo leggere (sul proprio namespace `cmd/#`). Tutti gli eventi prodotti dal simulatore rispettano questa regola, verificata da un test automatico (property-based).

> Fase esplorativa — schema soggetto a revisione in base ai risultati dei primi test.

---

## Verifica automatica

Il contratto di questo schema è verificato da test in `docker/simulatore`: unit e property-based (topic, payload, QoS, retain, Last Will configurato, intervalli dei valori simulati), integrazione contro un Mosquitto reale con autenticazione (connessione, password errata, heartbeat, Last Will che scatta davvero, retained, comandi di simulazione) e smoke test del container. I test di integrazione possono essere riusati per il gateway reale.

---

## Note generali

- Autenticazione MQTT attiva (`allow_anonymous false`, `password_file` con utenti dedicati per ruolo: `gateway`, `nodered`, `admin`) e ACL sui topic configurate (vedi tabella sopra). Accesso remoto tramite VPN WireGuard già attivo.
- Nessun meccanismo di deduplicazione/idempotenza sui messaggi ancora implementato — da considerare se si osservano messaggi duplicati in condizioni di rete instabile.
- QoS e retain documentati per categoria (vedi tabelle sopra) — da rivedere singolarmente in fase di implementazione del firmware reale.
- Last Will and Testament (LWT): implementato e verificato nel simulatore, non ancora nel firmware del Gateway fisico — da aggiungere quando si rivede lo sketch.
- Namespace comandi reali (`{nodo}/cmd/{comando}`) riservato ma non implementato nel firmware; esistono solo i comandi di simulazione `gateway/cmd/simula/*`, validi nel simulatore.
