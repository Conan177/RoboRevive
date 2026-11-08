const SOLO_CIFRE = /^\d+$/;

function risolviIntervalloS(valoreGrezzo, { defaultS, minS, maxS }) {
  const formaValida = SOLO_CIFRE.test(valoreGrezzo);
  const numero = Number(valoreGrezzo);
  const valido = formaValida && numero >= minS && numero <= maxS;
  return {
    valore: valido ? numero : defaultS,
    usatoDefault: !valido,
  };
}

module.exports = { risolviIntervalloS };