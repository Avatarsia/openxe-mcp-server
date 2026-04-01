# OpenXE API: Authentication, Permissions & Error Handling

> **Verification status:** All facts in this document were verified against the OpenXE source code.
> Generated: 2026-03-31

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [API Credentials](#2-api-credentials)
3. [Permissions](#3-permissions)
4. [Error Codes](#4-error-codes)
5. [Response Format](#5-response-format)
6. [Debug Mode](#6-debug-mode)
7. [Security Notes](#7-security-notes)

---

## 1. Authentication

OpenXE uses **HTTP Digest Authentication** as defined in [RFC 2617](https://tools.ietf.org/html/rfc2617). There is no token-based or session-based authentication; every request must carry a valid Digest `Authorization` header.

### 1.1 Digest Parameters

| Parameter | Value |
|-----------|-------|
| **Realm** | `Xentral-API` |
| **QoP (advertised)** | `auth` |
| **QoP (also accepted)** | `auth-int` |
| **Algorithm** | MD5 (RFC 2617 default) |
| **Nonce max age** | 86400 seconds (24 hours) |

> **Warning:** Older unofficial documentation listed the realm as `"API"`. The correct realm is **`Xentral-API`**. Using the wrong realm will cause HA1 computation to fail and authentication will be rejected.

### 1.2 Nonce Lifecycle

1. On a `401` challenge, the server generates a fresh nonce and opaque value.
2. Both are stored in the **`api_keys`** database table along with a timestamp and a nonce count of `0`.
3. The nonce is valid for **86400 seconds** (24 hours). After that, the server throws error **7417** (`CODE_DIGEST_NONCE_EXPIRED`) with HTTP 401. Note: the server does **not** send `stale=true` -- the client must handle the 401 and re-authenticate from scratch.
4. **Nonce cleanup** is probabilistic: on each request there is a **1% chance** the server deletes all `api_keys` entries older than **30 days**.

### 1.3 Nonce Count (nc) Verification

The server contains code to verify the `nc` (nonce count) value, but this check is **disabled by default**:

```php
$checkNonceCount = false;
```

This means replay attacks using the same nonce/nc pair will not be detected by the API itself. If you need replay protection, enforce it at the network layer (TLS, reverse proxy, etc.).

### 1.4 Rate Limiting

There is **no rate limiting** implemented in the API code. If rate limiting is required, it must be configured at the web server or reverse proxy level.

### 1.5 Authentication Flow Example

```
Client                                    Server
  |                                          |
  |  GET /api/v1/addresses                   |
  |----------------------------------------->|
  |                                          |
  |  401 Unauthorized                        |
  |  WWW-Authenticate: Digest               |
  |    realm="Xentral-API",                  |
  |    qop="auth",                           |
  |    nonce="<server-nonce>",               |
  |    opaque="<server-opaque>"              |
  |<-----------------------------------------|
  |                                          |
  |  GET /api/v1/addresses                   |
  |  Authorization: Digest                   |
  |    username="myapp",                     |
  |    realm="Xentral-API",                  |
  |    nonce="<server-nonce>",               |
  |    uri="/api/v1/addresses",              |
  |    qop=auth,                             |
  |    nc=00000001,                          |
  |    cnonce="<client-nonce>",              |
  |    response="<computed-digest>",         |
  |    opaque="<server-opaque>"              |
  |----------------------------------------->|
  |                                          |
  |  200 OK                                  |
  |  { ... }                                 |
  |<-----------------------------------------|
```

### 1.6 cURL Example

```bash
curl --digest \
     --user "myapp:mysecretkey" \
     -H "Accept: application/json" \
     "https://your-openxe-instance/api/v1/addresses"
```

Most HTTP clients (cURL, Python `requests`, PHP Guzzle) handle the Digest challenge/response automatically when given the `--digest` flag or equivalent option.

#### Python Example

```python
import requests
from requests.auth import HTTPDigestAuth

response = requests.get(
    "https://your-openxe-instance/api/v1/addresses",
    auth=HTTPDigestAuth("myapp", "mysecretkey"),
    headers={"Accept": "application/json"}
)
print(response.json())
```

#### PHP Example (Guzzle)

```php
$client = new \GuzzleHttp\Client();
$response = $client->get('https://your-openxe-instance/api/v1/addresses', [
    'auth' => ['myapp', 'mysecretkey', 'digest'],
    'headers' => ['Accept' => 'application/json'],
]);
echo $response->getBody();
```

---

## 2. API Credentials

Credentials are stored in the **`api_account`** database table.

| Column | Purpose | Notes |
|--------|---------|-------|
| `remotedomain` | **Username** (aliased as `appname` in code) | Used as the Digest `username` |
| `initkey` | **Password** | Used to compute the Digest response hash |
| `aktiv` | **Active flag** | Must be `1` for the account to authenticate |
| `permissions` | **Permissions** | JSON array of permission strings |

### 2.1 Creating an API Account

API accounts are managed through the OpenXE admin interface. When creating an account:

1. Set `remotedomain` to the application name (this is the Digest username).
2. Set `initkey` to a strong, random secret.
3. Set `aktiv` to `1`.
4. Set `permissions` to a JSON array of the required permission strings (see Section 3).

Example `permissions` value:

```json
["list_addresses", "view_address", "list_orders", "view_order"]
```

---

## 3. Permissions

Each API route requires a specific permission string. The API account's `permissions` column must contain a JSON array that includes the required permission for every endpoint the account needs to access.

If a permission is missing, the server returns error code **7421** with HTTP status **401** (not 403).

### 3.1 Complete Permission Reference (96 permissions)

#### Address

| Permission | Description |
|------------|-------------|
| `list_addresses` | List all addresses |
| `view_address` | View a single address |
| `create_address` | Create a new address |
| `edit_address` | Edit an existing address |

#### Delivery Address

| Permission | Description |
|------------|-------------|
| `list_delivery_addresses` | List delivery addresses |
| `view_delivery_address` | View a single delivery address |
| `create_delivery_address` | Create a delivery address |
| `edit_delivery_address` | Edit a delivery address |
| `delete_delivery_address` | Delete a delivery address |

#### Address Type

| Permission | Description |
|------------|-------------|
| `list_address_types` | List address types |
| `view_address_type` | View a single address type |
| `create_address_type` | Create an address type |
| `edit_address_type` | Edit an address type |

#### Article

| Permission | Description |
|------------|-------------|
| `list_articles` | List all articles |
| `view_article` | View a single article |

#### Article Category

| Permission | Description |
|------------|-------------|
| `list_article_categories` | List article categories |
| `view_article_category` | View a single article category |
| `create_article_category` | Create an article category |
| `edit_article_category` | Edit an article category |

#### Subscription

| Permission | Description |
|------------|-------------|
| `list_subscriptions` | List subscriptions |
| `view_subscription` | View a single subscription |
| `create_subscription` | Create a subscription |
| `edit_subscription` | Edit a subscription |
| `delete_subscription` | Delete a subscription |

#### Subscription Group

| Permission | Description |
|------------|-------------|
| `list_subscription_groups` | List subscription groups |
| `view_subscription_group` | View a single subscription group |
| `create_subscription_group` | Create a subscription group |
| `edit_subscription_group` | Edit a subscription group |

#### Property

| Permission | Description |
|------------|-------------|
| `list_property` | List properties |
| `view_property` | View a single property |
| `create_property` | Create a property |
| `edit_property` | Edit a property |
| `delete_property` | Delete a property |

#### Property Value

| Permission | Description |
|------------|-------------|
| `list_property_value` | List property values |
| `view_property_value` | View a single property value |
| `create_property_value` | Create a property value |
| `edit_property_value` | Edit a property value |
| `delete_property_value` | Delete a property value |

#### Group

| Permission | Description |
|------------|-------------|
| `list_groups` | List groups |
| `view_group` | View a single group |
| `create_group` | Create a group |
| `edit_group` | Edit a group |

#### Documents -- Quotes

| Permission | Description |
|------------|-------------|
| `list_quotes` | List quotes |
| `view_quote` | View a single quote |

#### Documents -- Orders

| Permission | Description |
|------------|-------------|
| `list_orders` | List orders |
| `view_order` | View a single order |

#### Documents -- Delivery Notes

| Permission | Description |
|------------|-------------|
| `list_delivery_notes` | List delivery notes |
| `view_delivery_note` | View a single delivery note |

#### Documents -- Invoices

| Permission | Description |
|------------|-------------|
| `list_invoices` | List invoices |
| `view_invoice` | View a single invoice |
| `delete_invoice` | Delete an invoice |

#### Documents -- Credit Memos

| Permission | Description |
|------------|-------------|
| `list_credit_memos` | List credit memos |
| `view_credit_memo` | View a single credit memo |

#### File

| Permission | Description |
|------------|-------------|
| `list_files` | List files |
| `view_file` | View / download a file |
| `create_file` | Upload a file |

#### DocScan (Scanned Documents)

| Permission | Description |
|------------|-------------|
| `list_scanned_documents` | List scanned documents |
| `view_scanned_document` | View a scanned document |
| `create_scanned_document` | Create / upload a scanned document |

#### Report

| Permission | Description |
|------------|-------------|
| `view_report` | View / generate a report |

#### CRM

| Permission | Description |
|------------|-------------|
| `list_crm_documents` | List CRM documents |
| `view_crm_document` | View a single CRM document |
| `create_crm_document` | Create a CRM document |
| `edit_crm_document` | Edit a CRM document |
| `delete_crm_document` | Delete a CRM document |

#### Country

| Permission | Description |
|------------|-------------|
| `list_countries` | List countries |
| `view_country` | View a single country |
| `create_country` | Create a country |
| `edit_country` | Edit a country |

#### Tax Rate

| Permission | Description |
|------------|-------------|
| `list_tax_rates` | List tax rates |
| `view_tax_rate` | View a single tax rate |
| `create_tax_rate` | Create a tax rate |
| `edit_tax_rate` | Edit a tax rate |

#### Shipping Method

| Permission | Description |
|------------|-------------|
| `list_shipping_methods` | List shipping methods |
| `view_shipping_method` | View a single shipping method |
| `create_shipping_method` | Create a shipping method |
| `edit_shipping_method` | Edit a shipping method |

#### Payment Method

| Permission | Description |
|------------|-------------|
| `list_payment_methods` | List payment methods |
| `view_payment_method` | View a single payment method |
| `create_payment_method` | Create a payment method |
| `edit_payment_method` | Edit a payment method |

#### Resubmission

| Permission | Description |
|------------|-------------|
| `list_resubmissions` | List resubmissions |
| `view_resubmission` | View a single resubmission |
| `create_resubmission` | Create a resubmission |
| `edit_resubmission` | Edit a resubmission |

#### Tracking

| Permission | Description |
|------------|-------------|
| `list_tracking_numbers` | List tracking numbers |
| `view_tracking_number` | View a single tracking number |
| `create_tracking_number` | Create a tracking number |
| `edit_tracking_number` | Edit a tracking number |

#### Storage

| Permission | Description |
|------------|-------------|
| `view_storage_batch` | View storage batch information |
| `view_storage_best_before` | View storage best-before dates |

#### Specialized / Integration

| Permission | Description |
|------------|-------------|
| `handle_opentrans` | Handle OpenTrans XML documents |
| `communicate_with_shop` | Shop communication endpoint |
| `mobile_app_communication` | Mobile app communication endpoint |
| `handle_navision` | Navision integration endpoint |
| `handle_assets` | Asset management endpoint |

#### Legacy Dynamic Permissions

Legacy API endpoints use a dynamic permission pattern:

```
standard_{action}
```

Where `{action}` is derived from the legacy API method name. These are generated at runtime rather than being statically defined.

---

## 4. Error Codes

All API errors follow a consistent structure. The error code is an integer in the `74xx` range, grouped by category.

### 4.1 Authentication Errors (741x)

| Code | Constant | HTTP Status | Description | When It Occurs |
|------|----------|-------------|-------------|----------------|
| 7411 | `CODE_UNAUTHORIZED` | 401 | Unauthorized | General authentication failure |
| 7412 | `CODE_DIGEST_HEADER_INCOMPLETE` | 401 | Digest header incomplete | Required Digest fields missing from `Authorization` header |
| 7413 | `CODE_API_ACCOUNT_MISSING` | 401 | API account missing | Username not found in `api_account` table |
| 7414 | `CODE_API_ACCOUNT_INVALID` | 401 | API account invalid | Account exists but is inactive (`aktiv` != 1) or password mismatch |
| 7415 | `CODE_DIGEST_VALIDDATION_FAILED` | -- | *(Commented out, unused)* | Never raised; dead code |
| 7416 | `CODE_DIGEST_NONCE_INVALID` | 401 | Digest nonce invalid | Nonce not found in `api_keys` table |
| 7417 | `CODE_DIGEST_NONCE_EXPIRED` | 401 | Digest nonce expired | Nonce older than 86400 seconds. **`stale=true` is NOT sent** -- the server throws this error instead |
| 7418 | `CODE_AUTH_USERNAME_EMPTY` | 401 | Auth username empty | `Authorization` header present but `username` field is empty |
| 7419 | `CODE_AUTH_TYPE_NOT_ALLOWED` | 401 | Authorization type not allowed | Non-Digest `Authorization` header (e.g., Basic, Bearer) |
| 7420 | `CODE_DIGEST_NC_NOT_MATCHING` | 401 | Nonce count mismatch | **Unreachable** -- nc checking is disabled by default |
| 7421 | `CODE_API_ACCOUNT_PERMISSION_MISSING` | 401 | Missing permission | Account lacks the required permission for the endpoint. Note: returns **401**, not 403 |

### 4.2 Routing Errors (743x)

| Code | Constant | HTTP Status | Description | When It Occurs |
|------|----------|-------------|-------------|----------------|
| 7431 | `CODE_ROUTE_NOT_FOUND` | 404 | Route not found | URL path does not match any defined route |
| 7432 | `CODE_METHOD_NOT_ALLOWED` | 405 | Method not allowed | HTTP method (GET/POST/PUT/DELETE) not allowed for this route |
| 7433 | `CODE_API_METHOD_NOT_FOUND` | 404 | API method not found | Constant exists but no exception class is defined; internal routing error |

### 4.3 Request Errors (745x)

| Code | Constant | HTTP Status | Description | When It Occurs |
|------|----------|-------------|-------------|----------------|
| 7451 | `CODE_BAD_REQUEST` | 400 | Bad request | General malformed request |
| 7452 | `CODE_RESOURCE_NOT_FOUND` | 404 | Resource not found | Requested entity (by ID) does not exist |
| 7453 | `CODE_VALIDATION_ERROR` | 400 | Validation error | Request body fails validation. Note: returns **400**, not 422 |
| 7454 | `CODE_INVALID_ARGUMENT` | 400 | Invalid argument | Query parameter or argument is invalid |
| 7455 | `CODE_MALFORMED_REQUEST_BODY` | 400 | Malformed request body | JSON/XML body cannot be parsed |
| 7456 | `CODE_CONTENT_TYPE_NOT_SUPPORTED` | 400 | Content type not supported | Unsupported `Content-Type` header. Note: returns **400**, not 415 |

### 4.4 Server Errors (748x--749x)

| Code | Constant | HTTP Status | Description | When It Occurs |
|------|----------|-------------|-------------|----------------|
| 7481 | `CODE_WEBSERVER_MISCONFIGURED` | 500 | Webserver misconfigured | Required server variables (e.g., `PHP_AUTH_DIGEST`) not available |
| 7482 | `CODE_WEBSERVER_PATHINFO_INVALID` | 500 | PATH_INFO invalid | `PATH_INFO` server variable missing or malformed |
| 7499 | `CODE_UNEXPECTED_ERROR` | 500 | Unexpected error | Uncaught exception; catch-all error |

---

## 5. Response Format

### 5.1 Content Negotiation

The API supports two response formats, selected via the `Accept` header:

| Accept Header | Response Format |
|---------------|-----------------|
| `application/json` (default) | JSON |
| `application/xml` | XML |

If no `Accept` header is provided, the API defaults to JSON.

### 5.2 Error Response Structure

All error responses follow this JSON structure:

```json
{
  "error": {
    "code": 7452,
    "http_code": 404,
    "message": "Resource not found",
    "href": "https://your-instance/api/v1/addresses/99999"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `error.code` | integer | OpenXE-specific error code (see Section 4) |
| `error.http_code` | integer | HTTP status code |
| `error.message` | string | Human-readable error description |
| `error.href` | string | The request URL that caused the error |

### 5.3 Validation Error Response

Validation errors (code 7453) include an additional `details` array:

```json
{
  "error": {
    "code": 7453,
    "http_code": 400,
    "message": "Validation error",
    "href": "https://your-instance/api/v1/addresses",
    "details": [
      "Field 'name' is required",
      "Field 'email' must be a valid email address"
    ]
  }
}
```

### 5.4 Uncaught Exception Response

Uncaught exceptions (code 7499) include an `errors` array:

```json
{
  "error": {
    "code": 7499,
    "http_code": 500,
    "message": "Unexpected error",
    "href": "https://your-instance/api/v1/addresses",
    "errors": [
      "PDOException: SQLSTATE[42S02]: Base table or view not found"
    ]
  }
}
```

### 5.5 Authentication Challenge Response

When authentication fails or is missing, the server returns HTTP 401 with a `WWW-Authenticate` header:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Digest realm="Xentral-API", qop="auth", nonce="abc123...", opaque="def456..."
```

> **Note:** Unlike RFC 2617, the server does **not** include `stale=true` when a nonce expires. Instead, it returns error code **7417** (`CODE_DIGEST_NONCE_EXPIRED`) with a standard 401 response. Clients must treat any 401 after a previously valid nonce as a nonce expiry and re-authenticate from scratch.

---

## 6. Debug Mode

Debug mode can be enabled by setting the following constant in `/www/api/index.php`:

```php
define('DEBUG_MODE', true);
```

When enabled, API responses include additional fields:

| Field | Description |
|-------|-------------|
| `debug.router` | Router matching information |
| `debug.request.*` | Request details (headers, parsed body, etc.) |

> **Warning:** Debug mode exposes internal details. Never enable it in production.

---

## 7. Security Notes

### 7.1 Known Deviations from Standards

| Behavior | Expected | Actual | Impact |
|----------|----------|--------|--------|
| Missing permission | 403 Forbidden | **401 Unauthorized** (code 7421) | Clients cannot distinguish "bad credentials" from "insufficient permissions" |
| Validation error | 422 Unprocessable Entity | **400 Bad Request** (code 7453) | Minor; some REST clients expect 422 |
| Unsupported content type | 415 Unsupported Media Type | **400 Bad Request** (code 7456) | Minor; non-standard but functional |

### 7.2 Recommendations

1. **Always use HTTPS.** Digest Authentication prevents plaintext password transmission, but without TLS the nonce, opaque, and response hash are visible to network observers.
2. **Implement rate limiting at the reverse proxy.** The API has no built-in rate limiting.
3. **Use minimal permissions.** Grant each API account only the permissions it needs.
4. **Handle nonce expiry.** The server does not send `stale=true`; instead it returns error 7417. If you receive a 401 after previously successful authentication, assume the nonce has expired and re-authenticate from scratch.
5. **Be aware that nc checking is disabled.** If replay protection is critical, enforce it externally.
6. **Typo in source code.** The constant `CODE_DIGEST_VALIDDATION_FAILED` (7415) has a double "D" in "VALIDDATION". It is commented out and unused, but be aware of it if referencing constants directly.

---

## Live Instance Compatibility Notes

> **Verified:** 2026-03-31 against a live OpenXE instance.

- **Digest Auth** with realm `Xentral-API` confirmed working on a live instance (as documented in Section 1.1).
- **API path:** The live endpoint is `/api/index.php/` rather than `/api/v1/` directly. Apache blocks direct access to `/api/v1/` without a proper URL rewrite rule in place. Clients should use `/api/index.php/v1/...` unless the server's `.htaccess` or vhost config has been adjusted.
- **Error codes confirmed in live responses:** `7411` (Unauthorized), `7431` (Route not found), `7452` (Resource not found), `7454` (Invalid argument), `7499` (Unexpected error) -- all returned with the documented JSON structure from Section 5.
- **Pagination parameter for `adressen`:** The pagination query parameter accepted by the server is `items`, **not** `items_per_page`. This appears to be server-specific and may vary between OpenXE installations or versions. Always test pagination parameters against your target instance.
