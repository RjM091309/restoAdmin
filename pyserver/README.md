# RESTO Python Server (`pyserver`)

Lightweight Python backend for analytics/reporting or heavy data processing
that complements the existing Node.js `server` folder.

## Setup

1. Create and activate a virtualenv (recommended):

```bash
cd pyserver
python -m venv .venv
source .venv/Scripts/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the server (default on port 8000):

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You can check it at:

- `GET http://localhost:8000/health`
- `GET http://localhost:8000/api/analytics/sample`

## Next steps

- Add real analytics/reporting endpoints under `/api/analytics/*`.
- From your React app, call `http://localhost:8000/...` instead of the Node.js
  server for analytics that you want Python to handle.


## "All Branches" scope

When an endpoint is called without `branch_id`, it aggregates only the real
branches in `_ALL_BRANCHES_IDS` (`main.py`):
Kim's Brothers (2), Blue Moon (3), KumHo (9), EESOME CAFE (10), PRIME BBQ (12).
`reports.py` imports the same constant. Every other branch is a test account.
Keep the list in sync with `server/utils/allBranches.js`.

New queries must use `IN (_ALL_BRANCHES_IDS)` in the no-`branch_id` path, never
an unfiltered query or a `NOT IN` denylist. In production the server runs under
pm2 as `resto-pyserver` (port 2100).
