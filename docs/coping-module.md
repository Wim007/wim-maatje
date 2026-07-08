# Module "Porno als coping"

Zelfhulpmodule binnen Wim-maatje voor compulsief pornogebruik als copinggedrag bij stress, schaamte, leegte, eenzaamheid, afwijzing en ADHD-gerelateerde emotieregulatieproblemen. Bedoeld als wachtlijst-overbrugging — **geen** vervanging van GGZ-behandeling of diagnostiek.

## Wat de module doet

- **Entry**: intent-detectie in de chat (`src/coping/intents.js`) plus een handmatige knop/chip "Porno-drang hulp" (chat-chip en knop in het tabblad **Drang**). Expliciete drang activeert de module voor de rest van de sessie; zachtere signalen ("ik ga stuk", "ik wil verdoven") geven de assistent alleen een hint om de hulp één keer aan te bieden.
- **Vaste volgorde**, afgedwongen via het promptblok (`src/coping/prompt.js`):
  1. eerst reguleren, 2. dan labelen, 3. dan functie onderzoeken, 4. dan één alternatieve actie (< 5 min, max 3 opties), 5. kort evalueren.
- **Check-in** (max 5 vragen, één per beurt) met routing op drangscore: 8–10 → direct urge-interrupt, 5–7 → eerst korte regulatie, 0–4 → reflectie mag uitgebreider.
- **Urge-interrupt** (2–4 min, microstappen): stop/device weg → 4 ademhalingen → "dit is een urge, geen opdracht" → 1 frictie-actie → check gezakt/gelijk/hoger.
- **Cognitieve herstructurering**: vaste reframes (erkenning → herformulering → concrete stap) voor gedachten als "één keer maakt niet uit" en "ik ben zwak".
- **Logging als patroon** (tabblad Drang): datum/tijd, drangscore voor/na, emotie- en triggercategorie, interventie, uitkomst, terugval ja/nee, notitie van max 1 zin. Patroonoverzicht over 90 dagen: top-triggers, emoties, dagdelen en welke interventies het vaakst helpen. Dit overzicht gaat ook compact mee in de chatcontext.

## Wat de module niet doet

- Geen diagnose, geen therapie, geen traumabehandeling, geen beloftes over uitkomsten.
- Geen opslag of bespreking van pornografische/seksuele details — de server (`sanitizeEpisode`) staat alleen categorieën, scores en een korte notitie toe; de samenvattingsprompt sluit expliciete details uit.
- Geen moralistische framing: porno wordt behandeld als (mogelijk disfunctionele) regulatiestrategie, niet als "slecht seksueel gedrag". Verboden frames: vies, fout, zondig, "gewoon discipline", "sex addict" als identiteit, zwak, mislukt.
- Geen bagatellisering: bij een aanhoudend compulsief patroon verwijst de assistent rustig naar huisarts / seksuoloog / GGZ.
- **Escalatie**: bij suïcidaliteit, zelfbeschadiging, dissociatie/extreme ontregeling, gevaar voor anderen of ernstige depressieve ontregeling stopt de flow en volgt de korte escalatie-instructie (huisarts/crisisdienst, 113 of 0800-0113, vertrouwd persoon, niet alleen blijven). `src/safety.js` detecteert deze signalen ook regex-matig en toont de support card.

## Evidence-based principes

- **CBT / terugvalpreventie** voor compulsief seksueel gedrag: trigger-monitoring, stimulus control (frictie-acties), cognitieve herstructurering, terugval als leermoment.
- **Urge surfing** (mindfulness-based relapse prevention): de drang als golf die vanzelf zakt.
- **ADHD & emotieregulatie**: externe structuur boven zelfinzicht, eerst gedrag dan cognitie, korte blokken, weinig keuzes, herhaling van dezelfde logica, "klein maken".
- **Hechting/trauma als copinglaag**: de functie-flow onderzoekt wat porno probeert te reguleren (verdoving, troost, controle, zelfverlating) — zonder trauma te "behandelen".
- Verder: psycho-educatie, grounding, gedragsactivatie, zelfcompassie.

## Architectuur

```
src/coping/
├── flows.js    # Bron van waarheid: fasen, categorieën, check-in, urge-interrupt,
│               # functievragen, reframes, escalatie, taalregels
├── prompt.js   # Zet flows om in het promptblok (actief) + aanbied-hint (mogelijk)
├── intents.js  # Intent-detectie: 'direct' | 'mogelijk' | null
└── index.js    # Entry: detectie, episode-validatie, patroonanalyse, contextsamenvatting
```

Integratiepunten (bewust minimaal, breekt niets bestaands):

| Plek | Wijziging |
|---|---|
| `server.js` | intent-detectie in `/api/chat` + routes `/api/coping/episodes` (GET/POST/PATCH) en `/api/coping/patterns` |
| `src/openai.js` | coping-promptblok in het dynamische contextblok; privacyregel in de samenvattingsprompt |
| `src/store.js` | nieuwe collectie `coping_episodes` |
| `src/safety.js` | extra patronen voor zelfbeschadiging en dissociatie |
| `public/*` | chip "Porno-drang hulp", tabblad **Drang** (logformulier + patronen) |

### Datamodel `coping_episodes`

| Veld | Type | Toelichting |
|---|---|---|
| `id`, `ts`, `date` | string | uuid, ISO-timestamp, YYYY-MM-DD |
| `urgeBefore`, `urgeAfter` | 0–10 of null | drangscore voor/na |
| `emotion` | enum | stress, schaamte, leegte, eenzaamheid, afwijzing, boosheid, verveling, overprikkeling, verdriet, anders |
| `trigger` | enum | afwijzing, conflict, eenzaamheid, stress-werk, verveling, slaaptekort, schaamte-spiraal, overprikkeling, nacht-wakker, anders |
| `intervention` | enum | zie `INTERVENTIONS` in flows.js |
| `outcome` | enum/null | gezakt, gelijk, hoger |
| `relapse` | bool/null | terugval ja/nee |
| `note` | string ≤ 140 | 1 zin, geen details |

## Later uitbreiden

- **Nieuwe interventies/triggers/emoties**: alleen toevoegen aan de lijsten in `flows.js`; prompt, validatie en frontend-selects volgen automatisch.
- **Nieuwe reframes**: object toevoegen aan `REFRAMES` in `flows.js`.
- **Andere intents**: patronen toevoegen in `intents.js`.
- **Rijkere patroonanalyse** (weekdag, drang-verloop): uitbreiden in `buildPatterns` (`index.js`); de API-vorm blijft gelijk.
- **Automatisch loggen vanuit de chat**: structured-output extractie na sessieafsluiting kan naast het handmatige formulier, met hetzelfde `sanitizeEpisode`-filter.
