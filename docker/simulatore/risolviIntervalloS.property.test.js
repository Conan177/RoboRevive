const fc = require('fast-check');
const { risolviIntervalloS } = require('./risolviIntervalloS');

const LIMITI = { defaultS: 30, minS: 1, maxS: 300 };

const intero = fc.integer({ min: LIMITI.minS, max: LIMITI.maxS });

const interoFuoriLimiti = fc.oneof(
    fc.integer({ min: -1000000, max: LIMITI.minS - 1 }),
    fc.integer({ min: LIMITI.maxS + 1, max: 1000000000 }),
);

const numeroDecorato = fc.oneof(
    fc.tuple(
        fc.constantFrom(' ', '+', '-', '0x'),
        intero,
        fc.constantFrom('', ' ', '.5', 'e0'),
    ),
    fc.tuple(
        fc.constantFrom('', ' ', '+'),
        intero,
        fc.constantFrom(' ', '.5', 'e0', '\n'),
    ),
).map(([prefisso, n, suffisso]) => `${prefisso}${n}${suffisso}`);

const inputQualsiasi = fc.oneof(
    fc.string(),
    intero.map(String),
    fc.double({ noNaN: false, noDefaultInfinity: false }).map(String),
    fc.constant(undefined),
);

describe('risolviIntervalloS (proprietà)', () => {
    test('ogni intero dentro i limiti viene restituito invariato', () => {
        fc.assert(
            fc.property(intero, (n) => {
                expect(risolviIntervalloS(String(n), LIMITI).valore).toBe(n);
            }),
        );
    });

    test('ogni intero dentro i limiti non usa il default', () => {
        fc.assert(
            fc.property(intero, (n) => {
                expect(risolviIntervalloS(String(n), LIMITI).usatoDefault).toBe(false);
            }),
        );
    });

    test('ogni intero fuori dai limiti restituisce il default', () => {
        fc.assert(
            fc.property(interoFuoriLimiti, (n) => {
                expect(risolviIntervalloS(String(n), LIMITI).valore).toBe(LIMITI.defaultS);
            }),
        );
    });

    test('ogni numero dentro i limiti ma scritto in forma non valida usa il default', () => {
        fc.assert(
            fc.property(numeroDecorato, (s) => {
                expect(risolviIntervalloS(s, LIMITI).usatoDefault).toBe(true);
            }),
        );
    });

    test('il valore restituito non è mai sotto il minimo', () => {
        fc.assert(
            fc.property(inputQualsiasi, (s) => {
                expect(risolviIntervalloS(s, LIMITI).valore).toBeGreaterThanOrEqual(LIMITI.minS);
            }),
        );
    });

    test('il valore restituito non è mai sopra il massimo', () => {
        fc.assert(
            fc.property(inputQualsiasi, (s) => {
                expect(risolviIntervalloS(s, LIMITI).valore).toBeLessThanOrEqual(LIMITI.maxS);
            }),
        );
    });
});