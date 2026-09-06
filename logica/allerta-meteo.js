const SOGLIA_PIOGGIA_MM = 0.3;
const TEMP_MIN = 5;
const TEMP_MAX = 31;
const ORE_DA_CONTROLLARE = 12;

function trovaIndiceAttuale(orari, adesso) {
    let indiceAttuale = 0;
    for (let i = 0; i < orari.length; i++) {
        const oraArray = new Date(orari[i]);
        if (oraArray <= adesso) {
            indiceAttuale = i;
        } else {
            break;
        }
    }
    return indiceAttuale;
}

function valutaCondizioni(orari, temperature, pioggia, adesso = new Date(), opzioni = {}) {
    const sogliaPioggia = opzioni.sogliaPioggia ?? SOGLIA_PIOGGIA_MM;
    const tempMin = opzioni.tempMin ?? TEMP_MIN;
    const tempMax = opzioni.tempMax ?? TEMP_MAX;
    const oreDaControllare = opzioni.oreDaControllare ?? ORE_DA_CONTROLLARE;

    const indiceAttuale = trovaIndiceAttuale(orari, adesso);

    const finestraOrari = orari.slice(indiceAttuale, indiceAttuale + oreDaControllare);
    const finestraTemp = temperature.slice(indiceAttuale, indiceAttuale + oreDaControllare);
    const finestraPioggia = pioggia.slice(indiceAttuale, indiceAttuale + oreDaControllare);

    let allertaAttiva = false;
    const motivi = [];

    for (let i = 0; i < finestraOrari.length; i++) {
        if (finestraPioggia[i] > sogliaPioggia) {
            allertaAttiva = true;
            motivi.push(`Pioggia prevista alle ${finestraOrari[i]}: ${finestraPioggia[i]}mm`);
        }
        if (finestraTemp[i] < tempMin || finestraTemp[i] > tempMax) {
            allertaAttiva = true;
            motivi.push(`Temperatura fuori range alle ${finestraOrari[i]}: ${finestraTemp[i]}°C`);
        }
    }

    return {
        condizioniOk: !allertaAttiva,
        motivi,
        finestraOraria: finestraOrari,
        temperature: finestraTemp,
        pioggia: finestraPioggia
    };
}

module.exports = { valutaCondizioni, trovaIndiceAttuale };