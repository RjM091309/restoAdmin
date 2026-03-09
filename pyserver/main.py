from typing import List, Optional
import os
from pathlib import Path

import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parents[1]

# Load shared env used by Node server
load_dotenv(BASE_DIR / ".env.local")
load_dotenv(BASE_DIR / ".env", override=False)


def _get_db_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME"),
        "port": int(os.getenv("DB_PORT", "3306")),
    }


db_config = _get_db_config()

db_pool: Optional[pooling.MySQLConnectionPool] = None


def get_connection():
    if db_pool is None:
        raise RuntimeError("Database pool is not initialized")
    return db_pool.get_connection()


app = FastAPI(title="RESTO Analytics PyServer", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def init_db_pool():
    """
    Initialize MySQL connection pool and log basic DB info.
    """
    global db_pool
    try:
        db_pool = pooling.MySQLConnectionPool(
            pool_name="resto_pool",
            pool_size=5,
            **db_config,
        )
        conn = db_pool.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT DATABASE()")
        row = cur.fetchone()
        cur.close()
        conn.close()
        print(
            f"[PyServer] Connected to MySQL at {db_config['host']}:{db_config['port']} - DB: {row[0] if row and row[0] else db_config['database']}"
        )
    except Exception as exc:
        print("[PyServer] Failed to initialize MySQL pool:", getattr(exc, "message", str(exc)))


@app.get("/health")
def health_check():
    """
    Basic health check. Also reports if DB config looks present.
    """
    return {
        "status": "ok",
        "service": "pyserver",
        "db_configured": bool(db_config.get("database")),
    }


@app.get("/api/analytics/sample")
def sample_analytics():
    return {
        "success": True,
        "data": {
            "message": "Python analytics service is working",
        },
    }


class BranchSalesItem(BaseModel):
    branch_id: int
    branch_name: str
    branch_code: str
    total_sales: float
    order_count: int
    avg_order_value: float


class LeastSellingItem(BaseModel):
    IDNo: int
    MENU_NAME: str
    MENU_PRICE: float
    category: str
    total_quantity: int
    order_count: int
    total_revenue: float


class TopSellingItem(LeastSellingItem):
    """
    Top-selling menu item. Shape is identical to LeastSellingItem.
    """
    pass

class DailySalesItem(BaseModel):
    sale_date: str
    total_sales: float
    refund: float
    discount: float
    net_sales: float
    gross_profit: float


class ExpenseSummary(BaseModel):
    total_expense: float


class ExpenseCategoryRow(BaseModel):
    branch_id: int
    exp_cat: str
    exp_name: str
    entry_count: int
    total_amount: float


@app.get("/api/analytics/branch-sales")
def branch_sales(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Total sales per branch based purely on live billing data.
    Legacy summary table sales_hourly_summary has been removed.
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        date_filter_billing = ""
        branch_filter_billing = ""
        billing_params: List[object] = []

        if start_date and end_date:
            date_filter_billing = "AND DATE(b.ENCODED_DT) >= %s AND DATE(b.ENCODED_DT) <= %s"
            billing_params.extend([start_date, end_date])

        if branch_id:
            branch_filter_billing = "AND br.IDNo = %s"
            billing_params.append(branch_id)

        billing_query = f"""
            SELECT 
                br.IDNo as branch_id,
                br.BRANCH_NAME as branch_name,
                br.BRANCH_CODE as branch_code,
                COALESCE(SUM(b.AMOUNT_PAID), 0) as total_sales,
                COUNT(DISTINCT b.ORDER_ID) as order_count,
                CASE 
                    WHEN COUNT(DISTINCT b.ORDER_ID) > 0 THEN COALESCE(SUM(b.AMOUNT_PAID), 0) / COUNT(DISTINCT b.ORDER_ID)
                    ELSE 0
                END as avg_order_value
            FROM branches br
            LEFT JOIN billing b ON b.BRANCH_ID = br.IDNo AND b.STATUS IN (1, 2) {date_filter_billing}
            WHERE br.ACTIVE = 1 {branch_filter_billing}
            GROUP BY br.IDNo, br.BRANCH_NAME, br.BRANCH_CODE
            ORDER BY total_sales DESC
        """

        cur.execute(billing_query, billing_params)
        billing_rows = cur.fetchall()

        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] branch-sales DB query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch sales per branch",
            "error": getattr(exc, "message", str(exc)),
        }

    result: List[BranchSalesItem] = []
    for row in billing_rows:
        bid = int(row["branch_id"])
        total_sales = float(row.get("total_sales") or 0)
        order_count = int(row.get("order_count") or 0)
        avg_order_value = float(row.get("avg_order_value") or 0)

        result.append(
            BranchSalesItem(
                branch_id=bid,
                branch_name=str(row.get("branch_name") or ""),
                branch_code=str(row.get("branch_code") or ""),
                total_sales=total_sales,
                order_count=order_count,
                avg_order_value=avg_order_value,
            )
        )

    # Sort by total_sales DESC, same as Node
    result.sort(key=lambda x: x.total_sales, reverse=True)

    return {"success": True, "data": {"data": [item.model_dump() for item in result]}}


@app.get("/api/analytics/least-selling")
def least_selling(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
    limit: int = 5,
) -> dict:
    """
    Least-selling menu items.
    Mirrors Node's ReportsModel.getLeastSellingItems:
    - Merges product_sales_summary and actual orders/billing/order_items/menu/categories
    - Applies optional date and branch filters on actual orders
    """
    try:
        effective_limit = max(1, min(int(limit or 5), 50))

        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        # Legacy table product_sales_summary has been removed; rely only on actual orders.
        summary_rows: List[dict] = []

        # Source 2: actual orders (paid orders from billing)
        order_date_filter = ""
        order_branch_filter = ""
        order_params: List[object] = []

        if start_date and end_date:
            order_date_filter = "AND DATE(o.ENCODED_DT) BETWEEN %s AND %s"
            order_params.extend([start_date, end_date])
        if branch_id:
            order_branch_filter = "AND o.BRANCH_ID = %s"
            order_params.append(branch_id)

        orders_query = f"""
            SELECT 
                m.MENU_NAME as name,
                COALESCE(c.CAT_NAME, 'Uncategorized') as category,
                COALESCE(SUM(oi.QTY), 0) as total_quantity,
                COALESCE(SUM(oi.LINE_TOTAL), 0) as total_revenue,
                m.MENU_PRICE
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo
            INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
            INNER JOIN menu m ON m.IDNo = oi.MENU_ID
            LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
            WHERE b.STATUS = 1
            {order_date_filter}
            {order_branch_filter}
            GROUP BY m.IDNo, m.MENU_NAME, m.MENU_PRICE, c.CAT_NAME
            HAVING total_quantity > 0
        """

        cur.execute(orders_query, order_params)
        order_rows = cur.fetchall()

        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] least-selling query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch least selling items",
            "error": getattr(exc, "message", str(exc)),
        }

    # Merge both sources by product name
    data_map = {}

    for row in summary_rows:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        if name not in data_map:
            data_map[name] = {
                "name": name,
                "category": row.get("category") or "Uncategorized",
                "total_quantity": 0,
                "total_revenue": 0.0,
                "price": 0.0,
            }
        data = data_map[name]
        data["total_quantity"] += int(row.get("total_quantity") or 0)
        data["total_revenue"] += float(row.get("total_revenue") or 0.0)

    for row in order_rows:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        if name not in data_map:
            data_map[name] = {
                "name": name,
                "category": row.get("category") or "Uncategorized",
                "total_quantity": 0,
                "total_revenue": 0.0,
                "price": float(row.get("MENU_PRICE") or 0.0),
            }
        data = data_map[name]
        data["total_quantity"] += int(row.get("total_quantity") or 0)
        data["total_revenue"] += float(row.get("total_revenue") or 0.0)
        if row.get("MENU_PRICE") is not None:
            data["price"] = float(row.get("MENU_PRICE") or data["price"])

    # Convert to list, filter, sort by least total revenue (then quantity), then limit
    merged_items: List[LeastSellingItem] = []
    for idx, item in enumerate(
        sorted(
            (
                v
                for v in data_map.values()
                if (v.get("total_quantity") or 0) > 0 and (v.get("total_revenue") or 0.0) > 0.0
            ),
            key=lambda x: (x["total_revenue"], x["total_quantity"]),
        )[:effective_limit],
        start=1,
    ):
        merged_items.append(
            LeastSellingItem(
                IDNo=idx,
                MENU_NAME=item["name"],
                MENU_PRICE=float(item.get("price") or 0.0),
                category=str(item.get("category") or "Uncategorized"),
                total_quantity=int(item.get("total_quantity") or 0),
                order_count=int(item.get("total_quantity") or 0),
                total_revenue=float(item.get("total_revenue") or 0.0),
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in merged_items]}}


@app.get("/api/analytics/top-selling")
def top_selling(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
    limit: int = 5,
) -> dict:
    """
    Top-selling menu items.
    Mirrors least_selling aggregation but sorts by highest quantity instead of lowest.
    """
    try:
        effective_limit = max(1, min(int(limit or 5), 50))

        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        # Legacy table product_sales_summary has been removed; rely only on actual orders.
        summary_rows: List[dict] = []

        # Source 2: actual orders (paid orders from billing)
        order_date_filter = ""
        order_branch_filter = ""
        order_params: List[object] = []

        if start_date and end_date:
            order_date_filter = "AND DATE(o.ENCODED_DT) BETWEEN %s AND %s"
            order_params.extend([start_date, end_date])
        if branch_id:
            order_branch_filter = "AND o.BRANCH_ID = %s"
            order_params.append(branch_id)

        orders_query = f"""
            SELECT 
                m.MENU_NAME as name,
                COALESCE(c.CAT_NAME, 'Uncategorized') as category,
                COALESCE(SUM(oi.QTY), 0) as total_quantity,
                COALESCE(SUM(oi.LINE_TOTAL), 0) as total_revenue,
                m.MENU_PRICE
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo
            INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
            INNER JOIN menu m ON m.IDNo = oi.MENU_ID
            LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
            WHERE b.STATUS = 1
            {order_date_filter}
            {order_branch_filter}
            GROUP BY m.IDNo, m.MENU_NAME, m.MENU_PRICE, c.CAT_NAME
            HAVING total_quantity > 0
        """

        cur.execute(orders_query, order_params)
        order_rows = cur.fetchall()

        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] top-selling query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch top selling items",
            "error": getattr(exc, "message", str(exc)),
        }

    # Merge both sources by product name
    data_map = {}

    for row in summary_rows:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        if name not in data_map:
            data_map[name] = {
                "name": name,
                "category": row.get("category") or "Uncategorized",
                "total_quantity": 0,
                "total_revenue": 0.0,
                "price": 0.0,
            }
        data = data_map[name]
        data["total_quantity"] += int(row.get("total_quantity") or 0)
        data["total_revenue"] += float(row.get("total_revenue") or 0.0)

    for row in order_rows:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        if name not in data_map:
            data_map[name] = {
                "name": name,
                "category": row.get("category") or "Uncategorized",
                "total_quantity": 0,
                "total_revenue": 0.0,
                "price": float(row.get("MENU_PRICE") or 0.0),
            }
        data = data_map[name]
        data["total_quantity"] += int(row.get("total_quantity") or 0)
        data["total_revenue"] += float(row.get("total_revenue") or 0.0)
        if row.get("MENU_PRICE") is not None:
            data["price"] = float(row.get("MENU_PRICE") or data["price"])

    # Convert to list, filter, sort by highest revenue (then quantity), then limit
    merged_items: List[TopSellingItem] = []
    for idx, item in enumerate(
        sorted(
            (
                v
                for v in data_map.values()
                if (v.get("total_quantity") or 0) > 0 and (v.get("total_revenue") or 0.0) > 0.0
            ),
            key=lambda x: (-x["total_revenue"], -x["total_quantity"]),
        )[:effective_limit],
        start=1,
    ):
        merged_items.append(
            TopSellingItem(
                IDNo=idx,
                MENU_NAME=item["name"],
                MENU_PRICE=float(item.get("price") or 0.0),
                category=str(item.get("category") or "Uncategorized"),
                total_quantity=int(item.get("total_quantity") or 0),
                order_count=int(item.get("total_quantity") or 0),
                total_revenue=float(item.get("total_revenue") or 0.0),
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in merged_items]}}


@app.get("/api/analytics/daily-sales")
def daily_sales(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Daily total sales time series aligned with Loyverse data:
    - total_sales: SUM of billing.AMOUNT_PAID for paid orders (same base as before)
    - refund: SUM of billing.REFUND (synced from Loyverse refunds)
    - discount: SUM of orders.DISCOUNT_AMOUNT for paid orders
    - net_sales: total_sales - refund - discount
    - gross_profit: same as net_sales (simplified)
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        # Align grouping/filtering to PH local time (UTC+8) to match Loyverse UI/export.
        # MySQL DATETIME is timezone-naive; conversion must be applied consistently at query time.
        billing_local_dt = """COALESCE(
            CONVERT_TZ(b.ENCODED_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(b.ENCODED_DT, INTERVAL 8 HOUR)
        )"""
        orders_local_dt = """COALESCE(
            CONVERT_TZ(o.ENCODED_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(o.ENCODED_DT, INTERVAL 8 HOUR)
        )"""
        refund_local_dt = """COALESCE(
            CONVERT_TZ(b.REFUND_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(b.REFUND_DT, INTERVAL 8 HOUR)
        )"""

        # 1) Billing-based daily totals
        billing_date_filter = ""
        billing_branch_filter = ""
        billing_params: List[object] = []

        if start_date and end_date:
            billing_date_filter = f"AND DATE({billing_local_dt}) BETWEEN %s AND %s"
            billing_params.extend([start_date, end_date])
        if branch_id:
            billing_branch_filter = "AND b.BRANCH_ID = %s"
            billing_params.append(branch_id)

        billing_query = f"""
            SELECT 
                DATE_FORMAT({billing_local_dt}, '%Y-%m-%d') AS sale_date,
                COALESCE(SUM(b.AMOUNT_PAID), 0) AS total_sales
            FROM billing b
            WHERE b.STATUS IN (1, 2)
            {billing_date_filter}
            {billing_branch_filter}
            GROUP BY DATE({billing_local_dt})
        """

        cur.execute(billing_query, billing_params)
        billing_rows = cur.fetchall()

        # 2) Discount per day from orders (only paid orders)
        discount_date_filter = ""
        discount_branch_filter = ""
        discount_params: List[object] = []

        if start_date and end_date:
            discount_date_filter = f"AND DATE({orders_local_dt}) BETWEEN %s AND %s"
            discount_params.extend([start_date, end_date])
        if branch_id:
            discount_branch_filter = "AND o.BRANCH_ID = %s"
            discount_params.append(branch_id)

        discount_query = f"""
            SELECT 
                DATE_FORMAT({orders_local_dt}, '%Y-%m-%d') AS sale_date,
                COALESCE(SUM(o.DISCOUNT_AMOUNT), 0) AS discount
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            WHERE 1=1
            {discount_date_filter}
            {discount_branch_filter}
            GROUP BY DATE({orders_local_dt})
        """

        cur.execute(discount_query, discount_params)
        discount_rows = cur.fetchall()

        # 3) Refund per day from billing table (values synced from Loyverse refunds)
        refund_date_filter = ""
        refund_branch_filter = ""
        refund_params: List[object] = []

        if start_date and end_date:
            refund_date_filter = f"AND DATE({refund_local_dt}) BETWEEN %s AND %s"
            refund_params.extend([start_date, end_date])
        if branch_id:
            # Use order's branch to filter refunds
            refund_branch_filter = "AND o.BRANCH_ID = %s"
            refund_params.append(branch_id)

        refund_query = f"""
            SELECT
                DATE_FORMAT({refund_local_dt}, '%Y-%m-%d') AS sale_date,
                COALESCE(SUM(b.REFUND), 0) AS refund
            FROM billing b
            INNER JOIN orders o ON o.IDNo = b.ORDER_ID
            WHERE b.REFUND IS NOT NULL AND b.REFUND > 0
            {refund_date_filter}
            {refund_branch_filter}
            GROUP BY DATE({refund_local_dt})
        """

        cur.execute(refund_query, refund_params)
        refund_rows = cur.fetchall()

        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] daily-sales query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch daily sales",
            "error": getattr(exc, "message", str(exc)),
        }

    # Index discount and refund by sale_date
    discount_map = {}
    for row in discount_rows:
        sale_date = row.get("sale_date")
        if sale_date is None:
            continue
        discount_map[str(sale_date)] = float(row.get("discount") or 0.0)

    refund_map = {}
    for row in refund_rows:
        sale_date = row.get("sale_date")
        if sale_date is None:
            continue
        refund_map[str(sale_date)] = float(row.get("refund") or 0.0)

    # Merge into final daily series
    items: List[DailySalesItem] = []
    billing_map = {}
    for row in billing_rows:
        sale_date = row.get("sale_date")
        if sale_date is None:
            continue
        billing_map[str(sale_date)] = float(row.get("total_sales") or 0.0)

    all_dates = set(billing_map.keys()) | set(discount_map.keys()) | set(refund_map.keys())
    for key in sorted(all_dates):
        discount = float(discount_map.get(key, 0.0) or 0.0)
        refund = float(refund_map.get(key, 0.0) or 0.0)
        paid_total = float(billing_map.get(key, 0.0) or 0.0)

        # Loyverse daily export uses:
        # total_sales (gross) = paid_total + discount
        # net_sales = total_sales - discount - refund
        total_sales = paid_total + discount
        net_sales = total_sales - discount - refund
        gross_profit = net_sales

        items.append(
            DailySalesItem(
                sale_date=key,
                total_sales=total_sales,
                refund=refund,
                discount=discount,
                net_sales=net_sales,
                gross_profit=gross_profit,
            )
        )

    # Sort by date
    items.sort(key=lambda x: x.sale_date)

    return {"success": True, "data": {"data": [item.model_dump() for item in items]}}


@app.get("/api/analytics/expense-summary")
def expense_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Total expenses over a period, optionally filtered by branch.

    Mirrors Node's ExpenseModel.getSummary (total_expense) semantics:
    - Reads from expenses + master_categories
    - Respects ACTIVE flag
    - Optional branch/date filters
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        where = ["e.ACTIVE = 1"]
        params: List[object] = []

        if branch_id:
            where.append("e.BRANCH_ID = %s")
            params.append(branch_id)

        if start_date:
            where.append("DATE(e.ENCODED_DT) >= %s")
            params.append(start_date)
        if end_date:
            where.append("DATE(e.ENCODED_DT) <= %s")
            params.append(end_date)

        where_sql = " AND ".join(where)

        query = f"""
            SELECT
                COALESCE(SUM(e.EXP_AMOUNT), 0) AS total_expense
            FROM expenses e
            LEFT JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
            WHERE {where_sql}
        """

        cur.execute(query, params)
        row = cur.fetchone() or {}
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] expense-summary query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch expense summary",
            "error": getattr(exc, "message", str(exc)),
        }

    summary = ExpenseSummary(total_expense=float(row.get("total_expense") or 0.0))
    return {"success": True, "data": summary.model_dump()}


@app.get("/api/analytics/expense-breakdown")
def expense_breakdown(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Expense breakdown grouped by branch + (CATEGORY_TYPE, CATEGORY_NAME).

    This is designed to power the Admin Dashboard comparison side panel.
    It mirrors Node's ExpenseModel.getCategoryBreakdown but also returns branch_id.
    """
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        where = ["e.ACTIVE = 1"]
        params: List[object] = []

        if branch_id:
            where.append("e.BRANCH_ID = %s")
            params.append(branch_id)

        if start_date:
            where.append("DATE(e.ENCODED_DT) >= %s")
            params.append(start_date)
        if end_date:
            where.append("DATE(e.ENCODED_DT) <= %s")
            params.append(end_date)

        where_sql = " AND ".join(where)

        query = f"""
            SELECT
                e.BRANCH_ID AS branch_id,
                mc.CATEGORY_TYPE AS exp_cat,
                mc.CATEGORY_NAME AS exp_name,
                COUNT(*) AS entry_count,
                COALESCE(SUM(e.EXP_AMOUNT), 0) AS total_amount
            FROM expenses e
            LEFT JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
            WHERE {where_sql}
            GROUP BY e.BRANCH_ID, mc.CATEGORY_TYPE, mc.CATEGORY_NAME
            ORDER BY total_amount DESC, mc.CATEGORY_TYPE ASC, mc.CATEGORY_NAME ASC
        """

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        print("[PyServer] expense-breakdown query failed:", getattr(exc, "message", str(exc)))
        return {
            "success": False,
            "message": "Failed to fetch expense breakdown",
            "error": getattr(exc, "message", str(exc)),
        }

    data: List[ExpenseCategoryRow] = []
    for row in rows:
        try:
            bid_raw = row.get("branch_id")
            if bid_raw is None:
                continue
            bid = int(bid_raw)
        except Exception:
            continue
        data.append(
            ExpenseCategoryRow(
                branch_id=bid,
                exp_cat=str(row.get("exp_cat") or ""),
                exp_name=str(row.get("exp_name") or ""),
                entry_count=int(row.get("entry_count") or 0),
                total_amount=float(row.get("total_amount") or 0.0),
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in data]}}


# Attach analytics report routes (menu, category, payment, receipt)
import reports  # noqa: E402

app.include_router(reports.router)
