# Instructie-prompt: agenda-koppeling laten regelen door een AI-agent

Hieronder staat een kant-en-klare prompt die je aan een AI-agent (met toegang tot een webbrowser en de projectbestanden) kunt geven. De agent regelt de Google-agenda-koppeling van Wim-maatje van begin tot eind. Kopieer alles tussen de lijnen.

---

**TAAK: Koppel de Google-agenda aan de app "Wim-maatje" (alleen lezen).**

Je bent een AI-agent die een webbrowser kan bedienen en de projectbestanden van Wim-maatje kunt bewerken. Je doel: zorgen dat de app de Google-agenda van de gebruiker kan uitlezen. Dit is een **configuratietaak** — je hoeft geen applicatiecode te wijzigen.

**Achtergrond over de app (niet aanpassen):**
- Node/Express-app "Wim-maatje", GitHub-repo `Wim007/wim-maatje`.
- De app leest de Google-agenda via OAuth 2.0 en heeft drie omgevingsvariabelen nodig in het bestand `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- De app vraagt de juiste rechten al zelf op tijdens het inloggen (alleen-lezen agenda + e-mailadres). Je hoeft nergens scopes hard te coderen.
- De OAuth-terugkoppel-URL (callback) is: `<APP_URL>/api/google/callback`.

**Wat je vooraf nodig hebt (vraag het de gebruiker als het ontbreekt):**
- Op welk Google-account (e-mailadres) de agenda staat.
- De publieke URL van de app zodra die gehost is (bijv. `https://wim-maatje.voorbeeld.nl`). Draait de app voorlopig alleen lokaal, gebruik dan `http://localhost:3100`.

**Stappen:**
1. Ga naar de Google Cloud Console (`https://console.cloud.google.com/`) en maak een nieuw project, bijv. "Wim-maatje".
2. **APIs & Services → Library →** zet de **Google Calendar API** aan voor dit project.
3. **OAuth consent screen**: kies *External*. App-naam: "Wim-maatje". Support-e-mail: het e-mailadres van de gebruiker. Voeg het e-mailadres van de gebruiker toe als **Test user**. (Op "Testing" laten mag; meld de gebruiker dat de koppeling dan elke 7 dagen vernieuwd moet worden. Naar "In production" zetten voorkomt dat — voor persoonlijk gebruik met alleen de agenda-scope mag dat, geen verificatie of kosten nodig.)
4. **Credentials → Create credentials → OAuth client ID → Application type: Web application.**
   - Voeg onder **Authorized redirect URIs** exact toe: `<APP_URL>/api/google/callback`.
   - Weet je de definitieve URL nog niet zeker? Voeg dan zowel de productie-URL als `http://localhost:3100/api/google/callback` toe. Redirect-URI's kun je later altijd aanpassen.
5. Kopieer de **Client ID** en het **Client secret**.
6. Zet ze in het bestand `.env` in de projectmap (maak het aan vanuit `.env.example` als het nog niet bestaat):
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=<APP_URL>/api/google/callback
   ```
   Commit `.env` **niet** (het staat in .gitignore). Zet het secret nooit in git, in een pull request, of in chatlogs.
7. Herstart de app zodat de nieuwe omgevingsvariabelen geladen worden.
8. **Koppelen:** open de app → **Instellingen → Agenda → "Agenda koppelen"**. Dit moet gebeuren terwijl de gebruiker zelf is ingelogd op zijn Google-account — het is zíjn toestemming. Doorloop de Google-login en geef toegang. De app stuurt daarna terug met de melding "gekoppeld" en toont de agenda's.
9. **Controleer:** roep `<APP_URL>/api/google/status` aan; het antwoord moet `"connected": true` bevatten en een niet-lege lijst `calendars`. Genereer eventueel een testbriefing met een POST naar `<APP_URL>/api/briefing/generate` en controleer dat de agenda-afspraken nu verschijnen.

**Grenzen / veiligheid:**
- De toestemming in stap 8 is de keuze van de gebruiker. Ben je (de agent) niet gemachtigd om in zijn Google-account te handelen? Stop dan na stap 7 en geef de exacte link + instructie terug zodat de gebruiker stap 8 zelf afmaakt.
- Secrets blijven alleen in `.env`. Log of commit ze nooit.
- Wijzig geen applicatiecode — dit is een configuratietaak.

**Klaar wanneer:** `/api/google/status` toont `connected: true` én de ochtendbriefing laat de afspraken van vandaag zien.

---

## Handig om te weten

- De app **start ook zonder** deze credentials; alleen de agenda-koppeling wacht dan nog. Er kan dus niets stukgaan door dit later te doen.
- Wil je hetzelfde voor de always-on host laten doen door een agent? Zie `docs/deploy.md` voor de deploy-stappen; die kun je op dezelfde manier tot een hand-off-prompt maken.
