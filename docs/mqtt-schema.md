# Schema Topic MQTT — RoboRevive

## Convenzione naming

```
tagliaerba/{nodo}/{tipo_messaggio}
```

- `{nodo}`: `gateway`, `base`, `robot`
- `{tipo_messaggio}`: nome descrittivo dell'evento/dato (kebab-case)

Ogni payload è un oggetto JSON. Ogni messaggio include, dove rilevante, un
campo timestamp in formato ISO 8601 (`"2026-09-07T10:30:00Z"`).

---

## Topic attivi

### `tagliaerba/gateway/heartbeat`
Pubblicato da: **Nodo Gateway**, ogni 30 secondi
Sottoscritto da: Node-RED (dashboard "Gateway online/offline")

Payload:
```json
{
  "status": "online",
  "uptime": 1234
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `status` | string | Sempre `"online"` quando pubblicato — l'assenza di messaggi per >60s indica Gateway offline (nessun "last will" configurato per ora) |
| `uptime` | number | Secondi trascorsi dall'ultimo avvio del dispositivo |

---

## Topic pianificati (non ancora implementati)

> Le voci sotto sono proposte di design, da confermare/aggiustare durante l'implementazione di ciascuna fase. Spostare qui sopra, in "Topic attivi", una volta implementate e verificate.

### Fase 2 — NFC / rilevamento rientro in base

#### `tagliaerba/base/nfc-rilevato`
Pubblicato da: **Nodo Base**, quando il lettore rileva il tag NFC sul robot

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

```json
{
  "letture": [
    { "ancora_id": "base", "rssi": -62 },
    { "ancora_id": "gateway", "rssi": -71 }
  ],
  "timestamp": "2026-09-07T10:30:00Z"
}
```

> Fase esplorativa — schema soggetto a revisione in base ai risultati dei primi test.

---

## Note generali

- Nessuna autenticazione MQTT attiva (`allow_anonymous true` su Mosquitto) — accettabile per rete locale protetta da WiFi, da rivedere se il sistema venisse esposto oltre la rete di casa
- Nessun meccanismo di deduplicazione/idempotenza sui messaggi ancora implementato — da considerare se si osservano messaggi duplicati in condizioni di rete instabile
- QoS MQTT: non specificato esplicitamente nell'implementazione attuale (default libreria) — da documentare esplicitamente quando si formalizzano i nuovi publisher