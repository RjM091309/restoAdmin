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
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", ""),
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


@app.get("/api/analytics/branch-sales")
def branch_sales(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
) -> dict:
    """
    Total sales per branch.

    For now:
    - Branch list is read from the real `branches` table.
    - Numeric metrics use deterministic mock values (can be replaced with real aggregation later).
    """
    # Mock numeric figures we can reuse per branch
    mock_figures = [
        {"total_sales": 4_632_233.96, "order_count": 1_257, "avg_order_value": 3_685.15},
        {"total_sales": 3_218_745.50, "order_count": 983, "avg_order_value": 3_274.41},
        {"total_sales": 2_876_120.80, "order_count": 842, "avg_order_value": 3_415.82},
        {"total_sales": 1_945_680.25, "order_count": 615, "avg_order_value": 3_163.71},
        {"total_sales": 1_523_490.00, "order_count": 478, "avg_order_value": 3_186.17},
    ]

    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        sql = "SELECT IDNo AS branch_id, BRANCH_NAME AS branch_name, BRANCH_CODE AS branch_code FROM branches"
        params: List[object] = []
        if branch_id is not None:
            sql += " WHERE IDNo = %s"
            params.append(branch_id)
        sql += " ORDER BY IDNo ASC"
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        # Fallback to static mock data if DB query fails
        print("[PyServer] branch-sales DB query failed:", getattr(exc, "message", str(exc)))
        rows = [
            {"branch_id": 1, "branch_name": "Daraejung", "branch_code": "DRJ"},
            {"branch_id": 2, "branch_name": "Kim's Brothers", "branch_code": "KBR"},
            {"branch_id": 3, "branch_name": "Main Branch", "branch_code": "MBR"},
        ]

    items: List[BranchSalesItem] = []
    for idx, row in enumerate(rows):
        mock = mock_figures[idx % len(mock_figures)]
        items.append(
            BranchSalesItem(
                branch_id=int(row["branch_id"]),
                branch_name=str(row["branch_name"]),
                branch_code=str(row.get("branch_code") or ""),
                total_sales=float(mock["total_sales"]),
                order_count=int(mock["order_count"]),
                avg_order_value=float(mock["avg_order_value"]),
            )
        )

    return {"success": True, "data": {"data": items}}


@app.get("/api/analytics/least-selling")
def least_selling(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[int] = None,
    limit: int = 5,
) -> dict:
    """
    Mock least-selling menu items.
    For now this does not hit the DB yet, but shape is ready.
    """
    base_items: List[LeastSellingItem] = [
        LeastSellingItem(
            IDNo=1,
            MENU_NAME="Seafood Pancake",
            MENU_PRICE=330.0,
            category="Appetizer",
            total_quantity=12,
            order_count=12,
            total_revenue=3_960.0,
        ),
        LeastSellingItem(
            IDNo=2,
            MENU_NAME="Japchae",
            MENU_PRICE=280.0,
            category="Side Dish",
            total_quantity=18,
            order_count=18,
            total_revenue=5_040.0,
        ),
        LeastSellingItem(
            IDNo=3,
            MENU_NAME="Tteokbokki",
            MENU_PRICE=250.0,
            category="Snack",
            total_quantity=23,
            order_count=23,
            total_revenue=5_750.0,
        ),
        LeastSellingItem(
            IDNo=4,
            MENU_NAME="Miso Soup",
            MENU_PRICE=180.0,
            category="Soup",
            total_quantity=27,
            order_count=27,
            total_revenue=4_860.0,
        ),
        LeastSellingItem(
            IDNo=5,
            MENU_NAME="Vegetable Tempura",
            MENU_PRICE=310.0,
            category="Japanese",
            total_quantity=31,
            order_count=31,
            total_revenue=9_610.0,
        ),
    ]

    # For now we ignore date/branch filters and just respect limit
    limited = base_items[: max(1, min(limit, len(base_items)))]
    return {"success": True, "data": {"data": limited}}

