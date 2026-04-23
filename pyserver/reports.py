from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from main import get_connection


router = APIRouter(prefix="/api/analytics", tags=["analytics-reports"])


def _norm_text_sql(col: str) -> str:
    """
    UPPER+TRIM after stripping NBSP variants in `col`.
    Important: some legacy rows contain raw byte 0xA0 (invalid in utf8mb4).
    We first treat the value as BINARY and replace NBSP bytes before converting to utf8mb4.
    """
    cleaned = (
        f"REPLACE(REPLACE(CAST(COALESCE({col}, '') AS BINARY), 0xA0, 0x20), 0xC2A0, 0x20)"
    )
    return f"UPPER(TRIM(CONVERT({cleaned} USING utf8mb4)))"

def _safe_text_sql(col: str) -> str:
    """
    Returns a display-safe SQL expression for text columns that may contain NBSP bytes.
    Strips NBSP variants, trims, and returns NULL when result is empty.
    """
    cleaned = (
        f"REPLACE(REPLACE(CAST(COALESCE({col}, '') AS BINARY), 0xA0, 0x20), 0xC2A0, 0x20)"
    )
    return f"NULLIF(TRIM(CONVERT({cleaned} USING utf8mb4)), '')"

def _norm_text_py(value: object) -> str:
    """Python-side normalization matching `_norm_text_sql` intent (NBSP → space, trim, upper, collapse spaces)."""
    s = str(value or "")
    s = s.replace("\u00a0", " ").replace("\xa0", " ")
    s = " ".join(s.strip().split())
    return s.upper()


class MenuReportRow(BaseModel):
    id: int
    goods: str
    category: str
    branch: str
    salesQty: int
    totalSales: float
    refundQty: int
    refundAmount: float
    discounts: float
    netSales: float
    unitCost: float
    totalRevenue: float


class CategoryReportRow(BaseModel):
    id: int
    category: str
    branch: str
    salesQty: int
    totalSales: float
    refundQty: int
    refundAmount: float
    discounts: float
    netSales: float
    unitCost: float
    totalRevenue: float


class CategoryMenuBreakdownRow(BaseModel):
    id: int
    menuName: str
    salesQty: float
    unitPrice: float  # menu.MENU_PRICE (catalog)
    netSales: float  # sum order_items.LINE_TOTAL


class PaymentReportRow(BaseModel):
    id: int
    paymentMethod: str
    paymentTransaction: int
    paymentAmount: float
    refundTransaction: int
    refundAmount: float
    netAmount: float


class ReceiptReportRow(BaseModel):
    id: int
    receiptNumber: str
    date: str
    employee: str
    customer: str
    type: str
    total: float
    discount: float


class ReceiptDetailItem(BaseModel):
    name: str
    qty: float
    unitPrice: float
    amount: float
    note: Optional[str] = None


class ReceiptDetail(BaseModel):
    orderLabel: str
    staff: str
    pos: str
    serviceType: str
    paymentMethod: str
    transactionNo: str
    items: List[ReceiptDetailItem]


class ExpenseSummary(BaseModel):
    total_expense: float


@router.get("/menu-report")
def menu_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Menu-level sales report.
    Aggregates order_items per menu with basic totals.
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        date_filter = ""
        branch_filter = ""
        params: List[object] = []

        print(
            "[PyServer] /menu-report params:",
            "start_date=", start_date,
            "end_date=", end_date,
            "branch_id=", branch_id,
        )

        if start_date and end_date:
            # Align date filter with billing-based analytics (daily-sales)
            date_filter = "AND DATE(b.ENCODED_DT) BETWEEN %s AND %s"
            params.extend([start_date, end_date])
        if branch_id:
            # Use billing.BRANCH_ID for consistency with other analytics
            branch_filter = "AND b.BRANCH_ID = %s"
            params.append(branch_id)

        # Subqueries use different billing aliases (b2 for amount, bq for qty).
        # Generate filters per-alias so SQL always references the correct table.
        date_filter_b2 = date_filter.replace("b.", "b2.") if date_filter else ""
        branch_filter_b2 = branch_filter.replace("b.", "b2.") if branch_filter else ""
        date_filter_bq = date_filter.replace("b.", "bq.") if date_filter else ""
        branch_filter_bq = branch_filter.replace("b.", "bq.") if branch_filter else ""

        query = f"""
            SELECT
                m.IDNo AS id,
                COALESCE({_safe_text_sql('m.MENU_NAME')}, '') AS goods,
                COALESCE({_safe_text_sql('c.CAT_NAME')}, 'Uncategorized') AS category,
                COALESCE(
                    NULLIF(
                        GROUP_CONCAT(
                            DISTINCT {_safe_text_sql('br.BRANCH_NAME')}
                            ORDER BY {_safe_text_sql('br.BRANCH_NAME')}
                            SEPARATOR ', '
                        ),
                        ''
                    ),
                    'Unknown Branch'
                ) AS branch,
                COALESCE(SUM(oi.QTY), 0) AS salesQty,
                COALESCE(SUM(oi.LINE_TOTAL), 0) AS totalSales,
                0 AS refundQty,
                0 AS refundAmount,
                0 AS discounts,
                0 AS unitCost
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
            INNER JOIN menu m ON m.IDNo = oi.MENU_ID
            LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
            LEFT JOIN branches br ON br.IDNo = b.BRANCH_ID
            WHERE 1=1
            {date_filter}
            {branch_filter}
              -- Prevent duplicate "Room Charge" when we also inject a synthetic row below.
              AND {_norm_text_sql('m.MENU_NAME')} <> 'ROOM CHARGE'
              -- Also fold any legacy "ROOM CHARGE" category sales into the synthetic Room Charge row.
              AND {_norm_text_sql('c.CAT_NAME')} <> 'ROOM CHARGE'
            GROUP BY m.IDNo, m.MENU_NAME, c.CAT_NAME
            HAVING salesQty > 0

            UNION ALL

            SELECT
                -9998 AS id,
                'Room Charge' AS goods,
                'Charges' AS category,
                COALESCE(
                    NULLIF(
                        GROUP_CONCAT(
                            DISTINCT {_safe_text_sql('br.BRANCH_NAME')}
                            ORDER BY {_safe_text_sql('br.BRANCH_NAME')}
                            SEPARATOR ', '
                        ),
                        ''
                    ),
                    'Unknown Branch'
                ) AS branch,
                (
                  COUNT(DISTINCT o.IDNo)
                  +
                  COALESCE((
                    SELECT SUM(oiq.QTY)
                    FROM orders oq
                    INNER JOIN billing bq ON bq.ORDER_ID = oq.IDNo AND bq.STATUS IN (1, 2)
                    INNER JOIN order_items oiq ON oiq.ORDER_ID = oq.IDNo
                    INNER JOIN menu mq ON mq.IDNo = oiq.MENU_ID
                    LEFT JOIN categories cq ON cq.IDNo = mq.CATEGORY_ID
                    WHERE {_norm_text_sql('cq.CAT_NAME')} = 'ROOM CHARGE'
                      AND {_norm_text_sql('mq.MENU_NAME')} <> 'ROOM CHARGE'
                      {date_filter_bq}
                      {branch_filter_bq}
                  ), 0)
                ) AS salesQty,
                (
                  COALESCE(SUM(o.SERVICE_CHARGE), 0)
                  +
                  COALESCE((
                    SELECT SUM(oi2.LINE_TOTAL)
                    FROM orders o2
                    INNER JOIN billing b2 ON b2.ORDER_ID = o2.IDNo AND b2.STATUS IN (1, 2)
                    INNER JOIN order_items oi2 ON oi2.ORDER_ID = o2.IDNo
                    INNER JOIN menu m2 ON m2.IDNo = oi2.MENU_ID
                    LEFT JOIN categories c2 ON c2.IDNo = m2.CATEGORY_ID
                    WHERE {_norm_text_sql('c2.CAT_NAME')} = 'ROOM CHARGE'
                      AND {_norm_text_sql('m2.MENU_NAME')} <> 'ROOM CHARGE'
                      {date_filter_b2}
                      {branch_filter_b2}
                  ), 0)
                ) AS totalSales,
                0 AS refundQty,
                0 AS refundAmount,
                0 AS discounts,
                0 AS unitCost
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            LEFT JOIN restaurant_tables rt ON rt.IDNo = o.TABLE_ID
            LEFT JOIN branches br ON br.IDNo = b.BRANCH_ID
            WHERE COALESCE(o.SERVICE_CHARGE, 0) > 0
              AND COALESCE(rt.ROOM_CHARGE, 0) > 0
            {date_filter}
            {branch_filter}
            HAVING salesQty > 0

            UNION ALL

            SELECT
                -9999 AS id,
                'Service Charge' AS goods,
                'Charges' AS category,
                COALESCE(
                    NULLIF(
                        GROUP_CONCAT(
                            DISTINCT {_safe_text_sql('br.BRANCH_NAME')}
                            ORDER BY {_safe_text_sql('br.BRANCH_NAME')}
                            SEPARATOR ', '
                        ),
                        ''
                    ),
                    'Unknown Branch'
                ) AS branch,
                COUNT(DISTINCT o.IDNo) AS salesQty,
                COALESCE(SUM(o.SERVICE_CHARGE), 0) AS totalSales,
                0 AS refundQty,
                0 AS refundAmount,
                0 AS discounts,
                0 AS unitCost
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            LEFT JOIN restaurant_tables rt ON rt.IDNo = o.TABLE_ID
            LEFT JOIN branches br ON br.IDNo = b.BRANCH_ID
            WHERE COALESCE(o.SERVICE_CHARGE, 0) > 0
              AND COALESCE(rt.ROOM_CHARGE, 0) = 0
            {date_filter}
            {branch_filter}
            HAVING salesQty > 0

            ORDER BY totalSales DESC
        """

        # date_filter / branch_filter are repeated across UNION branches and subqueries.
        # Occurrences:
        # - base menu aggregation (b)
        # - Room Charge row (b)
        # - Room Charge amount subquery (b2)
        # - Room Charge qty subquery (bq, uses the same param list order as b2 filters)
        # - Service Charge row (b)
        exec_params = params + params + params + params + params
        cur.execute(query, exec_params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] menu-report query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch menu report",
            "error": getattr(exc, "message", str(exc)),
        }

    items: List[MenuReportRow] = []
    for row in rows:
        total_sales = float(row.get("totalSales") or 0.0)
        refund_amount = float(row.get("refundAmount") or 0.0)
        discounts = float(row.get("discounts") or 0.0)
        net_sales = total_sales - refund_amount - discounts
        unit_cost = float(row.get("unitCost") or 0.0)
        total_revenue = net_sales

        items.append(
            MenuReportRow(
                id=int(row.get("id") or 0),
                goods=str(row.get("goods") or ""),
                category=str(row.get("category") or "Uncategorized"),
                branch=str(row.get("branch") or "Unknown Branch"),
                salesQty=int(row.get("salesQty") or 0),
                totalSales=total_sales,
                refundQty=int(row.get("refundQty") or 0),
                refundAmount=refund_amount,
                discounts=discounts,
                netSales=net_sales,
                unitCost=unit_cost,
                totalRevenue=total_revenue,
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in items]}}


@router.get("/category-report")
def category_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Category-level sales report.
    Aggregates order_items per category with basic totals.
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        date_filter = ""
        branch_filter = ""
        params: List[object] = []

        print(
            "[PyServer] /category-report params:",
            "start_date=", start_date,
            "end_date=", end_date,
            "branch_id=", branch_id,
        )

        if start_date and end_date:
            # Align date filter with billing-based analytics (daily-sales)
            date_filter = "AND DATE(b.ENCODED_DT) BETWEEN %s AND %s"
            params.extend([start_date, end_date])
        if branch_id:
            # Use billing.BRANCH_ID for consistency with other analytics
            branch_filter = "AND b.BRANCH_ID = %s"
            params.append(branch_id)

        # Subqueries use different billing aliases (b2 for amount, bq for qty).
        # Generate filters per-alias so SQL always references the correct table.
        date_filter_b2 = date_filter.replace("b.", "b2.") if date_filter else ""
        branch_filter_b2 = branch_filter.replace("b.", "b2.") if branch_filter else ""
        date_filter_bq = date_filter.replace("b.", "bq.") if date_filter else ""
        branch_filter_bq = branch_filter.replace("b.", "bq.") if branch_filter else ""

        query = f"""
            SELECT
                COALESCE(c.IDNo, 0) AS id,
                COALESCE({_safe_text_sql('c.CAT_NAME')}, 'Uncategorized') AS category,
                COALESCE(
                    NULLIF(
                        GROUP_CONCAT(
                            DISTINCT {_safe_text_sql('br.BRANCH_NAME')}
                            ORDER BY {_safe_text_sql('br.BRANCH_NAME')}
                            SEPARATOR ', '
                        ),
                        ''
                    ),
                    'Unknown Branch'
                ) AS branch,
                COALESCE(SUM(oi.QTY), 0) AS salesQty,
                COALESCE(SUM(oi.LINE_TOTAL), 0) AS totalSales,
                0 AS refundQty,
                0 AS refundAmount,
                0 AS discounts,
                0 AS unitCost
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
            INNER JOIN menu m ON m.IDNo = oi.MENU_ID
            LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
            LEFT JOIN branches br ON br.IDNo = b.BRANCH_ID
            WHERE 1=1
            {date_filter}
            {branch_filter}
              -- Prevent the synthetic Room Charge row from double-counting.
              AND {_norm_text_sql('m.MENU_NAME')} <> 'ROOM CHARGE'
              AND {_norm_text_sql('c.CAT_NAME')} <> 'ROOM CHARGE'
            GROUP BY c.IDNo, c.CAT_NAME
            HAVING salesQty > 0

            UNION ALL

            -- Synthetic Room Charge row: qty matches menu-report (COUNT distinct orders on room-charge tables),
            -- amount matches category-report logic (service_charge + legacy ROOM CHARGE category items).
            SELECT
                -9998 AS id,
                'Room Charge' AS category,
                COALESCE(
                    NULLIF(
                        GROUP_CONCAT(
                            DISTINCT {_safe_text_sql('br.BRANCH_NAME')}
                            ORDER BY {_safe_text_sql('br.BRANCH_NAME')}
                            SEPARATOR ', '
                        ),
                        ''
                    ),
                    'Unknown Branch'
                ) AS branch,
                (
                  COUNT(DISTINCT o.IDNo)
                  +
                  COALESCE((
                    SELECT SUM(oiq.QTY)
                    FROM orders oq
                    INNER JOIN billing bq ON bq.ORDER_ID = oq.IDNo AND bq.STATUS IN (1, 2)
                    INNER JOIN order_items oiq ON oiq.ORDER_ID = oq.IDNo
                    INNER JOIN menu mq ON mq.IDNo = oiq.MENU_ID
                    LEFT JOIN categories cq ON cq.IDNo = mq.CATEGORY_ID
                    WHERE {_norm_text_sql('cq.CAT_NAME')} = 'ROOM CHARGE'
                      AND {_norm_text_sql('mq.MENU_NAME')} <> 'ROOM CHARGE'
                    {date_filter_bq}
                    {branch_filter_bq}
                  ), 0)
                ) AS salesQty,
                (
                  COALESCE(SUM(o.SERVICE_CHARGE), 0)
                  +
                  COALESCE((
                    SELECT SUM(oi2.LINE_TOTAL)
                    FROM orders o2
                    INNER JOIN billing b2 ON b2.ORDER_ID = o2.IDNo AND b2.STATUS IN (1, 2)
                    INNER JOIN order_items oi2 ON oi2.ORDER_ID = o2.IDNo
                    INNER JOIN menu m2 ON m2.IDNo = oi2.MENU_ID
                    LEFT JOIN categories c2 ON c2.IDNo = m2.CATEGORY_ID
                    WHERE {_norm_text_sql('c2.CAT_NAME')} = 'ROOM CHARGE'
                      AND {_norm_text_sql('m2.MENU_NAME')} <> 'ROOM CHARGE'
                    {date_filter_b2}
                    {branch_filter_b2}
                  ), 0)
                ) AS totalSales,
                0 AS refundQty,
                0 AS refundAmount,
                0 AS discounts,
                0 AS unitCost
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            LEFT JOIN restaurant_tables rt ON rt.IDNo = o.TABLE_ID
            LEFT JOIN branches br ON br.IDNo = b.BRANCH_ID
            WHERE COALESCE(o.SERVICE_CHARGE, 0) > 0
              AND COALESCE(rt.ROOM_CHARGE, 0) > 0
            {date_filter}
            {branch_filter}
            HAVING salesQty > 0
            ORDER BY totalSales DESC
        """

        # Params are reused across: base + synthetic row + qty subquery + amount subquery.
        exec_params = params + params + params + params
        cur.execute(query, exec_params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] category-report query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch category report",
            "error": getattr(exc, "message", str(exc)),
        }

    items: List[CategoryReportRow] = []
    for row in rows:
        total_sales = float(row.get("totalSales") or 0.0)
        refund_amount = float(row.get("refundAmount") or 0.0)
        discounts = float(row.get("discounts") or 0.0)
        net_sales = total_sales - refund_amount - discounts
        unit_cost = float(row.get("unitCost") or 0.0)
        total_revenue = net_sales

        items.append(
            CategoryReportRow(
                id=int(row.get("id") or 0),
                category=str(row.get("category") or "Uncategorized"),
                branch=str(row.get("branch") or "Unknown Branch"),
                salesQty=int(row.get("salesQty") or 0),
                totalSales=total_sales,
                refundQty=int(row.get("refundQty") or 0),
                refundAmount=refund_amount,
                discounts=discounts,
                netSales=net_sales,
                unitCost=unit_cost,
                totalRevenue=total_revenue,
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in items]}}


# Per-table room charge breakdown rows: id = ROOM_CHARGE_TABLE_DETAIL_BASE - restaurant_tables.IDNo
ROOM_CHARGE_TABLE_DETAIL_BASE = -9_000_000_000


@router.get("/category-menu-breakdown")
def category_menu_breakdown(
    category_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Per menu item within a single category: name, qty, catalog unit price (menu.MENU_PRICE), sum of line amounts.
    Uses the same scope as category-report (billing date/branch, status 1/2) minus Room Charge exclusion rules.
    Synthetic Room Charge (category_id -9998) returns: per-table lines for table-based room charges
    (orders.SERVICE_CHARGE grouped by restaurant_tables with ROOM_CHARGE > 0), then per-menu lines for
    items in category name ROOM CHARGE (excluding a literal menu named ROOM CHARGE), matching category-report.
    Synthetic Service Charge (-9999) still has no expansion.
    """
    if category_id == -9999:
        return {"success": True, "data": {"data": []}}

    if category_id == -9998:
        conn = None
        cur = None
        try:
            conn = get_connection()
            cur = conn.cursor(dictionary=True)

            date_filter = ""
            branch_filter = ""
            room_params: List[object] = []

            if start_date and end_date:
                date_filter = "AND DATE(b.ENCODED_DT) BETWEEN %s AND %s"
                room_params.extend([start_date, end_date])
            if branch_id:
                branch_filter = "AND b.BRANCH_ID = %s"
                room_params.append(branch_id)

            print(
                "[PyServer] /category-menu-breakdown room-charge params:",
                "start_date=",
                start_date,
                "end_date=",
                end_date,
                "branch_id=",
                branch_id,
            )

            room_items: List[CategoryMenuBreakdownRow] = []
            table_label_norms: set[str] = set()

            q_tables_detail = f"""
                SELECT
                    rt.IDNo AS tbl_id,
                    COALESCE(NULLIF(TRIM(rt.TABLE_NUMBER), ''), CONCAT('#', rt.IDNo)) AS tbl_label,
                    COALESCE(rt.ROOM_CHARGE, 0) AS room_rate,
                    COUNT(DISTINCT o.IDNo) AS salesQty,
                    COALESCE(SUM(o.SERVICE_CHARGE), 0) AS totalService
                FROM orders o
                INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
                INNER JOIN restaurant_tables rt ON rt.IDNo = o.TABLE_ID
                WHERE COALESCE(o.SERVICE_CHARGE, 0) > 0
                  AND COALESCE(rt.ROOM_CHARGE, 0) > 0
                {date_filter}
                {branch_filter}
                GROUP BY rt.IDNo, rt.TABLE_NUMBER, rt.ROOM_CHARGE
                HAVING COUNT(DISTINCT o.IDNo) > 0
                   AND COALESCE(SUM(o.SERVICE_CHARGE), 0) <> 0
                ORDER BY totalService DESC, tbl_label ASC
            """
            cur.execute(q_tables_detail, tuple(room_params))
            for trow in cur.fetchall():
                tbl_id = int(trow.get("tbl_id") or 0)
                label = str(trow.get("tbl_label") or "").strip() or f"#{tbl_id}"
                # Defensive cleanup: older UI labels may have been saved like "Table ROOM 10 — room charge".
                clean = " ".join(label.replace("\u2014", "-").strip().split())
                if clean.lower().startswith("table "):
                    clean = clean[6:].strip()
                for suffix in ("- room charge", "— room charge"):
                    if clean.lower().endswith(suffix):
                        clean = clean[: -len(suffix)].strip()
                        break
                clean = " ".join(clean.strip().split())
                if not clean:
                    clean = label
                table_label_norms.add(_norm_text_py(clean))
                rate = float(trow.get("room_rate") or 0)
                oc = float(trow.get("salesQty") or 0)
                total_service = float(trow.get("totalService") or 0)
                qty_effective = (total_service / rate) if rate > 0 else oc
                qty_display = round(qty_effective, 2) if qty_effective > 0 else 0.0
                menu_label = clean
                room_items.append(
                    CategoryMenuBreakdownRow(
                        id=ROOM_CHARGE_TABLE_DETAIL_BASE - tbl_id,
                        menuName=menu_label,
                        salesQty=qty_display,
                        unitPrice=rate,
                        netSales=total_service,
                    )
                )

            q_menus = f"""
                SELECT
                    m.IDNo AS id,
                    m.MENU_NAME AS menuName,
                    COALESCE(SUM(oi.QTY), 0) AS salesQty,
                    COALESCE(MAX(m.MENU_PRICE), 0) AS unitPrice,
                    COALESCE(SUM(oi.LINE_TOTAL), 0) AS netSales
                FROM orders o
                INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
                INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
                INNER JOIN menu m ON m.IDNo = oi.MENU_ID
                LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
                WHERE {_norm_text_sql('c.CAT_NAME')} = 'ROOM CHARGE'
                  AND {_norm_text_sql('m.MENU_NAME')} <> 'ROOM CHARGE'
                {date_filter}
                {branch_filter}
                GROUP BY m.IDNo, m.MENU_NAME
                HAVING salesQty > 0
                ORDER BY netSales DESC, menuName ASC
            """
            cur.execute(q_menus, tuple(room_params))
            for row in cur.fetchall():
                menu_name = str(row.get("menuName") or "")
                # Avoid redundant "ROOM 10 / ON AIR 2 ..." lines when we already show the per-table rows.
                if _norm_text_py(menu_name) in table_label_norms:
                    continue
                sq_raw = float(row.get("salesQty") or 0)
                room_items.append(
                    CategoryMenuBreakdownRow(
                        id=int(row.get("id") or 0),
                        menuName=menu_name,
                        salesQty=sq_raw,
                        unitPrice=float(row.get("unitPrice") or 0.0),
                        netSales=float(row.get("netSales") or 0.0),
                    )
                )

            return {"success": True, "data": {"data": [item.model_dump() for item in room_items]}}
        except Exception as exc:
            print("[PyServer] category-menu-breakdown room-charge failed:", getattr(exc, "message", str(exc)))
            return {
                "success": False,
                "message": "Failed to fetch room charge breakdown",
                "error": getattr(exc, "message", str(exc)),
            }
        finally:
            try:
                if cur is not None:
                    cur.close()
            except Exception:
                pass
            try:
                if conn is not None and getattr(conn, "is_connected", lambda: False)():
                    conn.close()
            except Exception:
                pass

    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        date_filter = ""
        branch_filter = ""
        main_params: List[object] = []

        if start_date and end_date:
            date_filter = "AND DATE(b.ENCODED_DT) BETWEEN %s AND %s"
            main_params.extend([start_date, end_date])
        if branch_id:
            branch_filter = "AND b.BRANCH_ID = %s"
            main_params.append(branch_id)

        if category_id == 0:
            category_clause = "AND c.IDNo IS NULL"
            exec_params = list(main_params)
        else:
            category_clause = "AND c.IDNo = %s"
            exec_params = list(main_params) + [category_id]

        query = f"""
            SELECT
                m.IDNo AS id,
                m.MENU_NAME AS menuName,
                COALESCE(SUM(oi.QTY), 0) AS salesQty,
                COALESCE(MAX(m.MENU_PRICE), 0) AS unitPrice,
                COALESCE(SUM(oi.LINE_TOTAL), 0) AS netSales
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
            INNER JOIN menu m ON m.IDNo = oi.MENU_ID
            LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
            WHERE 1=1
            {date_filter}
            {branch_filter}
              AND {_norm_text_sql('m.MENU_NAME')} <> 'ROOM CHARGE'
              AND {_norm_text_sql('c.CAT_NAME')} <> 'ROOM CHARGE'
            {category_clause}
            GROUP BY m.IDNo, m.MENU_NAME
            HAVING salesQty > 0
            ORDER BY netSales DESC, menuName ASC
        """

        print(
            "[PyServer] /category-menu-breakdown params:",
            "category_id=",
            category_id,
            "start_date=",
            start_date,
            "end_date=",
            end_date,
            "branch_id=",
            branch_id,
        )

        cur.execute(query, exec_params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] category-menu-breakdown query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch category menu breakdown",
            "error": getattr(exc, "message", str(exc)),
        }

    items: List[CategoryMenuBreakdownRow] = []
    for row in rows:
        items.append(
            CategoryMenuBreakdownRow(
                id=int(row.get("id") or 0),
                menuName=str(row.get("menuName") or ""),
                salesQty=float(row.get("salesQty") or 0.0),
                unitPrice=float(row.get("unitPrice") or 0.0),
                netSales=float(row.get("netSales") or 0.0),
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in items]}}


@router.get("/payment-report")
def payment_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Payment method breakdown.
    Aggregates billing table by PAYMENT_METHOD.
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        date_filter = ""
        branch_filter = ""
        params: List[object] = []

        print(
            "[PyServer] /payment-report params:",
            "start_date=", start_date,
            "end_date=", end_date,
            "branch_id=", branch_id,
        )

        if start_date and end_date:
            date_filter = "AND DATE(b.ENCODED_DT) BETWEEN %s AND %s"
            params.extend([start_date, end_date])
        if branch_id:
            branch_filter = "AND b.BRANCH_ID = %s"
            params.append(branch_id)

        query = f"""
            SELECT
                COALESCE(b.PAYMENT_METHOD, 'UNKNOWN') AS paymentMethod,
                COUNT(*) AS paymentTransaction,
                COALESCE(SUM(b.AMOUNT_PAID), 0) AS paymentAmount,
                COALESCE(SUM(CASE WHEN b.REFUND IS NOT NULL AND b.REFUND > 0 THEN 1 ELSE 0 END), 0) AS refundTransaction,
                COALESCE(SUM(b.REFUND), 0) AS refundAmount
            FROM billing b
            WHERE b.STATUS IN (1, 2)
            {date_filter}
            {branch_filter}
            GROUP BY b.PAYMENT_METHOD
        """

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] payment-report query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch payment report",
            "error": getattr(exc, "message", str(exc)),
        }

    items: List[PaymentReportRow] = []
    for idx, row in enumerate(rows, start=1):
        payment_amount = float(row.get("paymentAmount") or 0.0)
        refund_amount = float(row.get("refundAmount") or 0.0)
        net_amount = payment_amount - refund_amount

        items.append(
            PaymentReportRow(
                id=idx,
                paymentMethod=str(row.get("paymentMethod") or "UNKNOWN"),
                paymentTransaction=int(row.get("paymentTransaction") or 0),
                paymentAmount=payment_amount,
                refundTransaction=int(row.get("refundTransaction") or 0),
                refundAmount=refund_amount,
                netAmount=net_amount,
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in items]}}


@router.get("/receipt-detail")
def receipt_detail(order_id: int) -> dict:
    """
    Return detailed line items for a given receipt/order.
    Data is sourced from orders + order_items + menu (+ billing for payment method).
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        params: List[object] = [order_id]

        query = """
            SELECT
                o.IDNo AS order_id,
                COALESCE(o.ORDER_NO, CONCAT('ORD-', o.IDNo)) AS receiptNumber,
                '' AS staff,
                'POS 1' AS pos,
                'Dine in' AS serviceType,
                COALESCE(b.PAYMENT_METHOD, 'UNKNOWN') AS paymentMethod,
                m.MENU_NAME AS name,
                oi.QTY AS qty,
                oi.UNIT_PRICE AS unitPrice,
                oi.LINE_TOTAL AS amount
            FROM orders o
            INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
            INNER JOIN menu m ON m.IDNo = oi.MENU_ID
            LEFT JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            WHERE o.IDNo = %s
            ORDER BY oi.IDNo ASC
        """

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] receipt-detail query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch receipt detail",
            "error": getattr(exc, "message", str(exc)),
        }

    if not rows:
        return {
            "success": True,
            "data": {
                "orderLabel": "",
                "staff": "",
                "pos": "",
                "serviceType": "",
                "paymentMethod": "",
                "transactionNo": "",
                "items": [],
            },
        }

    first = rows[0]
    items: List[ReceiptDetailItem] = []
    for row in rows:
        items.append(
            ReceiptDetailItem(
                name=str(row.get("name") or ""),
                qty=float(row.get("qty") or 0),
                unitPrice=float(row.get("unitPrice") or 0.0),
                amount=float(row.get("amount") or 0.0),
                note=None,
            )
        )

    detail = ReceiptDetail(
        orderLabel=f'order: {first.get("receiptNumber") or ""}',
        staff=str(first.get("staff") or ""),
        pos=str(first.get("pos") or "POS 1"),
        serviceType=str(first.get("serviceType") or "Dine in"),
        paymentMethod=str(first.get("paymentMethod") or "Cash"),
        transactionNo=f'№ {first.get("receiptNumber") or ""}',
        items=items,
    )

    return {"success": True, "data": detail.model_dump()}


@router.get("/receipt-report")
def receipt_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
    type: Optional[str] = None,
) -> dict:
    """
    Receipt-level list based on orders + billing.
    type filter:
      - sale: STATUS in (1,2) and REFUND IS NULL/0
      - refund: REFUND > 0
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        date_filter = ""
        branch_filter = ""
        type_filter = ""
        params: List[object] = []

        print(
            "[PyServer] /receipt-report params:",
            "start_date=", start_date,
            "end_date=", end_date,
            "branch_id=", branch_id,
            "type=", type,
        )

        if start_date and end_date:
            # Align date filter with billing-based analytics (daily-sales)
            date_filter = "AND DATE(b.ENCODED_DT) BETWEEN %s AND %s"
            params.extend([start_date, end_date])
        if branch_id:
            # Use billing.BRANCH_ID for consistency with other analytics
            branch_filter = "AND b.BRANCH_ID = %s"
            params.append(branch_id)

        if type == "sale":
            type_filter = "AND (b.REFUND IS NULL OR b.REFUND = 0)"
        elif type == "refund":
            type_filter = "AND b.REFUND IS NOT NULL AND b.REFUND > 0"

        query = f"""
            SELECT
                o.IDNo AS id,
                COALESCE(o.ORDER_NO, CONCAT('ORD-', o.IDNo)) AS receiptNumber,
                o.ENCODED_DT AS date_raw,
                COALESCE(o.ENCODED_BY, 0) AS staff_id,
                '' AS employee,
                '' AS customer,
                CASE
                    WHEN b.REFUND IS NOT NULL AND b.REFUND > 0 THEN 'refund'
                    ELSE 'sale'
                END AS type,
                COALESCE(b.AMOUNT_PAID, 0) AS total,
                COALESCE(o.DISCOUNT_AMOUNT, 0) AS discount
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            WHERE 1=1
            {date_filter}
            {branch_filter}
            {type_filter}
            ORDER BY o.ENCODED_DT DESC
        """

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] receipt-report query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch receipt report",
            "error": getattr(exc, "message", str(exc)),
        }

    items: List[ReceiptReportRow] = []
    for row in rows:
        raw = row.get("date_raw")
        formatted = ""
        if raw is not None:
            try:
                if isinstance(raw, str):
                    dt = datetime.fromisoformat(raw)
                else:
                    dt = raw  # MySQL connector may return datetime
                formatted = dt.strftime("%d %b %Y %H:%M")
            except Exception:
                formatted = str(raw)

        items.append(
            ReceiptReportRow(
                id=int(row.get("id") or 0),
                receiptNumber=str(row.get("receiptNumber") or ""),
                date=formatted,
                employee=str(row.get("employee") or ""),
                customer=str(row.get("customer") or ""),
                type=str(row.get("type") or "sale"),
                total=float(row.get("total") or 0.0),
                discount=float(row.get("discount") or 0.0),
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in items]}}


@router.get("/expense-summary")
def expense_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Expense summary for a given period/branch.
    Mirrors Node ExpenseModel.getSummary:
    - Sums EXP_AMOUNT from expenses table
    - Optional filters: branch_id, start_date/end_date on ENCODED_DT
    - Excludes Inventory category type to match existing reports
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        where_clauses: List[str] = ["e.ACTIVE = 1", "oc.ACTIVE = 1"]
        params: List[object] = []

        if branch_id:
            where_clauses.append("e.BRANCH_ID = %s")
            params.append(branch_id)

        if start_date and end_date:
            where_clauses.append("DATE(e.ENCODED_DT) >= %s")
            where_clauses.append("DATE(e.ENCODED_DT) <= %s")
            params.extend([start_date, end_date])

        # Match Node ExpenseModel.getSummary semantics:
        # - Sum EXP_AMOUNT from expenses
        # - Join operation_category, filter oc.ACTIVE = 1
        where_sql = " AND ".join(where_clauses)

        query = f"""
            SELECT
                COALESCE(SUM(e.EXP_AMOUNT), 0) AS total_expense
            FROM expenses e
            LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
            INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
            WHERE {where_sql}
        """

        cur.execute(query, params)
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] expense-summary query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch expense summary",
            "error": getattr(exc, "message", str(exc)),
        }

    safe_row = row or {}
    summary = ExpenseSummary(total_expense=float(safe_row.get("total_expense") or 0.0))
    return {"success": True, "data": summary.model_dump()}

