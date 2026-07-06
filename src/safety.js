// Eenvoudige safety-detectie op gebruikersberichten.
// Twee niveaus:
//  - 'acuut': directe zorgwekkende signalen -> support card tonen + extra instructie in context
//  - 'verhoogd': herhaald extreem slaaptekort / stress / wanhoop in recente berichten

const ACUTE_PATTERNS = [
  /su[ïi]cid/i,
  /zelfdoding/i,
  /zelfmoord/i,
  /er niet meer (willen |wil |)zijn/i,
  /niet meer (verder |door)(kunnen|willen)/i,
  /(een )?einde (aan|eraan) (willen )?maken/i,
  /dood (willen|wil)/i,
  /geen uitweg/i,
  /iedereen beter af zonder mij/i
];

const ELEVATED_PATTERNS = [
  /wanhoop|wanhopig/i,
  /geen grip( meer)?/i,
  /kan (het |dit |)niet meer( aan)?/i,
  /(totaal|volledig|helemaal) (op|uitgeput|kapot)/i,
  /bijna niet geslapen/i,
  /al (dagen|nachten) (niet|nauwelijks) (geslapen|slapen)/i,
  /stress.*(10|tien)\b/i,
  /instort|stort in/i
];

function scanMessage(text) {
  if (ACUTE_PATTERNS.some((p) => p.test(text))) return 'acuut';
  if (ELEVATED_PATTERNS.some((p) => p.test(text))) return 'verhoogd';
  return null;
}

// Kijk naar de laatste gebruikersberichten (over sessies heen) om herhaling te zien.
function assess(currentText, recentUserMessages) {
  const current = scanMessage(currentText);
  if (current === 'acuut') return 'acuut';

  const recentHits = recentUserMessages
    .slice(-10)
    .filter((m) => scanMessage(m) !== null).length;

  if (current === 'verhoogd' && recentHits >= 2) return 'acuut';
  if (current === 'verhoogd' || recentHits >= 3) return 'verhoogd';
  return null;
}

const SAFETY_INSTRUCTION = {
  acuut:
    'LET OP: het huidige bericht bevat zorgwekkende signalen (wanhoop of gedachten aan zelfdoding, of aanhoudende ontregeling). Reageer kalm en warm, erken kort wat er is, geen paniek en geen preek. Adviseer rustig om contact op te nemen met de huisarts of POH-GGZ, en noem 113 Zelfmoordpreventie (bel 113 of 0800-0113, chat via 113.nl). Bied daarna één kleine, haalbare stap voor dit moment.',
  verhoogd:
    'LET OP: er zijn herhaalde signalen van hoge stress, uitputting of somberheid in recente berichten. Wees extra rustig en begrenzend. Overweeg te benoemen dat dit iets is om met de huisarts of POH-GGZ te bespreken, zonder druk.'
};

module.exports = { assess, SAFETY_INSTRUCTION };
