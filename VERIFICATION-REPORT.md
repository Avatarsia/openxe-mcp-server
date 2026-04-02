# OpenXE MCP Server: Sort, Limit, and Custom Fields Verification

## Test Results Summary

**Date:** 2026-04-01  
**Test Environment:** OpenXE instance at http://192.168.0.143  
**Credentials:** user/user

---

## FINDINGS

### Test 1: sort_field and sort_order (Orders)
**Request:** `openxe-list-orders` with `sort_field: "gesamtsumme"`, `sort_order: "desc"`, `limit: 5`

**Results:**
- ✗ **SORT NOT WORKING** - Data returned is NOT sorted by gesamtsumme descending
- Expected: Highest values first (e.g., 25781.05, 21051.03, 20315.75, ...)
- Actual: Random order (737.8, 73.78, 368.9, 10.17, 10.17, 0, 0, ...)
- ✗ **LIMIT NOT WORKING** - Returned 50 items instead of 5 items

**Returned Sum Values (first 50):**
```
737.8, 73.78, 368.9, 10.17, 10.17, 0, 0, 0, 0, 0, 112.51, 112.51, 112.51, 
11326.36, 20315.75, 16690.21, 20049.63, 4853.47, 3991.32, 10419.7, 5469.3, 
25781.05, 27.38, 218.72, 12719.26, 14463.68, 3431.66, 825.5, 62.8, 63.56, 
365.15, 9063.18, 14293.15, 2122.42, 4979.35, 12286.93, 20297.03, 1479.35, 
7804.08, 2587.48, 18704.6, 6793.13, 719.31, 21051.03, 17208.65, 68.51, 3957.46, 
5646.13, 3836.02, 8796.61
```

---

### Test 2: fields parameter (Addresses)
**Request:** `openxe-list-addresses` with `fields: ["kundennummer", "name", "plz"]`, `limit: 5`

**Results:**
- ✗ **FIELDS PARAMETER NOT WORKING** - All fields returned, not just requested ones
- Expected: Only 3 fields in response: kundennummer, name, plz
- Actual: 10 fields in response: id, name, vorname, kundennummer, lieferantennummer, ort, land, email, telefon, typ
- ✗ **LIMIT NOT WORKING** - Returned 50 items instead of 5 items
- ✗ **PLZ FIELD MISSING** - The "plz" field was requested but isn't present in the response at all (returns undefined)

**Actual Fields Present:**
```
id, name, vorname, kundennummer, lieferantennummer, ort, land, email, telefon, typ
```

---

### Test 3: sort_field and limit (Addresses by Name)
**Request:** `openxe-list-addresses` with `sort_field: "name"`, `sort_order: "asc"`, `limit: 3`

**Results:**
- ✓ **SORT WORKING** - Data IS sorted by name ascending
- ✗ **LIMIT NOT WORKING** - Returned 50 items instead of 3 items

**Names (correctly sorted, first 10):**
```
1.  3D Partner
2.  3D Partner
3.  Administrator
4.  AlpenFertigung e.K.
5.  AlpenHandel AG
6.  AlpenHandel GmbH & Co. KG
7.  AlpenLogistik GmbH
8.  AlpenSolutions GmbH
9.  AlpenSolutions KG
10. Andrea Meyer
```

---

## Root Cause Analysis

### Documentation vs. Implementation Mismatch

**In router.ts (line 157-162), the discover output claims:**
```
fields        Nur bestimmte Felder: ["kundennummer", "name", "plz"]
sort_field    Sortieren nach Feld (z.B. "gesamtsumme", "datum", "name")
sort_order    "asc" oder "desc"
limit         Max. Ergebnisse (z.B. 10 fuer Top-10)
```

**BUT in read-tools.ts and document-read-tools.ts:**
- `ListAddressesInput` schema does NOT include: `sort_field`, `sort_order`, `limit`, `fields`
- `ListArticlesInput` schema does NOT include: `sort_field`, `sort_order`, `limit`, `fields`
- `ListFilters` (document list schema) does NOT include: `sort_field`, `sort_order`, `limit`, `fields`

### Parameter Handling

The handlers **completely ignore** these parameters:
- `sort_field`, `sort_order`, `limit`, and `fields` are not parsed from args
- No server-side or client-side logic processes these parameters
- The response always returns 50 items (hits MAX_LIST_RESULTS default)
- No field filtering occurs

---

## Detailed Issue Breakdown

| Parameter | Tool Type | Status | Issue |
|-----------|-----------|--------|-------|
| `sort_field` | read-tools | ✗ NOT WORKING | Not in Zod schema, no handler code |
| `sort_order` | read-tools | ✗ NOT WORKING | Not in Zod schema, no handler code |
| `limit` | read-tools | ✗ NOT WORKING | Not in Zod schema, always returns 50 items |
| `fields` | read-tools | ✗ NOT WORKING | Not in Zod schema, all fields returned |
| `sort_field` | document-read-tools | ✗ NOT WORKING | Not in Zod schema, no handler code |
| `sort_order` | document-read-tools | ✗ NOT WORKING | Not in Zod schema, no handler code |
| `limit` | document-read-tools | ✗ NOT WORKING | Not in Zod schema, always returns 50 items |
| `fields` | document-read-tools | ✗ NOT WORKING | Not in Zod schema, not applicable for documents |

---

## Files Requiring Changes

1. **src/tools/read-tools.ts**
   - Add `sort_field`, `sort_order`, `limit`, `fields` to input schemas
   - Implement sorting logic (client-side using applySort or similar)
   - Implement field filtering logic
   - Implement limit logic to truncate results

2. **src/tools/document-read-tools.ts**
   - Add `sort_field`, `sort_order`, `limit` to ListFilters schema
   - Implement sorting logic
   - Implement limit logic to truncate results

3. **src/utils/smart-filters.ts** (likely needs new functions)
   - `applySort(data, field, order)` - Sort array by field
   - `applyLimit(data, limit)` - Truncate array to limit
   - `applyFields(data, fields)` - Filter object properties

4. **src/tools/router.ts**
   - Discover documentation is correct, but implementations don't match

---

## Live Test Data Samples

### Orders Data (First Item)
```json
{
  "id": 1,
  "belegnr": "200000",
  "status": "freigegeben",
  "name": "Max Muster",
  "kundennummer": "10000",
  "datum": "2024-09-30",
  "gesamtsumme": "737.80",
  "waehrung": "EUR"
}
```

### Addresses Data (First Item)
```json
{
  "id": "29",
  "name": "3D Partner",
  "vorname": "",
  "kundennummer": "10003",
  "lieferantennummer": "",
  "ort": "Bremerhaven",
  "land": "DE",
  "email": "kontakt@partner-3d.de",
  "telefon": "042112345678",
  "typ": "firma"
}
```

Note: The "plz" (postal code) field is not present in the address data returned by the API.

---

## Conclusion

The MCP server's documentation (router.ts discover output) promises sort_field, sort_order, limit, and fields parameters as part of "Smart Filter" functionality, but:

1. **These parameters are NOT defined in the Zod input schemas** of either read-tools.ts or document-read-tools.ts
2. **No handler code processes these parameters** even if they were passed
3. **Live testing confirms they don't work** - data is not sorted, limit is ignored, and fields aren't filtered

The feature is documented but not implemented.
