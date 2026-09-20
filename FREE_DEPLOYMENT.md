# Free Deployment

This setup keeps the AI and API on the local Windows machine, uses Supabase for PostgreSQL, and serves the React frontend from the Render Static Site.

## 1. Create Supabase database

Create a free Supabase project, copy its connection string, and run the schema once:

```powershell
psql "YOUR_SUPABASE_DATABASE_URL" -f database-setup/postgres/init_schema.sql
```

Use the connection string from Supabase. Do not commit it or put it in GitHub.

## 2. Start the local API, AI, and public tunnel

From the repository root:

```powershell
Set-ExecutionPolicy -Scope Process RemoteSigned
.\.venv\Scripts\Activate.ps1
.\start_free.ps1 -SupabaseDatabaseUrl "YOUR_SUPABASE_DATABASE_URL"
```

The script starts:

- Node API at `http://127.0.0.1:5000`
- Python AI at `http://127.0.0.1:8000`
- Cloudflare quick tunnel for the Node API

Copy the tunnel URL printed by `cloudflared`, for example `https://example.trycloudflare.com`.

## 3. Configure Render Static Site

In the Render Static Site environment variables, set:

```env
VITE_API_URL=https://example.trycloudflare.com
VITE_WS_URL=wss://example.trycloudflare.com
```

Replace `example.trycloudflare.com` with the URL generated on your machine. Save and redeploy the static site.

## Limitations

The quick tunnel URL changes when restarted. The computer must stay on, and the Python, Node, and tunnel processes must remain running. For a permanent public URL, create a named Cloudflare Tunnel instead of using the quick tunnel.
