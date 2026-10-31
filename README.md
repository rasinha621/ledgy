# Ledgy

A self-hosted web app that does the same calculations as the `dev_budget.xlsx` spreadsheet:
one page for each month (JAN–DEC), a Summary page, and charts that show where the money went.

## Install with Dockge

1. Copy this folder to the Dockge stacks folder on the server, as `ledgy`:
   ```
   scp -r ledgy  user@server:/opt/stacks/ledgy
   ```
   (Use the stacks folder that you set in Dockge. `/opt/stacks` is the default.)
2. In Dockge, click **Scan Stacks Folder** (in the menu at the top right). The `ledgy` stack shows in the list.
3. Open the stack. If necessary, edit the port, `TZ`, `PUID`/`PGID`, or the login in the compose file.
4. Click **Deploy**. Dockge builds the image from the `Dockerfile` and starts the container.
5. Open `https://<server>:8443` (see **HTTPS** below for the one-time certificate step). Click **Import** and select your `.xlsx` file, or click **New year**.

Without Dockge:
```
cd ledgy
docker compose up -d --build
```

### Settings in `compose.yaml`

| Setting | Default | What it does |
|---|---|---|
| `LEDGY_HOST` | `localhost` | The name or IP address you type in the browser, e.g. `nas.local` or `192.168.1.20`. The HTTPS certificate is made for it. |
| `HTTPS_PORT` | `8443` | The HTTPS port on the server. (TrueNAS already uses 443.) |
| `PUID` / `PGID` | `568` | The user and group that own the data. 568 is the TrueNAS `apps` user. |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | blank | The login, shown as a sign-in page (the session lasts 30 days; Settings has Sign out). **Required**: the app does not start without them unless `ALLOW_NO_AUTH=1`. After 10 wrong passwords, an address is locked out for 15 minutes. |
| `ALLOW_NO_AUTH` | blank | Set to `1` to run without a login (only on a network you trust). The app then accepts only IP addresses and `localhost` in the URL, unless you set `ALLOWED_HOSTS`. |
| `ALLOWED_HOSTS` | blank | Comma-separated host names that may be used to open the app, e.g. `ledgy.example.com,nas.local`. When set, other names are refused. |
| `TRUST_PROXY` | `1` in compose | Compose already sets this, because Caddy is in front. Set it only if you run Ledgy without Compose behind your own proxy. |
| `ledgy-data` volume | | A named Docker volume with the SQLite database (`ledgy.db`). Use **Export** or **Settings → Download JSON backup** to keep copies. |

To update after you change the files: in Dockge, click **Update** (or `docker compose up -d --build`).

### HTTPS

Caddy (see `Caddyfile`) makes a certificate with its own certificate authority, so you need no domain name.
Set `LEDGY_HOST` in `.env` to what you type in the browser, then deploy. Your browser will warn about the certificate until
you trust Caddy's root certificate once on each device:

1. Copy the file from the Caddy container: `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt`
2. Install it as a trusted root: on macOS, open it in Keychain Access, put it in **System**, and set **Always Trust**.
   On Windows, import it into **Trusted Root Certification Authorities**. On iOS/Android, install it as a certificate profile
   and enable it for trust. Firefox keeps its own list (Settings → Certificates → Authorities).

Keep the `caddy-data` volume. If you delete it, Caddy makes a new certificate authority and each device needs the new file.
If you have a real domain name, change `tls internal` in the `Caddyfile` to a Let's Encrypt setup for your DNS provider.

### Security

- Ledgy itself serves plain HTTP. In `compose.yaml` it has no published port, and the Caddy container in front of it
  provides HTTPS, so the login is encrypted. If you run `node server.js` yourself, put your own HTTPS proxy in front.
- Changes to data must come from the Ledgy page itself; requests from other websites are refused.
- Styles are compiled Tailwind CSS served from the app (`public/styles.css`), so the page makes no requests to other sites. After changing classes or `build/styles.src.css`, run `npm run build:css`.
- Imported `.xlsx` files are limited to 5 MB (20 MB unpacked).

## How it replicates the spreadsheet

Each month has the same cells as the sheet. The small labels (M1, N3, A2…) show the cell that each value comes from.

| Spreadsheet | App |
|---|---|
| `M1` income | Income box |
| `B1 = M1*0.3`, `C1 = SUM(A:A)`, `C2 = C1/B1` | Wants: budget, total, % used. Notes from column B are kept. |
| `F1 = M1*0.5+200`, `G1 = SUM(E:E)`, `G2 = G1/F1` | Needs: budget, total, % used. Labels from column F are kept. |
| `E7 = SUM(Q:Q)`, `E8 = SUM(S:S)` | A Needs row with type **ΣG** or **ΣT** is the total of the Groceries or Transit list. Type **#** is a typed value. |
| `J1 = M1*0.2`, `K1 = SUM(I:I)`, `K2 = K1/J1` | Savings: budget, total, % used |
| `M2 = SUM(C1,G1,K1)`, `M3 = M2/M1`, `N3 = M1-M2` | Allocated, Allocated / income, Remaining |
| `Q` / `S` columns | Groceries and Transit lists (with notes from R and T) |
| Summary `A2:I2` | Summary page: same 9 totals and same formulas |
| Summary pie chart (`B2:E2`) | "Year breakdown" chart on the Summary page |

The Summary reads Savings rows by position, as the spreadsheet does: row 1 = 401k (`I2`), row 2 = HSA (`I3`),
row 3 = Roth (`I4`), row 4 = Cash (`I5`), row 5 = Investing (`I6`). The original spreadsheet had one bank savings row; existing years are upgraded to Cash plus an empty Investing row.

Spreadsheet behavior that is kept by default (change it in **Settings**):
- HSA and 401k totals add JAN–NOV only (DEC is not in the formula).
- The pie chart on the Summary page shows Wants, Needs and Total Savings (Cash and Investing included).
- Roth total starts from a fixed balance (`4808.49` in the imported file).
- The budget percentages and the +$200 for Needs.

When the income is blank, the % cells show "—" (the spreadsheet shows `#DIV/0!`).
Numbers are rounded for display the same way as Excel (`#,##0.00`).

## Use

- Type a number in an amount cell. You can also type `$1,234.50` or a formula such as `=12.50+3.99`.
- **Enter** goes to the next row and adds a row at the end of the list. **Shift+Enter** goes up.
- Paste a column from a spreadsheet into an amount cell to add many rows at once. If you paste two columns, the second column becomes the note or label.
- Negative amounts (refunds, cashback) show in green and reduce the total.
- **Export** downloads an `.xlsx` file with the same layout and the same live formulas. (The pie chart is not included in the file.)
- **Settings → Download JSON backup** gives a copy of one year.
- **New year** can copy the Needs labels and Savings rows from December of an earlier year.

## Check the calculations

`npm test -- path/to/dev_budget.xlsx` imports the file and compares every formula cell
(B1, C1, C2, F1, G1, G2, J1, K1, K2, M2, M3, N3, E7 for each month, and Summary A2:H2)
with the values saved in the file. It then exports, imports again, and compares a second time.
