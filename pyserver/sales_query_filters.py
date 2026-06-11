"""Shared SQL filters for sales report queries.

Exclude cancelled (STATUS = -1) and deleted (STATUS = -2) orders and billing
from sales computations.
"""

SALES_EXCLUDED_STATUSES = "(-1, -2)"


def order_status_ok(alias: str = "o") -> str:
    return f"{alias}.STATUS NOT IN {SALES_EXCLUDED_STATUSES}"


def billing_status_ok(alias: str = "b") -> str:
    return f"{alias}.STATUS NOT IN {SALES_EXCLUDED_STATUSES}"


def billing_join_on(order_alias: str = "o", billing_alias: str = "b", *, include_paid: bool = True) -> str:
    paid = f" AND {billing_alias}.STATUS IN (1, 2)" if include_paid else ""
    return (
        f"{billing_alias}.ORDER_ID = {order_alias}.IDNo"
        f"{paid} AND {billing_status_ok(billing_alias)} AND {order_status_ok(order_alias)}"
    )


def orders_join_on_billing(billing_alias: str = "b", order_alias: str = "o") -> str:
    return f"{order_alias}.IDNo = {billing_alias}.ORDER_ID AND {order_status_ok(order_alias)}"


def billing_where_clauses(*, include_paid: bool = True, billing_alias: str = "b") -> str:
    parts: list[str] = []
    if include_paid:
        parts.append(f"{billing_alias}.STATUS IN (1, 2)")
    parts.append(billing_status_ok(billing_alias))
    return " AND ".join(parts)
