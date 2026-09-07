const { valutaCondizioni } = require('./allerta-meteo');

const adessoFisso = new Date('2026-09-06T10:00:00');

// --- Nessuna allerta: caso base ---

test('condizioniOk è true se tutto nella norma', () => {
    const orari = ['2026-09-06T10:00:00', '2026-09-06T11:00:00'];
    const temperature = [20, 21];
    const pioggia = [0, 0];

    const risultato = valutaCondizioni(orari, temperature, pioggia, adessoFisso);

    expect(risultato.condizioniOk).toBe(true);
});

test('motivi è vuoto se tutto nella norma', () => {
    const orari = ['2026-09-06T10:00:00', '2026-09-06T11:00:00'];
    const temperature = [20, 21];
    const pioggia = [0, 0];

    const risultato = valutaCondizioni(orari, temperature, pioggia, adessoFisso);

    expect(risultato.motivi).toHaveLength(0);
});

// --- Pioggia sopra soglia ---

test('condizioniOk è false se pioggia supera la soglia', () => {
    const orari = ['2026-09-06T10:00:00'];
    const risultato = valutaCondizioni(orari, [20], [0.5], adessoFisso);

    expect(risultato.condizioniOk).toBe(false);
});

test('motivi contiene il riferimento alla pioggia se supera la soglia', () => {
    const orari = ['2026-09-06T10:00:00'];
    const risultato = valutaCondizioni(orari, [20], [0.5], adessoFisso);

    expect(risultato.motivi[0]).toMatch(/Pioggia/);
});

// --- Condizione composta: temperatura fuori range (< tempMin || > tempMax) ---
// Condition coverage: serve un test per ciascuna sotto-espressione vera,
// non basta far scattare il branch una sola volta.

test('condizioniOk è false se temperatura sotto il minimo (< tempMin vero, > tempMax falso)', () => {
    const orari = ['2026-09-06T10:00:00'];
    const risultato = valutaCondizioni(orari, [2], [0], adessoFisso);

    expect(risultato.condizioniOk).toBe(false);
});

test('condizioniOk è false se temperatura sopra il massimo (< tempMin falso, > tempMax vero)', () => {
    const orari = ['2026-09-06T10:00:00'];
    const risultato = valutaCondizioni(orari, [35], [0], adessoFisso);

    expect(risultato.condizioniOk).toBe(false);
});

test('condizioniOk è true se temperatura al limite esatto (< tempMin falso, > tempMax falso)', () => {
    const orari = ['2026-09-06T10:00:00'];
    const risultato = valutaCondizioni(orari, [31], [0], adessoFisso); // tempMax = 31, non è > 31

    expect(risultato.condizioniOk).toBe(true);
});

// --- Finestra temporale ---

test('esclude ore passate rispetto ad "adesso"', () => {
    const orari = ['2026-09-06T08:00:00', '2026-09-06T09:00:00', '2026-09-06T10:00:00'];
    const temperature = [20, 20, 20];
    const pioggia = [5, 5, 0]; // pioggia alta solo nelle ore passate

    const risultato = valutaCondizioni(orari, temperature, pioggia, adessoFisso);

    expect(risultato.condizioniOk).toBe(true);
});

// --- Parametro "adesso" di default (per il branch coverage sul parametro) ---

test('usa la data corrente se "adesso" non è specificato', () => {
    const orari = ['2020-01-01T00:00:00'];
    const risultato = valutaCondizioni(orari, [20], [0]);

    expect(risultato).toHaveProperty('condizioniOk');
});