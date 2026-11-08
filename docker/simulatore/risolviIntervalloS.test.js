const { risolviIntervalloS } = require('./risolviIntervalloS');

const LIMITI = { defaultS: 30, minS: 1, maxS: 300 };
const LIMITI_PERMISSIVI = { defaultS: 30, minS: 0, maxS: 300 };

const NON_VALIDI = [
    'abc', '', ' ', undefined, 'NaN', 'Infinity', '-5', '+5',
    '10.5', '2.5', '0x10', '1e1', ' 10 ', '10\n', '0', '301',
].map((v) => [v]);

describe('risolviIntervalloS', () => {
    describe('valori validi', () => {
        test.each([
            ['10', 10],
            ['1', 1],
            ['300', 300],
            ['007', 7],
        ])('accetta la stringa %p come valore %p', (input, atteso) => {
            expect(risolviIntervalloS(input, LIMITI).valore).toBe(atteso);
        });

        test('con input valido usatoDefault è false', () => {
            expect(risolviIntervalloS('10', LIMITI).usatoDefault).toBe(false);
        });
    });

    describe('valori non validi', () => {
        test.each(NON_VALIDI)('restituisce il default per %p', (input) => {
            expect(risolviIntervalloS(input, LIMITI).valore).toBe(LIMITI.defaultS);
        });

        test.each(NON_VALIDI)('segnala usatoDefault true per %p', (input) => {
            expect(risolviIntervalloS(input, LIMITI).usatoDefault).toBe(true);
        });
    });

    describe('con minimo permissivo (minS = 0)', () => {
        test.each([[''], [' ']])(
            'la stringa %p non diventa 0 ma usa il default',
            (input) => {
                expect(risolviIntervalloS(input, LIMITI_PERMISSIVI).valore).toBe(
                    LIMITI_PERMISSIVI.defaultS
                );
            }
        );

        test('accetta "0" come valore 0', () => {
            expect(risolviIntervalloS('0', LIMITI_PERMISSIVI).valore).toBe(0);
        });
    });
});