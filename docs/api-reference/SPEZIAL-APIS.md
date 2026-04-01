# Spezial-APIs (Non-REST)

> Source: `ApiApplication.php` lines 135-230, verified against controller source code.

---

## 1. OpenTRANS Connect

**Controller:** `Legacy\OpenTransConnectController`
**Permission:** `handle_opentrans`
**Content-Type:** `application/xml; charset=UTF-8` (request and response)
**Delegate:** Loads `TransferOpentrans` module via `uebertragungen_account` table.

### Active Routes (19 total)

#### Dispatch Notification -- GET (read, 4 routes)

| Method | Path | Lookup Key |
|--------|------|------------|
| GET | `/opentrans/dispatchnotification/{id:\d+}` | Lieferschein ID |
| GET | `/opentrans/dispatchnotification/orderid/{orderid:\d+}` | Auftrag ID |
| GET | `/opentrans/dispatchnotification/ordernumber/{ordernumber:\w+}` | Belegnr |
| GET | `/opentrans/dispatchnotification/extorder/{extorder:\w+}` | Externe Belegnr |

Handler: `readDispatchnotification()` -- resolves to `deliverynote` doctype, calls `TransferOpentrans::getDispatchnotification()`.

#### Dispatch Notification -- PUT (update, 4 routes)

| Method | Path | Lookup Key |
|--------|------|------------|
| PUT | `/opentrans/dispatchnotification/{id:\d+}` | Lieferschein ID |
| PUT | `/opentrans/dispatchnotification/orderid/{orderid:\d+}` | Auftrag ID |
| PUT | `/opentrans/dispatchnotification/ordernumber/{ordernumber:\w+}` | Belegnr |
| PUT | `/opentrans/dispatchnotification/extorder/{extorder:\w+}` | Externe Belegnr |

Handler: `updateDispatchnotification()` -- parses XML body, calls `TransferOpentrans::updateDispatchnotification()`. Logs to `api_request_response_log`.

#### Order -- GET (read, 3 routes)

| Method | Path | Lookup Key |
|--------|------|------------|
| GET | `/opentrans/order/{id:\d+}` | Auftrag ID |
| GET | `/opentrans/order/ordernumber/{ordernumber:\w+}` | Belegnr |
| GET | `/opentrans/order/extorder/{extorder:\w+}` | Externe Belegnr |

Handler: `readOrder()` -- resolves to `order` doctype, calls `TransferOpentrans::getOrder()`.

#### Order -- POST (create, 1 route)

| Method | Path |
|--------|------|
| POST | `/opentrans/order` |

Handler: `createOrder()` -- parses XML body, calls `TransferOpentrans::createOrder()`. Logs incoming request and sets status to `ok` or `error`. Returns HTTP 201 on success.

#### Order -- DELETE (3 routes)

| Method | Path | Lookup Key |
|--------|------|------------|
| DELETE | `/opentrans/order/{id:\d+}` | Auftrag ID |
| DELETE | `/opentrans/order/ordernumber/{ordernumber:\w+}` | Belegnr |
| DELETE | `/opentrans/order/extorder/{extorder:\w+}` | Externe Belegnr |

Handler: `deleteOrder()` -- calls `TransferOpentrans::deleteOrder()`.

#### Invoice -- GET (read, 4 routes)

| Method | Path | Lookup Key |
|--------|------|------------|
| GET | `/opentrans/invoice/{id:\d+}` | Rechnung ID |
| GET | `/opentrans/invoice/orderid/{orderid:\d+}` | Auftrag ID |
| GET | `/opentrans/invoice/ordernumber/{ordernumber:\w+}` | Belegnr |
| GET | `/opentrans/invoice/extorder/{extorder:\w+}` | Externe Belegnr |

Handler: `readInvoice()` -- resolves to `invoice` doctype, calls `TransferOpentrans::getInvoice()`.

### Commented-Out Routes (NOT active)

- `POST /opentrans/dispatchnotification` -- `createDispatchnotification` (lines 154-156)
- `PUT /opentrans/order/{id:\d+}` -- `updateOrder` (lines 182-184)

These exist in the source but are wrapped in `/* ... */` block comments. The controller method `updateOrder()` is implemented but cannot be reached via the router.

---

## 2. Shop Import

**Controller:** `Legacy\ShopimportController`
**Permission:** `communicate_with_shop`
**Content-Type:** `application/json; charset=UTF-8` (response)
**Shop Resolution:** All actions resolve the shop via `shopexport.api_account_id` matching the authenticated API account.

### Routes (12 total)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/shopimport/auth` | `auth()` | Authenticate via `RemoteConnection`; expects "success" prefix in response |
| POST | `/shopimport/syncstorage/{articlenumber:.+}` | `syncStorage()` | Sync stock for one article to shop. Article number is **base64-encoded** in URL |
| POST | `/shopimport/articletoxentral/{articlenumber:.+}` | `putArticleToXentral()` | Pull article from shop into Xentral. Article number is **base64-encoded** |
| POST | `/shopimport/articletoshop/{articlenumber:.+}` | `putArticleToShop()` | Push article from Xentral to shop. Article number is **base64-encoded** |
| POST | `/shopimport/ordertoxentral/{ordernumber:.+}` | `putOrderToXentral()` | Import single order from shop. Order number is **base64-encoded** |
| GET | `/shopimport/articlesyncstate` | `getArticleSyncState()` | Count of active article-shop mappings |
| GET | `/shopimport/statistics` | `getStatistics()` | Orders in shipment, open orders, packages today/yesterday, income, contribution margin |
| GET | `/shopimport/modulelinks` | `getModulelinks()` | List of module links for the shop |
| POST | `/shopimport/disconnect` | `postDisconnect()` | Set `shopexport.aktiv = 0` |
| POST | `/shopimport/reconnect` | `postReconnect()` | Set `shopexport.aktiv = 1` |
| GET | `/shopimport/status` | `getStatus()` | Check if shop is connected (does not require active shop) |
| POST | `/shopimport/refund` | `postRefund()` | Process refund; accepts JSON or XML body; delegates to `Shopimport::Refund()` |

### URL Encoding Note

Routes with `{articlenumber:.+}` and `{ordernumber:.+}` expect the identifier to be **base64-encoded** in the URL path. The controller calls `base64_decode()` on the raw path segment before use (see `getArticleByRequest()` and `getOrderByRequest()`).

---

## 3. Mobile API

**Controller:** `Legacy\MobileApiController` (extends `AbstractController`)
**Permission:** `mobile_app_communication`
**Note:** Despite the `/v1/` prefix, this controller lives in the Legacy namespace, not Version1.

### Route (1 total)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/v1/mobileapi/dashboard` | `dashboardAction()` |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `date` | string | today | Date in `YYYY-mm-dd` format. Validated by regex `/^[1-9]\d{3}-\d{2}-\d{2}$/` |
| `interval` | int | varies by mode | Number of periods. Defaults: day=14, week=14, month=12, year=10 |
| `mode` | string | `day` | One of: `day`, `week`, `month`, `year` |

### Widgets (17 total)

**Dashboard main page (7):**

| ID | Type | Label | Category |
|----|------|-------|----------|
| `order_count` | contrast | Auftraege | basket |
| `turnover_day` | contrast | Umsatz (heute) | euro |
| `dispatch_package` | contrast | Pakete | packages |
| `order_value` | contrast | Auftraege Heute | euro |
| `turnover_period` | barchart | Umsatz (N Tage/Wochen/Monate/Jahre) | euro |
| `customer_new` | contrast | Neukunden | customer |
| `tickets` | simple | Offene Tickets | ticket |

**Financial data page (10):**

| ID | Type | Label | Category |
|----|------|-------|----------|
| `turnover_current` | contrast_big | Umsatz aktueller Monat (netto) | cashflow |
| `turnover_lastmonth` | contrast_big | Umsatz letzter Monat (netto) | cashflow |
| `turnover_beforelastmonth` | simple_big | Umsatz vorletzter Monat (netto) | cashflow |
| `liability_open` | simple_big | Offene Verbindlichkeiten (brutto) | cashflow |
| `orders_open` | simple_big | Offene Auftraege (netto) | cashflow |
| `dunning_current` | simple_big | Mahnwesen (brutto) | cashflow |
| `timetrack_current` | simple_big | Zeit Gebucht | customer |
| `subscription_nextmonth` | simple_big | Abolauf naechsten Monat (brutto) | cashflow |
| `accounts_total_current` | simple_big | Bankkonten Gesamt | cashflow |
| `turnover_year_current` | contrast_big | Gesamtumsatz laufendes Jahr (netto) | cashflow |

---

## 4. GobNav Connect

**Controller:** `Legacy\GobNavConnectController`
**Permission:** `handle_navision`

### Routes (2 registrations = 1 logical endpoint)

| Method | Path | Handler |
|--------|------|---------|
| POST | `/v1/gobnavconnect` | `exampleAction()` |
| POST | `/v1/gobnavconnect/` | `exampleAction()` |

Both paths route to the same handler. The trailing-slash variant exists to avoid 404s from clients that append slashes.

### Behavior

1. Reads raw POST body via `$request->getContent()`
2. Looks up the first active `uebertragungen_account` row where `xml_pdf = 'TransferGobNav'`
3. Loads the `Uebertragungen` module, then `LoadTransferModul('TransferGobNav', $id)`
4. Calls `TransferGobNav::ParseRequest($post)`
5. Terminates with `exit;` (no HTTP response object returned)

---

## 5. Ticket Portal API

**Status: DOES NOT EXIST**

Previous documentation versions referenced a "Ticket Portal API" with routes under `/v1/ticketportal/`. This was fabricated. There is no `TicketPortalController`, no route registration in `ApiApplication.php`, and no corresponding module. The ticket count shown in the Mobile API dashboard widget (`tickets`) uses `$app->erp->AnzahlOffeneTickets()` directly and is not a separate API.

---

## Live Instance Compatibility

> Tested against OpenXE live instance, 2026-03-31.

| API | Status | Notes |
|-----|--------|-------|
| OpenTRANS (all) | 500 | Server crash -- module not configured |
| Shop Import /status | 404 | "Shop not found" -- needs shop config |
| Shop Import (others) | Not tested | Fake shop now configured -- to be tested |
| Mobile Dashboard | 500 | Server crash -- module dependency issue |
| GobNav | 200 | Accepts POST, empty response |
| Reports | 404 | No report with ID 1 |
