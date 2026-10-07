// ============================================
// ALL BRANCHES SCOPE
// ============================================
// File: utils/allBranches.js
// Description: The real branches counted in "All Branches" aggregates (dashboard + Sales Report).
// Every other branch (3Core, NOIR BY EESOME, Resto Demo, inactive/test rows) is a test account.
// Mirrors _ALL_BRANCHES_IDS in pyserver/main.py — keep both lists in sync.
// ============================================

/** Kim's Brothers (2), Blue Moon (3), KumHo Restaurant (9), EESOME CAFE (10), PRIME BBQ (12). */
const ALL_BRANCHES_IDS = [2, 3, 9, 10, 12];

/** SQL list literal for `IN (...)` — constants only, never user input. */
const ALL_BRANCHES_SQL_LIST = ALL_BRANCHES_IDS.join(',');

module.exports = { ALL_BRANCHES_IDS, ALL_BRANCHES_SQL_LIST };
