# Deploy the detection server on Oracle Cloud (Always Free)

Result: `https://<name>.duckdns.org` runs the Dixon Watch server 24/7 with automatic HTTPS. Your laptop can be off.
No domain needed. Switching to your own domain later is in the last section.

## 1. Accounts (5 min)

- **Oracle Cloud:** <https://cloud.oracle.com> → *Start for free*. Pick a **home region** close to your users (e.g. *UK South (London)* or *South Africa (Johannesburg)* for Nigeria). It can't be changed later.
- **DuckDNS:** <https://www.duckdns.org> → sign in with Google → add a sub-domain (e.g. `dixonwatch`) → copy your **token**.

## 2. Create the server (10 min)

Oracle console → **Compute → Instances → Create instance**:

| Setting | Choose |
|---|---|
| Image | **Canonical Ubuntu 24.04** |
| Shape | *Change shape* → **Ampere → VM.Standard.A1.Flex**, **2 OCPUs, 12 GB** (free; up to 4 / 24 is free too) |
| Networking | keep the defaults (new VCN, public subnet, **assign a public IPv4 address**) |
| SSH keys | **Generate a key pair for me** → **Save private key** (keep this file!) |

If A1 says *out of capacity*, try again later or pick another availability domain. As a fallback, `VM.Standard.E2.1.Micro` (1 GB) works but slower.

Copy the instance's **Public IP address**.

**Open the web ports:** instance page → *Subnet* → *Default Security List* → **Add Ingress Rules**:
- Source CIDR `0.0.0.0/0`, TCP, destination port **80**
- Source CIDR `0.0.0.0/0`, TCP, destination port **443**

Then in DuckDNS, set your sub-domain's IP to that public IP (setup.sh also keeps it updated).

## 3. Upload the code and run setup (10 min)

From the `dixon watch` folder on your Windows PC (PowerShell), with the key you saved:

```powershell
scp -i C:\path\to\ssh-key.key -r server deploy ubuntu@<PUBLIC_IP>:~/dixon/
ssh -i C:\path\to\ssh-key.key ubuntu@<PUBLIC_IP>
```

(If `scp` complains about the key's permissions: right-click the key → Properties → Security → Advanced → disable inheritance → keep only your user.)

On the server:

```bash
rm -rf ~/dixon/server/node_modules ~/dixon/server/.env      # the server builds its own; secrets live in deploy/server.env
cd ~/dixon/deploy
DOMAIN=dixonwatch.duckdns.org DUCKDNS_TOKEN=<your-token> bash setup.sh
```

It installs Docker, opens the firewall, builds the server with Chromium, gets the HTTPS certificate and prints
`✔ Dixon Watch server is live at https://dixonwatch.duckdns.org`.

## 4. Connect the website

- **Vercel → Settings → Environment Variables:** `VITE_API_URL = https://dixonwatch.duckdns.org` → **Redeploy**.
- If your Vercel address isn't `kesina-watch.vercel.app`, edit `ALLOWED_ORIGINS` in `~/dixon/deploy/server.env`, then `sudo docker compose up -d`.

## Everyday commands (on the server, in `~/dixon/deploy`)

| Task | Command |
|---|---|
| Live logs | `sudo docker compose logs -f server` |
| Restart | `sudo docker compose restart server` |
| Update after changing code | upload `server/` again with `scp`, then `sudo docker compose up -d --build` |
| Health | `curl https://dixonwatch.duckdns.org/health` |

## Later: your own domain (Hostinger)

1. Hostinger DNS: add an **A record** `api` → the Oracle public IP (and point the root domain at Vercel as Vercel instructs).
2. On the server: `echo DOMAIN=api.yourdomain.com > .env && sudo docker compose up -d` (Caddy gets the new certificate itself).
3. Add `https://yourdomain.com` to `ALLOWED_ORIGINS` in `server.env`, set `VITE_API_URL=https://api.yourdomain.com` in Vercel, redeploy.
4. Firebase → Authentication → Authorized domains → add `yourdomain.com`.
