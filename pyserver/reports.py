from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from main import get_connection


router = APIRouter(prefix="/api/analytics", tags=["analytics-reports"])


class MenuReportRow(BaseModel):
    id: int
    goods: str
    category: str
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
    salesQty: int
    totalSales: float
    refundQty: int
    refundAmount: float
    discounts: float
    netSales: float
    unitCost: float
    totalRevenue: float


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

        query = f"""
            SELECT
                m.IDNo AS id,
                m.MENU_NAME AS goods,
                COALESCE(c.CAT_NAME, 'Uncategorized') AS category,
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
            WHERE 1=1
            {date_filter}
            {branch_filter}
            GROUP BY m.IDNo, m.MENU_NAME, c.CAT_NAME
            HAVING salesQty > 0
            ORDER BY totalSales DESC
        """

        cur.execute(query, params)
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

        query = f"""
            SELECT
                COALESCE(c.IDNo, 0) AS id,
                COALESCE(c.CAT_NAME, 'Uncategorized') AS category,
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
            WHERE 1=1
            {date_filter}
            {branch_filter}
            GROUP BY c.IDNo, c.CAT_NAME
            HAVING salesQty > 0
            ORDER BY totalSales DESC
        """

        cur.execute(query, params)
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
                COALESCE(b.AMOUNT_PAID, 0) AS total
            FROM orders o
            INNER JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            WHERE 1=1
            {date_filter}
            {branch_filter}
            {type_filter}
            ORDER BY o.ENCODED_DT DESC
            LIMIT 500
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
            )
        )

    return {"success": True, "data": {"data": [item.model_dump() for item in items]}}

