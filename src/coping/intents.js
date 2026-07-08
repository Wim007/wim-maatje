// Intent-detectie voor de module "Porno als coping".
// Twee niveaus:
//  - 'direct': porno/drang expliciet genoemd of de handmatige knop gebruikt
//              -> module wordt actief voor de rest van de sessie
//  - 'mogelijk': ontregelingssignalen die bij dit patroon horen
//              -> assistent mag de drang-hulp één keer kort aanbieden

const DIRECT_PATTERNS = [
  /porno?\b/i,
  /porn\b/i,
  /\bdrang\b/i,
  /\burge\b/i,
  /drang[- ]?hulp/i
];

const POSSIBLE_PATTERNS = [
  /ik ga stuk/i,
  /ik trek (dit|het) niet( meer)?/i,
  /ik ben alleen en/i,
  /(wil|moet) (me |mezelf |)verdoven/i,
  /ik schaam me/i,
  /ik ben afgewezen/i,
  /afgewezen door/i,
  /ik wil ontsnappen/i,
  /ik wil (even |gewoon |)niks voelen/i,
  /ik voel me (zo |helemaal |)leeg/i
];

function detect(text) {
  if (DIRECT_PATTERNS.some((p) => p.test(text))) return 'direct';
  if (POSSIBLE_PATTERNS.some((p) => p.test(text))) return 'mogelijk';
  return null;
}

module.exports = { detect };
