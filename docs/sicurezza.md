# Sicurezza — RoboRevive

## Stato attuale

- [x] Autenticazione MQTT (username/password, `allow_anonymous false`)
- [x] ACL sui topic per utente
- [ ] Accesso remoto via VPN
- [ ] TLS/MQTTS (da valutare necessità rispetto a VPN)
- [ ] Rate limiting / blocco tentativi falliti ripetuti

## Autenticazione

Ogni client MQTT si connette con credenziali dedicate, generate con `mosquitto_passwd` (file `password_file` referenziato in `mosquitto.conf`, non versionato — vedi `.gitignore`). Nessun accesso anonimo consentito.

Utenti attivi:
- `gateway` — Nodo Gateway ESP32
- `nodered` — istanza Node-RED locale
- `admin` — accesso di debug/manutenzione da PC

## ACL (Access Control List)

Principio applicato: minimo privilegio per ruolo.

| Utente | Write | Read |
|---|---|---|
| `gateway` | `tagliaerba/gateway/#` | `tagliaerba/gateway/cmd/#` |
| `nodered` | `tagliaerba/#` | `tagliaerba/#` |
| `admin` | `#` | `#` |

Note:
- `gateway` non ha permesso di lettura sui propri topic di pubblicazione (non necessario al suo funzionamento attuale)
- `cmd/#` è già riservato per `gateway` anche se il namespace comandi non è ancora implementato (vedi `mqtt-schema.md`), per evitare di dover rivedere le ACL quando verrà attivato
- `admin` ha accesso al wildcard assoluto `#` (non solo `tagliaerba/#`) per includere topic di sistema (`$SYS/#`) utili in debug

## Prossimi passi pianificati

1. Accesso remoto sicuro via VPN (WireGuard) verso la rete di casa, invece di port forwarding diretto delle porte MQTT/Node-RED
2. TLS/MQTTS (porta 8883) — da valutare se aggiungere in ogni caso o se ridondante rispetto al tunnel VPN per uso personale
3. Hardening minore: cambio porte di default, rate limiting su tentativi di connessione falliti ripetuti
