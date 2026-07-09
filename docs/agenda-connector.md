# Agenda-koppeling + ochtendbriefing (stage 1)

Deze module koppelt je Google-agenda (alleen lezen) en levert één rustig moment per dag: een **ochtendbriefing** in de app, met — als je dat instelt — een pushmelding op je telefoon. Verder is het stil: geen meldingen de hele dag, geen melding per afspraak.

## Wat het doet

- **Agenda lezen** via Google OAuth (één account). Je kiest zelf welke agenda's meetellen; verjaardag-/feestdagagenda's staan standaard uit.
- **Ochtendbriefing** (tabblad *Vandaag*): de afspraken van vandaag + waar je aan werkt (actieve doelen), kort en ADHD-proof. Bij een volle dag vat hij samen in plaats van alles op te sommen.
- **Eén moment per dag**: een scheduler genereert de briefing op het ingestelde tijdstip (standaard 08:00).
- **Melding-tot-gelezen** (tegen vluchtgedrag): de pushmelding blijft staan en komt elke `nagIntervalMin` minuten (standaard 20) terug, tot je in de app op **"Gelezen"** tikt óf tot `nagUntil` (standaard 11:00) — daarna rust. Wegvegen helpt dus niet; de enige manier om ervan af te komen is 'm lezen. Instelbaar bij **Instellingen → Ochtendbriefing**.
- **Pushmelding** via een geïnstalleerde PWA op je telefoon (web-push).

> Een telefoon staat niet toe dat een melding écht onwegveegbaar op je scherm blijft (dat blokkeert het besturingssysteem). De melding is daarom "sticky" (blijft in je meldingenbalk staan) en komt telkens terug tot je 'm gelezen hebt — dat bereikt hetzelfde doel.

## Wat het (nog) niet doet

- **Schrijven in de agenda** — deze stage is alleen-lezen. Afspraken inplannen komt later (scope `calendar.events` erbij).
- **E-mail/facturen** — dat is stage 2.
- De pushmelding vuurt **alleen als de server draait** op het ingestelde tijdstip (zie *Waar draait het* hieronder).

## Eenmalige Google-setup (door jou)

1. Ga naar de [Google Cloud Console](https://console.cloud.google.com/) → maak een project.
2. **APIs & Services → Enabled APIs** → zet de **Google Calendar API** aan.
3. **OAuth consent screen**: kies *External*, vul app-naam + jouw e-mail in. Voeg jezelf toe als *Test user*. (Voor persoonlijk gebruik hoef je niet te publiceren; klik desnoods door het "niet-geverifieerd"-scherm.)
4. **Credentials → Create credentials → OAuth client ID** → type *Web application*.
   - **Authorized redirect URI**: exact `http://localhost:3100/api/google/callback` (lokaal) of `https://JOUW-DOMEIN/api/google/callback` (server).
5. Kopieer **Client ID** en **Client Secret** naar `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3100/api/google/callback
   ```
6. Herstart de server. Ga in de app naar **Instellingen → Agenda → Agenda koppelen** en log in met Google.

> Blijft de app op "Testing" staan bij Google, dan verloopt de koppeling elke 7 dagen en moet je opnieuw koppelen. Zet de app op "In productie" (voor de agenda-scope mag dat voor persoonlijk gebruik) om dat te voorkomen — €0, geen verificatie nodig.

## Pushmeldingen aanzetten (op je telefoon)

1. Open de app op je telefoon en **zet 'm op je startscherm** (installeren als app).
2. Open de geïnstalleerde app → **Instellingen → Meldingen → Meldingen aanzetten** → geef toestemming.
3. Test met **Testmelding**.

VAPID-sleutels worden automatisch gegenereerd en in `data/db.json` bewaard; je hoeft niets in te stellen behalve eventueel `PUSH_CONTACT` in `.env`.

## Waar draait het (belangrijk)

De ochtendmelding vuurt alleen als de server op het ingestelde tijdstip draait:

- **Altijd-aan host** (VPS, Raspberry Pi, kleine cloud-dienst): de 08:00-melding werkt elke ochtend vanzelf. Zet `GOOGLE_REDIRECT_URI` op je echte domein en voeg diezelfde URI toe in de Google Cloud Console.
- **Alleen je laptop**: de briefing staat klaar zodra je de app 's ochtends opent; de push kan niet vóórdat de server aanstaat.

## Instellingen

- **Instellingen → Ochtendbriefing aan** + **Tijd van de ochtendbriefing** (standaard 08:00).
- **Instellingen → Agenda**: koppelen/ontkoppelen en welke agenda's meetellen.

## Architectuur

```
src/connectors/google-calendar/
├── oauth.js      # OAuth-flow, tokenopslag + automatische refresh (fetch, geen SDK)
├── calendar.js   # agenda's oplijsten + afspraken van vandaag (genormaliseerd)
└── index.js      # entry
src/briefing/index.js   # briefing samenstellen (deterministisch, ADHD-kort)
src/push/index.js       # web-push: VAPID, subscriptions, versturen
src/scheduler.js        # tikt elke minuut; briefing + push op het ingestelde tijdstip, 1×/dag
public/manifest.json, service-worker.js, icon.svg   # PWA + pushweergave
```

Integratiepunten in de bestaande app:

| Plek | Wijziging |
|---|---|
| `server.js` | routes `/api/google/*`, `/api/briefing/*`, `/api/push/*`; scheduler gestart |
| `src/store.js` | velden `google`, `push_subscriptions`, `vapid`, `briefings`, `briefing_state`; settings `briefingTime`/`briefingEnabled` |
| `public/*` | tabblad *Vandaag*, agenda- en meldingen-blok in instellingen, PWA-registratie |

### Datamodel (nieuw)

| Sleutel | Inhoud |
|---|---|
| `google.tokens` | `{access_token, refresh_token, expiry, scope}` (in gitignored `data/db.json`) |
| `google.email` | gekoppeld account (ter herkenning) |
| `google.calendars` | `[{id, summary, primary, selected}]` |
| `push_subscriptions` | web-push subscriptions per telefoon |
| `vapid` | `{publicKey, privateKey}` — eenmalig gegenereerd |
| `briefings` | `[{id, date, generatedAt, text, items}]` |
| `briefing_state.lastRunDate` | borgt max. één automatische briefing per dag |

## Later uitbreiden

- **Schrijven / afspraken inplannen**: scope `https://www.googleapis.com/auth/calendar.events` toevoegen in `oauth.js` en een `createEvent` in `calendar.js`.
- **Stage 2 (e-mail + facturen)**: aparte connector die één keer per ochtend scant en resultaten in dezelfde briefing toont.
- **LLM-gepolijste toon**: de briefing is nu deterministisch (robuust om 08:00). Optioneel kan er een korte, warme openingszin door het model gegenereerd worden.
- **Betere PWA-iconen**: nu één SVG; PNG-iconen (192/512) voor scherpere weergave op iOS.
