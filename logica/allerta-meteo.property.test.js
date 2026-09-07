// logica/allerta-meteo.property.test.js
const fc = require('fast-check');
const { valutaCondizioni } = require('./allerta-meteo');

const TEMP_MIN = 5;
const TEMP_MAX = 31;
const SOGLIA_PIOGGIA = 0.3;
const adesso = new Date('2026-09-06T10:00:00');

function costruisciOrari(n) {
    return Array.from({ length: n }, (_, i) =>
        new Date(adesso.getTime() + i * 60 * 60 * 1000).toISOString()
    );
}

test('property: nessuna allerta se tutti i valori sono entro le soglie', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    temp: fc.double({ min: TEMP_MIN, max: TEMP_MAX, noNaN: true }),
                    pioggia: fc.double({ min: 0, max: SOGLIA_PIOGGIA, noNaN: true })
                }),
                { minLength: 1, maxLength: 12 }
            ),
            (valori) => {
                const orari = costruisciOrari(valori.length);
                const temperature = valori.map(v => v.temp);
                const pioggia = valori.map(v => v.pioggia);

                const risultato = valutaCondizioni(orari, temperature, pioggia, adesso);
                return risultato.condizioniOk === true;
            }
        )
    );
});

test('property: pioggia sopra soglia genera sempre allerta', () => {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 12 }),
            fc.integer({ min: 0, max: 11 }),
            fc.double({ min: SOGLIA_PIOGGIA + 0.01, max: 100, noNaN: true }),
            (n, indiceScelto, valorePioggia) => {
                const indice = indiceScelto % n;
                const orari = costruisciOrari(n);
                const temperature = Array(n).fill(20);
                const pioggia = Array(n).fill(0);
                pioggia[indice] = valorePioggia;

                const risultato = valutaCondizioni(orari, temperature, pioggia, adesso);
                return risultato.condizioniOk === false;
            }
        )
    );
});

test('property: condizioniOk è coerente con la lunghezza di motivi', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    temp: fc.double({ min: -20, max: 50, noNaN: true }),
                    pioggia: fc.double({ min: 0, max: 50, noNaN: true })
                }),
                { minLength: 1, maxLength: 12 }
            ),
            (valori) => {
                const orari = costruisciOrari(valori.length);
                const temperature = valori.map(v => v.temp);
                const pioggia = valori.map(v => v.pioggia);

                const risultato = valutaCondizioni(orari, temperature, pioggia, adesso);
                return risultato.condizioniOk === (risultato.motivi.length === 0);
            }
        )
    );
});

test('property: finestraOraria, temperature e pioggia in output hanno sempre pari lunghezza', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    temp: fc.double({ min: -20, max: 50, noNaN: true }),
                    pioggia: fc.double({ min: 0, max: 50, noNaN: true })
                }),
                { minLength: 0, maxLength: 12 }
            ),
            (valori) => {
                const orari = costruisciOrari(valori.length);
                const temperature = valori.map(v => v.temp);
                const pioggia = valori.map(v => v.pioggia);

                const risultato = valutaCondizioni(orari, temperature, pioggia, adesso);
                return (
                    risultato.finestraOraria.length === risultato.temperature.length &&
                    risultato.temperature.length === risultato.pioggia.length
                );
            }
        )
    );
});