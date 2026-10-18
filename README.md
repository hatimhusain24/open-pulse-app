# Open Pulse

A live dashboard of free public data: weather, air quality, crypto and currency markets, earthquakes and natural events, the International Space Station, world economies, tech news and Wikipedia.

The dashboard runs in the visitor's browser: one page, `index.html`, with no build step, no sign-up and no API key. A small optional server in `api/` (Vercel functions) sends alerts as push notifications when the site is closed.

## What it shows

| View | Data | Refreshes |
|---|---|---|
| Overview | A daily briefing and one card per area | Follows each source |
| My dashboard | The cards you pin, in your order, plus alerts | Follows each source |
| Weather | Current conditions, next 48 hours, week ahead, and this week against the 1991–2020 normal | 10 min |
| Air quality | Pollutant breakdown, best time to go outside, 5-day forecast, up to 8 places compared, 3-month calendar | 30 min (15 min for places) |
| Markets | Top 20 cryptocurrencies with 7-day charts, whole-market stats, a 30-currency converter and rate history | 2 min (crypto), hourly (rates) |
| Earth events | Earthquakes (map, list, magnitude chart) and NASA's open wildfires, storms, volcanoes and ice events | 2 min (quakes), 30 min (events) |
| Space | Live ISS position and orbit, space weather (Kp index, NOAA scales, solar flares) and the next rocket launches | 5 s (ISS), 15 min, 1 h |
| Economy | 12 World Bank measures since 1990 for up to six countries or regions | 6 h |
| Countries | One country's key figures, capital weather and air, currency rate, public holidays and long weekends | 15 min to 12 h |
| Tech news | Hacker News top, new, best, Ask HN and Show HN | 5 min |
| Wikipedia | Most-read articles, featured article, picture of the day, news, on this day | Hourly |

## Features

- **My dashboard:** pin any card from any page, reorder by dragging or with the arrow buttons.
- **Best time to go outside:** the two daylight hours with the cleanest air, ruling out likely rain, very high UV and extreme heat.
- **Alerts** while a tab is open: air quality above a limit, a strong earthquake, or a big price move. Shown on the page and as browser notifications if allowed.
- **Share links:** the Share button copies a link that opens the same page for the same place, e.g. `?place=Delhi&lat=28.6139&lon=77.209#air`. `?city=London` also works.
- **Install as an app** on phone or desktop, and see the last saved data when offline.
- **Search** with Ctrl+K (or /): pages, places, countries, coins, currencies and cards.
- **CSV download** on every card that holds data.
- **Background alerts** (server version): push notifications even with the site closed.

Visitors' choices (place, currency, saved places, pinned cards, alerts, theme) stay in their own browser's local storage and never leave it. "Use my location" rounds the position to about 1 km.

## Data sources

All free and keyless, called directly from the browser:

- [Open-Meteo](https://open-meteo.com/): forecast, geocoding, air quality (CAMS) and historical weather (ERA5) (CC BY 4.0)
- [NASA EONET](https://eonet.gsfc.nasa.gov/): open natural events
- [NOAA SWPC](https://www.swpc.noaa.gov/): Kp index, space weather scales, solar flares
- [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs: upcoming launches
- [Nager.Date](https://date.nager.at/): public holidays and long weekends
- Flags from [flagcdn.com](https://flagcdn.com/)
- [CoinGecko](https://www.coingecko.com/): crypto prices and market data (public API)
- [Frankfurter](https://frankfurter.dev/): European Central Bank reference rates
- [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/): GeoJSON feeds
- [Where the ISS at?](https://wheretheiss.at/): ISS position and ground track
- [World Bank Open Data](https://data.worldbank.org/): development indicators (CC BY 4.0)
- [Hacker News API](https://github.com/HackerNews/API)
- [Wikimedia Feed API](https://api.wikimedia.org/wiki/Feed_API)
- Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Libraries: [Chart.js](https://www.chartjs.org/) 4.4.1 and [Leaflet](https://leafletjs.com/) 1.9.4 from public CDNs

Free APIs have rate limits per visitor. If one is busy, its panel says so and tries again on its own.

## Run it locally

Any static file server works. With Python:

```bash
python -m http.server 8765
```

Then open http://localhost:8765.

## Deploy on Vercel

1. Import this repository on [vercel.com/new](https://vercel.com/new). Framework preset: **Other**. No build command.
2. **Storage:** in the project's **Storage** tab, add **Upstash Redis** (free plan). It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. **Environment variables** (Settings > Environment Variables): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`. See `.env.example`. Generate keys with `npx web-push generate-vapid-keys`.
4. Redeploy. Open `/api/config`: it should say `"push": true`.
5. **Schedule:** Vercel's free plan runs cron jobs once a day, so a GitHub Actions workflow (`.github/workflows/alerts.yml`) calls `/api/check` every 10 minutes. In the GitHub repo, add the secrets `ALERTS_CHECK_URL` (`https://<your-app>.vercel.app/api/check`) and `CRON_SECRET` (same value as on Vercel).

Without steps 2 to 5 the dashboard still works fully. Only background alerts stay off.

## Alert server

| Route | What it does |
|---|---|
| `GET /api/config` | Whether background alerts are available, and the public push key |
| `POST /api/subscribe` | Saves a browser's push subscription and its rules (AQI limit and place, earthquake magnitude, coin move) |
| `DELETE /api/subscribe` | Removes a subscription |
| `GET /api/check` | Needs `Authorization: Bearer <CRON_SECRET>`. Checks the data and sends each alert once |

It only sends to real browser push services, stores no names or emails, and forgets a browser as soon as its push service reports it gone.

## Disclaimer

Figures are for information only and may be delayed. Crypto prices are not investment advice.
