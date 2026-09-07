module.exports = {
    flowFile: 'flows.json',

    // Espone i moduli di logica/ (montati in sola lettura su /data/logica)
    // agli stessi function node già usati nel deployment reale su Termux,
    // così Node-RED richiama sempre lo stesso codice testato, indipendentemente
    // da dove gira (telefono o container).
    functionGlobalContext: {
        Controllo_Meteo: require('/data/logica/allerta-meteo.js')
        // aggiungere qui i prossimi moduli man mano che vengono creati, es.:
        // rilevamentoRientro: require('/data/logica/rilevamento-rientro.js')
    }
};