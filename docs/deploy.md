# Wim-maatje altijd-aan hosten

Voor een echte ochtendmelding (die aankomt zónder dat je de app opent) moet de app op een **altijd-aan** plek draaien. Dit is de klaargezette handleiding. De app is er nu klaar voor: je hoeft alleen te deployen en een paar instellingen te zetten.

## Drie harde eisen aan de host

1. **Altijd aan (geen slaapstand).** Gratis tiers die "in slaap vallen" missen de 08:00-melding — niet gebruiken voor dit doel.
2. **Persistente opslag.** De app bewaart je Google-tokens, meldingen en logs in een bestand (`data/db.json`). Op veel hosts wordt de schijf bij elke herstart gewist → dan raak je je koppeling elke keer kwijt. Los dit op met een **persistente schijf** en zet `WIM_DATA_DIR` naar dat pad.
3. **HTTPS.** Nodig om de app op je telefoon te installeren (PWA) en om pushmeldingen te laten werken. Bijna elke host geeft automatisch HTTPS op zijn eigen domein.

## Omgevingsvariabelen die je op de host zet

| Variabele | Waarde |
|---|---|
| `OPENAI_API_KEY` | je OpenAI-sleutel (voor de chat) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | uit de Google Cloud Console (zie `docs/agenda-connector.md`) |
| `GOOGLE_REDIRECT_URI` | `https://JOUW-DOMEIN/api/google/callback` — en zet exact dezelfde URI in de Google Cloud Console |
| `PUSH_CONTACT` | `mailto:jouw@e-mail.nl` |
| `WIM_DATA_DIR` | het pad van je persistente schijf, bijv. `/data` |
| `PORT` | zet de host meestal zelf; de app luistert op `process.env.PORT` |

## Optie A — Render (simpelst, ~$7/mnd)

1. Maak een account op [render.com] en klik **New → Web Service**, koppel de GitHub-repo `Wim007/wim-maatje`.
2. Runtime: Node. Build command: `npm install`. Start command: `node server.js` (of laat de `Procfile` het werk doen).
3. Kies het **Starter**-plan (valt niet in slaap). *Niet* de gratis tier — die slaapt én wist de schijf.
4. **Add Disk**: mount path `/data` (klein volstaat, 1 GB). Zet daarna `WIM_DATA_DIR=/data` bij de environment variables.
5. Vul de overige env-variabelen uit de tabel in.
6. Deploy. Je krijgt een `https://…onrender.com`-adres. Zet dat in `GOOGLE_REDIRECT_URI` én in de Google Cloud Console als redirect-URI.
7. Open het adres op je telefoon → op het startscherm zetten → koppel de agenda en zet meldingen aan.

## Optie B — Eigen VPS (goedkoopst, ~€4/mnd, iets meer werk)

Bijvoorbeeld Hetzner (CX22) of een kleine DigitalOcean/Vultr-server:
1. Node 18+ installeren, repo clonen, `npm install`.
2. `.env` invullen (zie tabel), `WIM_DATA_DIR` naar bijv. `/home/wim/wim-data`.
3. Met **pm2** draaien zodat het altijd aan blijft en herstart na reboot: `pm2 start server.js --name wim-maatje && pm2 save && pm2 startup`.
4. HTTPS via **Caddy** (regelt automatisch een certificaat): één regel `jouw-domein { reverse_proxy localhost:3100 }`.
5. `GOOGLE_REDIRECT_URI` op `https://jouw-domein/api/google/callback` + dezelfde URI in de Google Cloud Console.

## Volgorde die ik aanraad

1. Host kiezen en deployen (A of B).
2. Domein/URL bekend → agenda koppelen (de agent-prompt in `docs/agent-prompt-agenda-koppeling.md` gebruikt die URL).
3. App op je telefoon installeren → meldingen aanzetten → testmelding.

> Kosten laag houden? Optie B (VPS ~€4/mnd) is het goedkoopst en meteen persistent. Optie A is de minste moeite. Beide voldoen aan de drie eisen; gratis tiers niet.
