---
name: all-branches-scope
description: Rules for which branches count in "All Branches" totals (admin dashboard + Sales Report). Use when adding or changing any analytics/report query, dashboard card, Sales Report page, or when a branch is added, renamed, or retired.
---

# "All Branches" scope

Only **5 real branches** are counted whenever the admin views **All Branches**
(Dashboard and every Sales Report page: Sales Analytics, Menu, Category,
Payment type, Receipt).

| ID | Code  | Branch            |
|----|-------|-------------------|
| 2  | BR002 | Kim's Brothers    |
| 3  | BR003 | Blue Moon         |
| 9  | BR006 | KumHo Restaurant  |
| 10 | BR007 | EESOME CAFE       |
| 12 | BR009 | PRIME BBQ         |

Every other branch is a **test account** and must never appear in All-Branches
totals, charts, rankings or lists: 3Core (4), NOIR BY EESOME (11),
Resto Demo (14), Daraejung (1, inactive), test (13, inactive).

A test branch is still viewable on its own: when a specific `branch_id` is
requested, queries filter `= that id` and the allowlist does not apply.

## Where the allowlist lives (keep in sync)

1. **Python:** `_ALL_BRANCHES_IDS` in `pyserver/main.py`. It is imported by
   `pyserver/reports.py` (menu/category/payment/receipt reports).
2. **Node:** `ALL_BRANCHES_IDS` / `ALL_BRANCHES_SQL_LIST` in
   `server/utils/allBranches.js`. It is used by `services/adminDashboardBundle.js`,
   `models/reportsModel.js`, `models/expenseModel.js` and
   `models/cashReconciliationModel.js`.

`src/utils/branchLogo.ts` (`isExcludedFromAllBranchesView`) is a separate,
name-based **UI** filter for the sidebar grid and compare list. It does not
control the numbers.

## Rules when writing queries

- When no `branch_id` is given (All Branches), always restrict to the
  allowlist. Never fall through to "no branch filter":
  ```python
  if branch_id:
      branch_filter = "AND b.BRANCH_ID = %s"; params.append(branch_id)
  else:
      branch_filter = f"AND b.BRANCH_ID IN ({','.join(map(str, _ALL_BRANCHES_IDS))})"
  ```
  ```js
  const { ALL_BRANCHES_SQL_LIST } = require('../utils/allBranches');
  // ...
  } else {
      sql += ` AND b.BRANCH_ID IN (${ALL_BRANCHES_SQL_LIST})`;
  }
  ```
- Use an allowlist (`IN`), never a denylist (`NOT IN`). That way a newly
  created test branch is excluded automatically.
- The **frontend must send `branch_id=all`** for All Branches. If `branch_id`
  is missing, `ReportsController.resolveAnalyticsBranchId` falls back to the
  logged-in user's branch.
- `server/utils/allBranches.js` holds constants only. Don't interpolate
  user input into the `IN (...)` list.

## Adding / removing a real branch

1. Get the ID: `SELECT IDNo, BRANCH_CODE, BRANCH_NAME, ACTIVE FROM branches;`
2. Update **both** `_ALL_BRANCHES_IDS` (`pyserver/main.py`) and
   `ALL_BRANCHES_IDS` (`server/utils/allBranches.js`).
3. If it should appear in the sidebar grid, also update
   `ALL_BRANCHES_SIDEBAR_MATCHERS` in `src/utils/branchLogo.ts`.
4. Restart both services: `pm2 restart resto-pyserver resto-nodeserver`.
   The frontend (`resto-frontend`, Vite dev) hot-reloads.

## Verify

```bash
grep -rn "_ALL_BRANCHES_IDS\|ALL_BRANCHES_SQL_LIST\|ALL_BRANCHES_IDS" pyserver/*.py server --include=*.js --include=*.py | grep -v node_modules
grep -rn "NOT IN (4\|_TEST_BRANCH_IDS\|TEST_BRANCH" pyserver/*.py server --include=*.js | grep -v node_modules   # should print nothing
```
