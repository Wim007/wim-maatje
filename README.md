# Wim-maatje

Een persoonlijke, rustige, evidence-aware webapp die Wim helpt met slaap, stress, emotionele belasting, focus en zelfzorg. Geen wellness-app, geen therapy bot — een klein regulatie- en structuurmaatje.

## Snel starten

```bash
cd wim-maatje
npm install
cp .env.example .env     # vul OPENAI_API_KEY in
npm start                # → http://localhost:3100
```

Zonder API-key start de app gewoon; alleen de chat geeft dan een nette melding. Slaaplog, dagstatus, doelen en instellingen werken altijd.

## Wat zit erin (MVP)

- **Chat** met Wim-maatje (OpenAI API), quick chips voor de vaste flows: nacht/wakker, ochtend check-in, middag reset, avond afsluiten
- **Spraak**: microfoon (Web Speech API, nl-NL) en voorlezen per bericht (TTS), met nette fallback als de browser het niet ondersteunt
- **Slaaplog**: bedtijd, geschatte slaap, nachtelijk wakker, opstatijd, notitie + weekoverzicht
- **Dagstatus**: energie, stress, stemming, focus (1–10) per dag
- **Doelen**: titel, categorie, status, check-ins; de assistent komt er vanzelf op terug
- **Drang / Porno als coping**: intent-detectie + knop "Porno-drang hulp", vaste flow (reguleren → labelen → functie → één alternatief → evalueren), episode-logging als patroon en patroonoverzicht — zie [docs/coping-module.md](docs/coping-module.md)
- **Agenda + ochtendbriefing**: Google-agenda koppelen (alleen lezen), één rustig dagoverzicht per dag in het tabblad *Vandaag*, met optionele pushmelding op je telefoon (PWA). Eén moment per dag, verder stil — zie [docs/agenda-connector.md](docs/agenda-connector.md)
- **Geheugen**: per afgerond gesprek een korte samenvatting + memory items, gebruikt in de context van volgende gesprekken
- **Geschiedenis**: eerdere gesprekken teruglezen
- **Veiligheid**: detectie van zorgwekkende signalen → kalme reactie + support card (113, huisarts/POH-GGZ)
- **Bronnenbeleid**: vaste lijst goedgekeurde broncategorieën (NHG, Thuisarts, Hersenstichting, ARQ, …), voorbereid op bronlabels/RAG

## Architectuur

```
wim-maatje/
├── server.js            # Express-server + API-routes
├── src/
│   ├── openai.js        # OpenAI API: chatantwoord + sessiesamenvatting (structured output)
│   ├── systemPrompt.js  # Vaste system prompt (gedragsregels Wim-maatje)
│   ├── safety.js        # Safety-detectie (acuut / verhoogd)
│   ├── sources.js       # Goedgekeurde bronnen
│   ├── store.js         # JSON-opslag (data/db.json, atomair schrijven)
│   └── coping/          # Module "Porno als coping" (flows, prompt, intents, logging)
├── public/              # Frontend (vanilla HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/db.json         # Lokale data (gitignored)
```

### Datamodel (data/db.json)

| Entiteit | Velden |
|---|---|
| `settings` | name, tts, stt, darkMode, preferences |
| `sessions` | id, date, startedAt, closedAt, summary |
| `messages` | id, sessionId, role, content, ts |
| `goals` | id, title, category, status, startDate, notes, lastCheckin |
| `memory_items` | id, date, text, sessionId |
| `sleep_logs` | id, date, bedtime, sleepHours, wokeNight, wakeTime, note |
| `daily_checkins` | id, date, energy, stress, mood, focus |
| `coping_episodes` | id, ts, date, urgeBefore, urgeAfter, emotion, trigger, intervention, outcome, relapse, note |

### Contextopbouw (compact, niet de ruwe historie)

Per chatbeurt krijgt het model: de vaste system prompt (gecachet) + een dynamisch blok met naam, moment van de dag, actieve doelen, laatste ~10 memory items, samenvatting van de vorige sessie en de laatste slaaplog + de laatste 20 berichten van de huidige sessie.

## Versie 2 — suggesties

- Nachtmodus die tussen 23:00–06:00 automatisch een extra rustige UI en nachtflow voorstelt
- Echte RAG op de goedgekeurde bronnen met bronlabels per antwoord
- Wekelijkse reflectie: trends uit slaaplog + dagstatus, besproken door Wim-maatje
- Doel-follow-up op schema ("elke avond vragen hoe het afsluiten ging")
- Streaming antwoorden en betere TTS-stemmen (bv. server-side TTS)
- SQLite in plaats van JSON zodra de data groeit
- PWA/installatie op telefoon + optionele zachte reminder voor avondafsluiting
