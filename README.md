# Ledgy

Ledgy is a web app that you host yourself. It does the budget calculations for you. You enter your income and your costs. Ledgy shows where your money goes.

Ledgy has one page for each month, a Summary page, and charts. By default, Ledgy uses the 50/30/20 budget rule. You can change the limits. You can also set savings goals, see your progress toward the yearly IRS limits, and change the look of the app.

You can audit the numbers. **Export** makes an Excel file that has the formulas. Use the file to check that the sums are correct.

## Philosophy

Ledgy follows these principles. They explain why the app works as it does.

1. **You own your data.** Ledgy runs on your computer or your server. It does not send data to other sites. It has no centralized accounts, no tracking, and no cloud service.
2. **The numbers must be verifiable.** Ledgy copies the formulas of an original spreadsheet. A test compares each result with that spreadsheet. **Export** gives you the formulas, so you can do the check yourself.
3. **Keep it simple and fast.** Ledgy does one job: a monthly budget. It does not link to banks. You type the numbers. This keeps the app small and private, and ensures you are always mindfully thinking about expenses when enetering them.

## Design decisions

### The spreadsheet is the source of truth

Ledgy started as a replacement for my budget spreadsheet. The calculation engine in `lib/calc.js` has the same formulas as that spreadsheet. The server and the browser use the same file. This gives two benefits:

- The export always agrees with the screen.
- The test in `test/verify.mjs` can compare Ledgy with the spreadsheet. Changes are never merged unless this test passes.

When the income is blank, a percent shows "—". The spreadsheet shows `#DIV/0!`. Ledgy rounds numbers for display in the same way as Excel (`#,##0.00`). Ledgy keeps money to two decimal places in all calculations.

### The 50/30/20 rule is the default

The rule divides your net income into three parts: 50% for Needs, 30% for Wants, and 20% for Savings. These are only the default values. You can change each rate in **Settings**. Each card shows its budget and the percent that you used.

### Three categories and lists

- A month has three categories: **Wants**, **Needs**, and **Savings**.
- **Groceries** and **Transit** are lists. A list adds up the items that you type in it. A row in Needs can show the total of a list.
- You can add your own lists and put them in Wants, Needs, or Savings.
- Savings rows are in a fixed order: 401k, HSA, Roth, Cash, Investing. The Summary reads the rows by position.
- A savings goal adds one Savings row to each month.

### Contribution limits are not built in

The IRS changes the yearly limits for 401k, HSA, and Roth accounts. Ledgy does not know the current values. You enter them in **Settings**. A value of 0 means "no limit". The **Help** window tells you where to find the values. This way, the app stays correct when the limits change.

### Storage: one SQLite file

- Ledgy keeps all data in one SQLite database (`ledgy.db`). There is one row for each year. The row holds the year as JSON.
- This makes backup easy: copy one file.
- The server checks and cleans each year before it saves the year.
- Docker keeps the file in a volume. The data stays when you update the app.
- The app has no database server to install or maintain.

### Saving and conflicts

- The browser sends a change 600 ms after your last edit.
- Each save has the time of the last known update. If the time is not the same as on the server, the server refuses the save. The app then asks you to reload. This stops an old tab from overwriting newer data.
- If a save fails for another reason, the app tries again.

### Per-browser preferences

Theme, density, month style, list layout, entry style, button labels, and Summary columns are saved in the browser. They are not saved with the budget data. A budget has the same numbers on all devices. Each device can look different.

### Seed color theme

One seed color makes the whole theme. The app takes the hue and the chroma of the seed (in the OKLCH color space). The style sheet then makes the accent color, the surface tints, and the chart colors. The theme stays consistent in light mode and in dark mode. Charts use shades of the theme colors.

### Interface

- **Compact and normal density.** Compact shows more rows on one screen.
- **List layout.** By category (the default) puts Groceries, Transit, and your own lists in a column under their Wants, Needs, or Savings card. None shows all cards in one flat grid. Drag the handle on a list, or press the up and down arrow keys on it, to change the order.
- **Button labels.** You can show icons and text, only icons, or only text. Screen readers always read the text.
- **Help window.** The app explains its categories, the 50/30/20 rule, and the contribution limits.
- **Negative amounts.** A refund shows in green and reduces the total.

### Security

- **Login required.** The app does not start without `BASIC_AUTH_USER` and `BASIC_AUTH_PASS`. To run without a login, you can set `ALLOW_NO_AUTH=1` in the `.env` file at setup. This is a **local** login, ust like your device PIN or password, there is no helpdesk to reset your password.
- **Signed session cookie.** The key comes from the login. When you change the password, all sessions end.
- **Lockout.** After 10 wrong passwords, the app blocks the address for 15 minutes.
- **No cross-site changes.** Each change must have the `X-Ledgy` header and come from the same site.
- **Host check.** The app refuses unknown host names. This stops DNS rebinding attacks.
- **Strict content policy.** The page loads only files from itself. Styles are compiled Tailwind CSS. The page makes no requests to other sites.
- **Small attack surface.** Import files are limited to 5 MB. JSON requests are limited to 5 MB.

### Small stack

- The server uses Node.js, Express, and the built-in `node:sqlite` module.
- The browser uses plain ES modules. There is no front-end framework and no bundler.
- Chart.js draws the charts. ExcelJS reads and writes `.xlsx` files.
- Tailwind CSS is the only build step. Run `npm run build:css` after you change classes or `build/styles.src.css`.
- The code is split into small modules. Each module has one job.

## Quick start (your own computer, about 5 minutes)

You need one free program: **Docker Desktop** (Mac, Windows, or Linux). You do not need anything else.

1. **Install Docker Desktop** from <https://www.docker.com/products/docker-desktop/>. Open it. Wait until it says that it is running.
2. **Get Ledgy.** Click the green **Code** button on this page. Click **Download ZIP**. Unzip the file. (If you use git, run `git clone https://github.com/rasinha621/ledgy.git`.)
3. **Choose a login.** In the unzipped `ledgy` folder, make a new text file named `.env`. Write a dot, then `env`. Do not add `.txt`. Put these two lines in the file. Use your own user name and password:
   ```
   BASIC_AUTH_USER=me
   BASIC_AUTH_PASS=choose-a-password
   ```
   (If you use Ledgy only on your own computer and you do not want a login, use `ALLOW_NO_AUTH=1` as the only line.)
4. **Start Ledgy.** Open a terminal in the folder. On a Mac, right-click the folder and select **New Terminal at Folder**. On Windows, open the folder, type `cmd` in the address bar, and press Enter. Then run this command:
   ```
   docker compose up -d --build
   ```
   The first time takes a few minutes. Docker downloads and builds the app.
5. **Open <http://localhost:3000>.** Sign in. Click **New year**. To bring in an `.xlsx` file, click **Import**.

Docker keeps your data. The data stays when you restart or update. Use **Export** or **Settings → Download JSON backup** to keep your own copies.

| To... | Run this in the same folder |
|---|---|
| Stop Ledgy | `docker compose down` |
| Start Ledgy again | `docker compose up -d` |
| Update after you download a newer version | `docker compose up -d --build` |

If port 3000 is in use, add `HTTP_PORT=3001` to your `.env` file. Then open `http://localhost:3001`.

## Install with Dockge

1. Copy this folder to the Dockge stacks folder on the server. Name the copy `ledgy`:
   ```
   scp -r ledgy  user@server:/opt/stacks/ledgy
   ```
   (Use the stacks folder that you set in Dockge. The default is `/opt/stacks`.)
2. In Dockge, click **Scan Stacks Folder** (in the menu at the top right). The `ledgy` stack shows in the list.
3. Open the stack. If necessary, edit the port, `TZ`, `PUID`/`PGID`, or the login in the compose file.
4. Click **Deploy**. Dockge builds the image from the `Dockerfile` and starts the container.
5. Open `http://<server>:3000`. Click **Import** and select your `.xlsx` file, or click **New year**.

Without Dockge, run these commands:
```
cd ledgy
docker compose up -d --build
```

### Settings in `compose.yaml`

| Setting | Default | What it does |
|---|---|---|
| `LEDGY_HOST` | `localhost` | The name or IP address that you type in the browser. For example, `nas.local` or `192.168.1.20`. |
| `HTTP_PORT` | `3000` | The port on the server. |
| `PUID` / `PGID` | `568` | The user and group that own the data. 568 is the TrueNAS `apps` user. |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | blank | The login. The app shows a sign-in page. The session lasts 30 days. Settings has a Sign out button. **Required**: the app does not start without them, unless you set `ALLOW_NO_AUTH=1`. After 10 wrong passwords, the app blocks the address for 15 minutes. |
| `ALLOW_NO_AUTH` | blank | Set to `1` to run without a login. Do this only on a network that you trust. The app then accepts only IP addresses and `localhost` in the URL, unless you set `ALLOWED_HOSTS`. |
| `ALLOWED_HOSTS` | blank | Host names, separated by commas, that can open the app. For example, `ledgy.example.com,nas.local`. When you set this value, the app refuses other names. |
| `TRUST_PROXY` | blank | Set this only if you run Ledgy behind your own reverse proxy. |
| `ledgy-data` volume | | A named Docker volume that holds the SQLite database (`ledgy.db`). Use **Export** or **Settings → Download JSON backup** to keep copies. |

To update after you change the files, click **Update** in Dockge. You can also run `docker compose up -d --build`.

### Network safety

- Ledgy serves plain HTTP. The network does not encrypt the login. This is acceptable on a trusted home network or over Tailscale. Tailscale encrypts the traffic between your devices.
- To use Ledgy from the open internet, put an HTTPS reverse proxy in front of it. Then set `TRUST_PROXY`.
- Changes to data must come from the Ledgy page. The app refuses requests from other websites.
- The page makes no requests to other sites. The app serves its own styles (`public/styles.css`).
- The app limits imported `.xlsx` files to 5 MB (20 MB unpacked).

## How the app maps to the spreadsheet

| Spreadsheet | App |
|---|---|
| `M1` income | Income box |
| `B1 = M1*0.3`, `C1 = SUM(A:A)`, `C2 = C1/B1` | Wants: budget, total, % used. The app keeps the notes from column B. |
| `F1 = M1*0.5+200`, `G1 = SUM(E:E)`, `G2 = G1/F1` | Needs: budget, total, % used. The app keeps the labels from column F. |
| `E7 = SUM(Q:Q)`, `E8 = SUM(S:S)` | A Needs row with type **ΣG** or **ΣT** is the total of the Groceries or Transit list. Type **#** is a typed value. |
| `J1 = M1*0.2`, `K1 = SUM(I:I)`, `K2 = K1/J1` | Savings: budget, total, % used |
| `M2 = SUM(C1,G1,K1)`, `M3 = M2/M1`, `N3 = M1-M2` | Allocated, Allocated / income, Remaining |
| `Q` / `S` columns | Groceries and Transit lists (with notes from R and T) |
| Summary `A2:I2` | Summary page: the same 9 totals and the same formulas |
| Summary pie chart (`B2:E2`) | "Year breakdown" chart on the Summary page |

The Summary reads the Savings rows by position, as the spreadsheet does: row 1 = 401k (`I2`), row 2 = HSA (`I3`), row 3 = Roth (`I4`), row 4 = Cash (`I5`), row 5 = Investing (`I6`).

## Use

- Type a number in an amount cell. You can also type `$1,234.50` or a formula such as `=12.50+3.99`.
- **Enter** goes to the next row and adds a row at the end of the list. **Shift+Enter** goes up.
- To add many rows at once, paste a column from a spreadsheet into an amount cell. If you paste two columns, the second column becomes the note or label.
- Negative amounts (refunds, cashback) show in green and reduce the total.
- **Export** downloads an `.xlsx` file with the same layout and the same live formulas. The file does not include the pie chart.
- **Settings → Download JSON backup** gives a copy of one year.
- **New year** can copy the Needs labels and Savings rows from December of an earlier year.
- **Help** explains the categories, the 50/30/20 rule, and the contribution limits.

## Check the calculations

Run `npm test -- path/to/dev_budget.xlsx`. The test imports the file. It compares each formula cell with the values that the file has saved. The cells are B1, C1, C2, F1, G1, G2, J1, K1, K2, M2, M3, N3, and E7 for each month, and Summary A2:H2. The test then exports the data, imports it again, and compares a second time.

## Feedback

Feedback is welcome! Tell me if something is not clear, too complex, repeated, or could be better.
