#!/usr/bin/env bash
# Smoke test del container del simulatore: costruisce l'immagine, la avvia contro un
# Mosquitto con autenticazione e verifica che (1) il container resti attivo,
# (2) lo status online retained sia pubblicato, (3) arrivi almeno un heartbeat.
# Eseguire da docker/simulatore.
set -euo pipefail

SUFFISSO="$$"
RETE="smoke-rete-$SUFFISSO"
BROKER="smoke-broker-$SUFFISSO"
SIMULATORE="smoke-simulatore-$SUFFISSO"
IMMAGINE="simulatore-gateway:smoke"

# Stesse credenziali dei test di integrazione (test-integration/helpers.js)
PASS_GATEWAY="password-gateway-di-test"
PASS_OSSERVATORE="password-osservatore-di-test"

pulisci() {
  docker rm -f "$SIMULATORE" "$BROKER" >/dev/null 2>&1 || true
  docker network rm "$RETE" >/dev/null 2>&1 || true
}
trap pulisci EXIT

echo "==> Build dell'immagine"
docker build -t "$IMMAGINE" .

echo "==> Avvio del broker"
docker network create "$RETE" >/dev/null
docker run -d --name "$BROKER" --network "$RETE" \
  -v "$PWD/test-integration/mosquitto-test.conf:/mosquitto-test.conf:ro" \
  eclipse-mosquitto:2 sh -c "\
    mosquitto_passwd -b -c /tmp/passwd gateway '$PASS_GATEWAY' && \
    mosquitto_passwd -b /tmp/passwd osservatore '$PASS_OSSERVATORE' && \
    (chown mosquitto:mosquitto /tmp/passwd 2>/dev/null || true) && \
    exec mosquitto -c /mosquitto-test.conf" >/dev/null

for i in $(seq 1 30); do
  if docker logs "$BROKER" 2>&1 | grep -q "running"; then break; fi
  sleep 1
done

echo "==> Avvio del simulatore"
docker run -d --name "$SIMULATORE" --network "$RETE" \
  -e MQTT_HOST="$BROKER" \
  -e MQTT_PASS_GATEWAY="$PASS_GATEWAY" \
  -e INTERVALLO_HEARTBEAT_S=1 \
  "$IMMAGINE" >/dev/null

sub() {
  docker exec "$BROKER" mosquitto_sub -h localhost -p 1883 \
    -u osservatore -P "$PASS_OSSERVATORE" "$@"
}

echo "==> Verifica dello status online (retained)"
STATUS="$(sub -t tagliaerba/gateway/status -C 1 -W 20)"
echo "$STATUS" | grep -q '"status":"online"' || { echo "Status inatteso: $STATUS"; docker logs "$SIMULATORE"; exit 1; }

echo "==> Verifica di un heartbeat"
HEARTBEAT="$(sub -t tagliaerba/gateway/heartbeat -C 1 -W 20)"
echo "$HEARTBEAT" | grep -q '"status":"online"' || { echo "Heartbeat inatteso: $HEARTBEAT"; docker logs "$SIMULATORE"; exit 1; }

echo "==> Verifica che il container sia ancora attivo"
[ "$(docker inspect -f '{{.State.Running}}' "$SIMULATORE")" = "true" ] || { docker logs "$SIMULATORE"; exit 1; }

echo "Smoke test superato"