// Goedgekeurde broncategorieën voor bronbewust antwoorden.
// MVP: geen RAG, maar de structuur staat klaar:
// elk item heeft title, type, url en note (confidence/toelichting).

const SOURCES = [
  {
    id: 'nhg-slaap',
    title: 'NHG-richtlijn slaapproblemen',
    type: 'richtlijn',
    url: 'https://richtlijnen.nhg.org/standaarden/slaapproblemen-en-slaapmiddelen',
    note: 'Medische richtlijn voor huisartsen over slaapproblemen.'
  },
  {
    id: 'thuisarts-slaap',
    title: 'Thuisarts — slecht slapen',
    type: 'publieksinformatie',
    url: 'https://www.thuisarts.nl/slecht-slapen',
    note: 'Betrouwbare publieksuitleg en zelfzorgadviezen bij slaapproblemen.'
  },
  {
    id: 'hersenstichting-slaap',
    title: 'Hersenstichting — slaap',
    type: 'publieksinformatie',
    url: 'https://www.hersenstichting.nl/de-hersenen/slaap/',
    note: 'Uitleg over slaap en het brein.'
  },
  {
    id: 'gezonde-slaap',
    title: 'Richtlijnen gezonde slaap (slaaphygiëne)',
    type: 'richtlijn',
    url: 'https://www.thuisarts.nl/slecht-slapen/ik-wil-tips-om-beter-te-slapen',
    note: 'Algemene, breed aanvaarde slaaphygiëne-adviezen.'
  },
  {
    id: 'arq',
    title: 'ARQ — rouw en trauma',
    type: 'kenniscentrum',
    url: 'https://www.arq.org/',
    note: 'Nationaal kenniscentrum psychotrauma, rouw en verlies.'
  },
  {
    id: 'steun-bij-verlies',
    title: 'Steun bij Verlies',
    type: 'ondersteuning',
    url: 'https://www.steunbijverlies.nl/',
    note: 'Informatie en steun bij rouw en verlies.'
  },
  {
    id: 'hormonen',
    title: 'Algemene medische uitleg testosteron / hormonen',
    type: 'publieksinformatie',
    url: 'https://www.thuisarts.nl/',
    note: 'Alleen degelijke algemene uitleg; geen specifieke medische claims.'
  },
  {
    id: '113',
    title: '113 Zelfmoordpreventie',
    type: 'hulpdienst',
    url: 'https://www.113.nl/',
    note: 'Bel 113 of 0800-0113 (gratis), of chat via 113.nl. Dag en nacht bereikbaar.'
  }
];

module.exports = { SOURCES };
