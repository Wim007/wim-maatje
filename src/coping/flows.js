// Module "Porno als coping" — gespreksflows en vaste keuzelijsten.
// Dit bestand is de bron van waarheid: prompt.js zet de flows om in
// prompttekst, de frontend gebruikt dezelfde categorieën voor logging.
//
// Uitgangspunt: porno wordt benaderd als (mogelijk disfunctionele)
// regulatiestrategie, niet als moreel probleem. Interventielogica volgt
// CBT/terugvalpreventie: monitoring, urge surfing, stimulus control,
// cognitieve herstructurering, zelfcompassie, grounding, gedragsactivatie.

// Vaste volgorde van de module. De assistent mag hier niet van afwijken.
const PHASES = ['reguleren', 'labelen', 'functie', 'alternatief', 'evalueren'];

// Emotiecategorieën voor check-in en logging.
const EMOTIONS = [
  'stress',
  'schaamte',
  'leegte',
  'eenzaamheid',
  'afwijzing',
  'boosheid',
  'verveling',
  'overprikkeling',
  'verdriet',
  'anders'
];

// Triggercategorieën voor logging (patronen, geen details).
const TRIGGERS = [
  'afwijzing',
  'conflict',
  'eenzaamheid',
  'stress-werk',
  'verveling',
  'slaaptekort',
  'schaamte-spiraal',
  'overprikkeling',
  'nacht-wakker',
  'anders'
];

// Frictie-acties en alternatieven (< 5 minuten). De assistent biedt er
// maximaal 3 tegelijk aan en laat er 1 kiezen.
const INTERVENTIONS = [
  { id: 'andere-kamer', label: 'Naar een andere kamer gaan' },
  { id: 'telefoon-weg', label: 'Telefoon wegleggen (andere kamer)' },
  { id: 'blocker', label: 'Website-blocker aanzetten' },
  { id: 'opstaan', label: 'Opstaan en scherm omdraaien' },
  { id: 'koud-water', label: 'Koud water over gezicht of polsen' },
  { id: 'squats', label: '20 squats of push-ups' },
  { id: 'lopen', label: '3 minuten lopen' },
  { id: 'ademen', label: '10 keer rustig ademen' },
  { id: 'douchen', label: 'Douchen' },
  { id: 'voice-note', label: 'Voice note inspreken: wat gebeurde er net?' },
  { id: 'appen', label: '1 persoon appen' },
  { id: 'muziek', label: 'Muziek opzetten en bewegen' },
  { id: 'notitie', label: 'Notitie maken: wat gebeurde er net?' },
  { id: 'thee', label: 'Scherm uit en thee zetten' },
  { id: 'slapen', label: 'Eerder naar bed' },
  { id: 'anders', label: 'Anders' }
];

// B. Check-in: ultrakort, max 5 vragen, één per beurt.
const CHECKIN = {
  questions: [
    'Hoe hoog is de drang, 0-10?',
    'Wat voel je nu vooral? (stress / schaamte / leegte / eenzaamheid / afwijzing / boosheid / verveling / overprikkeling / verdriet / anders)',
    'Wat gebeurde er vlak hiervoor?',
    'Ben je nu alleen?',
    'Wil je eerst kalmeren of eerst snappen wat er gebeurt?'
  ],
  routing: [
    { score: '8-10', action: 'Direct de urge-interrupt flow. Geen analyse, geen uitleg. Vraag 2-5 vervallen tot de drang gezakt is.' },
    { score: '5-7', action: 'Eerst korte regulatie (ademen + 1 frictie-actie), daarna pas labelen en functie.' },
    { score: '0-4', action: 'Reflectie mag uitgebreider: labelen, functie onderzoeken, patroon bespreken.' }
  ]
};

// C. Urge-interrupt: 2-4 minuten, microstappen, vaste volgorde.
const URGE_INTERRUPT = {
  steps: [
    'Stop. Leg je device weg of draai het scherm om.',
    'Adem 4 keer rustig. In door je neus, langzaam uit.',
    'Zeg (hardop of in je hoofd): "Dit is een urge, geen opdracht."',
    'Kies 1 frictie-actie: andere kamer / telefoon wegleggen / blocker aan / opstaan / koud water / 20 squats / 3 minuten lopen.',
    'Check daarna: is de drang gezakt, gelijk of hoger?'
  ],
  after: {
    gezakt: 'Kort bevestigen. Daarna eventueel labelen en functie, of gewoon afronden met 1 alternatieve actie.',
    gelijk: 'Nog een frictie-actie of urge surfing: de golf komt op en zakt vanzelf, meestal binnen 10-20 minuten. Blijf erbij zonder te handelen.',
    hoger: 'Herhaal stap 1-4 met een fysiekere actie (koud water, squats, naar buiten). Niet analyseren.'
  }
};

// D. Betekenis / functie — pas als de drang gezakt is (< 5).
const MEANING = {
  questions: [
    'Waar beschermt porno je nu tegen?',
    'Gaat dit meer over lust, verdoving, troost, controle, afleiding of jezelf verlaten?',
    'Welke pijn zit eronder: afwijzing, eenzaamheid, schaamte, leegte, overprikkeling, falen?',
    'Wat heb je eigenlijk nodig dat porno nu probeert over te nemen?'
  ],
  tone: 'Warm maar nuchter. Niet zweverig, niet therapeutisch opgeblazen. Eén vraag per beurt.'
};

// G. Cognitieve herstructurering: erkenning → herformulering → concrete stap.
const REFRAMES = [
  {
    thought: 'ik heb het nu nodig',
    acknowledge: 'Snap ik. Het voelt nu als een behoefte.',
    reframe: 'Dit is waarschijnlijk een stressreactie, geen behoefte. Drang piekt en zakt vanzelf.',
    step: 'Laten we 3 minuten winnen en dan opnieuw kijken.'
  },
  {
    thought: 'één keer maakt niet uit',
    acknowledge: 'Die gedachte hoort bij de drang zelf.',
    reframe: 'Het gaat niet om die ene keer, maar om het patroon dat je aan het doorbreken bent.',
    step: 'Doe eerst 1 frictie-actie. Daarna beslis je opnieuw.'
  },
  {
    thought: 'ik kan dit toch niet stoppen',
    acknowledge: 'Zo voelt het nu, dat klopt.',
    reframe: 'Je hoeft het niet te stoppen. Je hoeft alleen deze golf uit te zitten. Dat kan wél.',
    step: 'Adem 4 keer rustig. Meer hoeft nu niet.'
  },
  {
    thought: 'ik ben zwak',
    acknowledge: 'Dat is een hard oordeel op een zwaar moment.',
    reframe: 'Dit is geen zwakte maar een aangeleerd copingpatroon. Dat je hier nu mee bezig bent is het tegendeel van zwak.',
    step: 'Terug naar het nu: wat is de kleinste stap?'
  },
  {
    thought: 'ik heb niks anders',
    acknowledge: 'Op dit moment voelt dat zo.',
    reframe: 'Er is nu minstens één ander ding dat 5 minuten kost en je niet leger achterlaat.',
    step: 'Kies: 3 minuten lopen, douchen, of 1 persoon appen.'
  },
  {
    thought: 'ik wil gewoon even rust',
    acknowledge: 'Logisch. Je systeem staat vol.',
    reframe: 'Rust is een terechte behoefte. Porno geeft alleen kortstondige verdoving, geen rust.',
    step: 'Laten we rust regelen die wél werkt: scherm uit, thee, of eerder naar bed.'
  }
];

// I. Escalatie — korte instructies, geen flow meer.
const ESCALATION = {
  signals: [
    'suïcidaliteit',
    'zelfbeschadiging',
    'dissociatie of extreme ontregeling',
    'gevaar voor anderen',
    'duidelijke onveiligheid',
    'ernstige depressieve ontregeling'
  ],
  instructions: [
    'Stop de flow. Geen check-in, geen analyse.',
    'Neem nu contact op met je huisarts of de crisisdienst, of bel 113 (of 0800-0113, chat via 113.nl).',
    'Bel of app een vertrouwd persoon.',
    'Blijf niet alleen met de crisis.'
  ]
};

// J. Taal — verboden en voorkeurstermen.
const LANGUAGE = {
  forbidden: ['vies', 'fout', 'zondig', 'gewoon discipline hebben', 'sex addict (als identiteit)', 'zwak', 'mislukt'],
  preferred: ['drang', 'coping', 'stressreactie', 'patroon', 'reguleren', 'alternatief', 'terugval', 'kleine stap']
};

module.exports = {
  PHASES,
  EMOTIONS,
  TRIGGERS,
  INTERVENTIONS,
  CHECKIN,
  URGE_INTERRUPT,
  MEANING,
  REFRAMES,
  ESCALATION,
  LANGUAGE
};
