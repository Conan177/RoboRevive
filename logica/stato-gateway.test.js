const {
  applicaEvento,
  statoIniziale,
  creaEvento,
  INTERVALLO_INIZIALE_S,
  MOLTIPLICATORE_SOGLIA,
} = require('./stato-gateway');

const T0 = 1_000_000;

const stato = (nome, intervalloS = 30, ultimoContatto = T0) => ({
  stato: nome,
  ultimoContatto,
  intervalloS,
});
const status = (valore, adesso = T0) => ({ tipo: 'status', status: valore, adesso });
const heartbeat = (intervalloS, adesso = T0) => ({ tipo: 'heartbeat', intervalloS, adesso });
const controllo = (adesso) => ({ tipo: 'controllo', adesso });

const TUTTI_GLI_STATI = ['sconosciuto', 'online', 'sospetto', 'offline'];

describe('costanti e stato iniziale', () => {
  test('lo stato iniziale è sconosciuto', () => {
    expect(statoIniziale().stato).toBe('sconosciuto');
  });

  test('l\'intervallo iniziale è 300 secondi', () => {
    expect(INTERVALLO_INIZIALE_S).toBe(300);
  });

  test('il moltiplicatore della soglia è 3', () => {
    expect(MOLTIPLICATORE_SOGLIA).toBe(3);
  });

  test('lo stato iniziale usa l\'intervallo iniziale', () => {
    expect(statoIniziale().intervalloS).toBe(300);
  });
});

describe('evento status', () => {
  test.each(TUTTI_GLI_STATI)('status offline da %s porta a offline', (da) => {
    expect(applicaEvento(stato(da), status('offline')).stato).toBe('offline');
  });

  test.each(TUTTI_GLI_STATI)('status online da %s porta a online', (da) => {
    expect(applicaEvento(stato(da), status('online')).stato).toBe('online');
  });

  test('status online riporta l\'intervallo a 300 secondi', () => {
    expect(applicaEvento(stato('online', 30), status('online')).intervalloS).toBe(300);
  });

  test('status online registra l\'istante dell\'ultimo contatto', () => {
    expect(applicaEvento(stato('offline'), status('online', T0 + 5)).ultimoContatto).toBe(T0 + 5);
  });

  test('uno status con valore sconosciuto lascia lo stato invariato', () => {
    const prima = stato('online');
    expect(applicaEvento(prima, status('boh'))).toEqual(prima);
  });
});

describe('evento heartbeat', () => {
  test.each(['sconosciuto', 'online', 'sospetto'])('heartbeat da %s porta a online', (da) => {
    expect(applicaEvento(stato(da), heartbeat(30)).stato).toBe('online');
  });

  test('heartbeat da offline lascia lo stato invariato', () => {
    const prima = stato('offline');
    expect(applicaEvento(prima, heartbeat(30, T0 + 5))).toEqual(prima);
  });

  test('heartbeat registra l\'istante dell\'ultimo contatto', () => {
    expect(applicaEvento(stato('online'), heartbeat(30, T0 + 7)).ultimoContatto).toBe(T0 + 7);
  });

  test.each([[1], [30], [300]])('heartbeat con intervalloS %p aggiorna l\'intervallo', (valido) => {
    expect(applicaEvento(stato('online', 60), heartbeat(valido)).intervalloS).toBe(valido);
  });

  test.each([[0], [301], [-1], [2.5], ['30'], [undefined], [null], [NaN], [Infinity]])(
    'heartbeat con intervalloS %p mantiene l\'intervallo precedente',
    (nonValido) => {
      expect(applicaEvento(stato('online', 60), heartbeat(nonValido)).intervalloS).toBe(60);
    }
  );

  test('heartbeat con intervalloS non valido porta comunque a online', () => {
    expect(applicaEvento(stato('sospetto', 60), heartbeat(undefined)).stato).toBe('online');
  });
});

describe('evento controllo', () => {
  test('a esattamente 3 intervalli dall\'ultimo contatto resta online', () => {
    expect(applicaEvento(stato('online', 30), controllo(T0 + 90000)).stato).toBe('online');
  });

  test('un millisecondo oltre i 3 intervalli diventa sospetto', () => {
    expect(applicaEvento(stato('online', 30), controllo(T0 + 90001)).stato).toBe('sospetto');
  });

  test('con intervalloS 300 a 91 secondi resta online', () => {
    expect(applicaEvento(stato('online', 300), controllo(T0 + 91000)).stato).toBe('online');
  });

  test.each(['sconosciuto', 'offline', 'sospetto'])('il controllo non cambia lo stato %s', (da) => {
    expect(applicaEvento(stato(da, 30), controllo(T0 + 999999)).stato).toBe(da);
  });
});

describe('robustezza', () => {
  test('un evento di tipo sconosciuto lascia lo stato invariato', () => {
    const prima = stato('online');
    expect(applicaEvento(prima, { tipo: 'boh', adesso: T0 })).toEqual(prima);
  });

  test('non modifica lo stato ricevuto', () => {
    const prima = stato('online');
    const copia = JSON.parse(JSON.stringify(prima));
    applicaEvento(prima, heartbeat(60, T0 + 5));
    expect(prima).toEqual(copia);
  });
});

describe('creaEvento', () => {
  const TOPIC_STATUS = 'tagliaerba/gateway/status';
  const TOPIC_HEARTBEAT = 'tagliaerba/gateway/heartbeat';

  test('dallo status con payload oggetto crea un evento status', () => {
    expect(creaEvento(TOPIC_STATUS, { status: 'online' }, T0)).toEqual(
      { tipo: 'status', status: 'online', adesso: T0 }
    );
  });

  test('accetta anche il payload come stringa JSON', () => {
    expect(creaEvento(TOPIC_STATUS, '{"status":"offline"}', T0).status).toBe('offline');
  });

  test('dall\'heartbeat crea un evento con l\'intervalloS dichiarato', () => {
    const payload = { status: 'online', uptime: 5, intervalloS: 30 };
    expect(creaEvento(TOPIC_HEARTBEAT, payload, T0)).toEqual(
      { tipo: 'heartbeat', intervalloS: 30, adesso: T0 }
    );
  });

  test('dal topic controllo crea un evento controllo', () => {
    expect(creaEvento('controllo', undefined, T0)).toEqual({ tipo: 'controllo', adesso: T0 });
  });

  test.each([['tagliaerba/base/ambiente'], [''], [undefined], [null], [42]])(
    'un topic %p non crea nessun evento',
    (topic) => {
      expect(creaEvento(topic, { status: 'online' }, T0)).toBeNull();
    }
  );

  describe('payload anomali sull\'heartbeat', () => {
    const ANOMALI = [[null], [undefined], [42], ['non json'], ['null'], [[]], [true]];

    test.each(ANOMALI)('il payload %p non lancia eccezioni', (payload) => {
      expect(() => creaEvento(TOPIC_HEARTBEAT, payload, T0)).not.toThrow();
    });

    test.each(ANOMALI)('il payload %p produce un heartbeat senza intervalloS', (payload) => {
      expect(creaEvento(TOPIC_HEARTBEAT, payload, T0).intervalloS).toBeUndefined();
    });
  });
});