# Overdrive Nav — Web

Competitor brand in the truck-safe fleet navigation category. Next.js 15 + HERE Maps.

## Local dev

```bash
npm install
cp .env.example .env.local   # then paste your rotated HERE_API_KEY
npm run dev
```

Open http://localhost:3000.

## Deploy to a VPS

Requirements on the VPS: Docker + docker-compose + a domain pointing at it.

```bash
# on the VPS, first time only
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
mkdir -p /opt/overdrive

# from your laptop
export DOMAIN=overdrive.yourdomain.com
cp .env.example .env && $EDITOR .env   # set real keys + DOMAIN
./deploy.sh root@your-vps-ip /opt/overdrive
```

Caddy handles TLS automatically via Let's Encrypt. Site is live at your domain.

## Environment

- `HERE_API_KEY` — server-side routing/geocoding (kept off the wire)
- `NEXT_PUBLIC_HERE_API_KEY` — used only for map tile rendering in the browser; use a **restricted key** (referer-locked to your domain) here, not the same one as above
- `DOMAIN` — used by Caddy for auto-HTTPS

## Architecture

- `app/page.tsx` — landing
- `app/dashboard/page.tsx` — fleet map (mock data)
- `app/plan/page.tsx` — route planner UI
- `app/api/route/route.ts` — server-side HERE Routing v8 wrapper with truck profile
- `app/api/trucks/route.ts` — mock fleet feed
- `lib/here.ts`, `lib/risk.ts`, `lib/mock-fleet.ts`
- `components/HereMap.tsx` — HERE Maps JS API wrapper
