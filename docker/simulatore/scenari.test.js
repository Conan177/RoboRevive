const { SCENARI, scenarioDaTopic } = require('./scenari');

// 2 novembre 2026, 10:30:00 UTC (mese 10 = novembre: i mesi di Date.UTC partono da 0)
const ORA = Date.UTC(2026, 10, 2, 10, 30, 0);
const TIMESTAMP = '2026-11-02T10:30:00Z';
const casualeA = (valore) => () => valore;

describe('scenario rientro', () => {
  const messaggi = () => SCENARI.rientro({ ora: ORA, casuale: casualeA(0.5) });

  test('produce un solo messaggio', () => {
    expect(messaggi()).toHaveLength(1);
  });

  test('pubblica sul topic tagliaerba/base/nfc-rilevato', () => {
    expect(messaggi()[0].topic).toBe('tagliaerba/base/nfc-rilevato');
  });

  test('il payload contiene tag_id e timestamp', () => {
    expect(messaggi()[0].payload).toEqual({ tag_id: '04A1B2C3', timestamp: TIMESTAMP });
  });

  test('usa QoS 1', () => {
    expect(messaggi()[0].qos).toBe(1);
  });

  test('non è retained', () => {
    expect(messaggi()[0].retain).toBe(false);
  });

  test('il timestamp non contiene i millisecondi', () => {
    const [messaggio] = SCENARI.rientro({ ora: ORA + 500, casuale: casualeA(0.5) });
    expect(messaggio.payload.timestamp).toBe(TIMESTAMP);
  });
});

describe('scenario partenza', () => {
  const messaggi = () => SCENARI.partenza({ ora: ORA, casuale: casualeA(0) });

  test('pubblica sul topic tagliaerba/robot/partenza-rilevata', () => {
    expect(messaggi()[0].topic).toBe('tagliaerba/robot/partenza-rilevata');
  });

  test('con generatore a 0 la confidenza è il minimo, 0.7', () => {
    expect(messaggi()[0].payload.confidenza).toBe(0.7);
  });

  test('il payload contiene il timestamp', () => {
    expect(messaggi()[0].payload.timestamp).toBe(TIMESTAMP);
  });

  test('usa QoS 1', () => {
    expect(messaggi()[0].qos).toBe(1);
  });

  test('non è retained', () => {
    expect(messaggi()[0].retain).toBe(false);
  });
});

describe('scenario ambiente', () => {
  const messaggi = (casuale) => SCENARI.ambiente({ ora: ORA, casuale: casualeA(casuale) });

  test('pubblica sul topic tagliaerba/base/ambiente', () => {
    expect(messaggi(0.5)[0].topic).toBe('tagliaerba/base/ambiente');
  });

  test('con generatore a 0.5 i valori sono a metà intervallo', () => {
    expect(messaggi(0.5)[0].payload).toEqual({
      temp_aria: 22.5,
      umidita_aria: 60,
      umidita_terreno: 50,
      timestamp: TIMESTAMP,
    });
  });

  test('con generatore a 0 i valori sono i minimi degli intervalli', () => {
    expect(messaggi(0)[0].payload.temp_aria).toBe(10);
  });

  test('non contiene più il campo temp_terreno', () => {
    expect(messaggi(0.5)[0].payload).not.toHaveProperty('temp_terreno');
  });

  test('usa QoS 0', () => {
    expect(messaggi(0.5)[0].qos).toBe(0);
  });

  test('non è retained', () => {
    expect(messaggi(0.5)[0].retain).toBe(false);
  });
});

describe('scenarioDaTopic', () => {
  test.each(['rientro', 'partenza', 'ambiente'])('riconosce lo scenario %s', (nome) => {
    expect(scenarioDaTopic(`tagliaerba/gateway/cmd/simula/${nome}`)).toBe(nome);
  });

  test('restituisce null per un comando fuori dal namespace simula', () => {
    expect(scenarioDaTopic('tagliaerba/gateway/cmd/restart')).toBeNull();
  });

  test('restituisce null per uno scenario inesistente', () => {
    expect(scenarioDaTopic('tagliaerba/gateway/cmd/simula/inesistente')).toBeNull();
  });

  test('restituisce null per "constructor" (nome ereditato da Object)', () => {
    expect(scenarioDaTopic('tagliaerba/gateway/cmd/simula/constructor')).toBeNull();
  });

  test('restituisce null per "__proto__"', () => {
    expect(scenarioDaTopic('tagliaerba/gateway/cmd/simula/__proto__')).toBeNull();
  });

  test('restituisce null per il solo prefisso senza nome', () => {
    expect(scenarioDaTopic('tagliaerba/gateway/cmd/simula/')).toBeNull();
  });
});