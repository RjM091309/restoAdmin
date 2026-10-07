# RestoAdmin Dashboard

A modern, responsive restaurant administration dashboard featuring inventory management, category tracking, and sales analytics.

## Demo Credentials (Local Development)

To access the dashboard locally, use the following credentials on the login page:

- **Username:** `admin`
- **Password:** `123`

## Developer

**Developed by 3Core Leaderstech**

## Getting Started

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start the local development server
4. Open `http://localhost:3000` in your browser

## "All Branches" scope

When **All Branches** is selected, the Dashboard and all Sales Report pages
(Sales Analytics, Menu, Category, Payment type, Receipt) count only these
5 real branches:

| ID | Branch |
|----|--------|
| 2  | Kim's Brothers |
| 3  | Blue Moon |
| 9  | KumHo Restaurant |
| 10 | EESOME CAFE |
| 12 | PRIME BBQ |

All other branches (3Core, NOIR BY EESOME, Resto Demo, inactive/test rows)
are test accounts and are left out of every total. They still show their own
data when selected individually.

The list is defined in two places, which must stay in sync:

- `pyserver/main.py`: `_ALL_BRANCHES_IDS`
- `server/utils/allBranches.js`: `ALL_BRANCHES_IDS`

After changing it, run `pm2 restart resto-pyserver resto-nodeserver`.
See `.claude/skills/all-branches-scope/SKILL.md` for the full rules.
