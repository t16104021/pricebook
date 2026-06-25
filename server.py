#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("PRICEBOOK_DB_PATH", ROOT / "pricebook.sqlite3"))
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "4173"))
APP_PASSWORD = os.environ.get("PRICEBOOK_PASSWORD") or secrets.token_urlsafe(12)
SESSION_SECRET = os.environ.get("PRICEBOOK_SESSION_SECRET") or secrets.token_urlsafe(32)
SESSION_COOKIE = "pricebook_session"
SESSION_MAX_AGE = 60 * 60 * 12
PUBLIC_PATHS = {"/login", "/styles.css", "/favicon.ico"}

SEED_DATA = {
    "products": [
        {
            "id": "p-1001",
            "sku": "P-1001",
            "name": "高效能濾芯",
            "category": "耗材",
            "basePrices": [
                {"price": 1280, "date": "2026-01-01", "note": "年度牌價"},
                {"price": 1360, "date": "2026-06-01", "note": "原料成本調整"},
            ],
            "sales": [
                {
                    "customer": "長青商行",
                    "prices": [
                        {"price": 1180, "date": "2026-01-15", "note": "季度採購價"},
                        {"price": 1230, "date": "2026-06-10", "note": "續約調整"},
                    ],
                },
                {
                    "customer": "北辰科技",
                    "prices": [{"price": 1260, "date": "2026-05-05", "note": "專案價"}],
                },
            ],
        },
        {
            "id": "p-1002",
            "sku": "P-1002",
            "name": "精密控制閥",
            "category": "零件",
            "basePrices": [
                {"price": 4200, "date": "2026-02-01", "note": "新品定價"},
                {"price": 4550, "date": "2026-06-18", "note": "供應商價格更新"},
            ],
            "sales": [
                {
                    "customer": "晴川工業",
                    "prices": [{"price": 4380, "date": "2026-06-20", "note": "年度框架合約"}],
                }
            ],
        },
        {
            "id": "p-1003",
            "sku": "P-1003",
            "name": "商用感測模組",
            "category": "電子",
            "basePrices": [{"price": 2680, "date": "2026-03-01", "note": "標準定價"}],
            "sales": [
                {
                    "customer": "北辰科技",
                    "prices": [
                        {"price": 2490, "date": "2026-03-12", "note": "批量折扣"},
                        {"price": 2550, "date": "2026-06-22", "note": "交期加急"},
                    ],
                }
            ],
        },
    ]
}


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DB_PATH)


def sign_session(timestamp, nonce):
    message = f"{timestamp}:{nonce}".encode("utf-8")
    return hmac.new(SESSION_SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()


def parse_cookies(header):
    cookies = {}
    for part in (header or "").split(";"):
        if "=" not in part:
            continue
        name, value = part.strip().split("=", 1)
        cookies[name] = value
    return cookies


def is_valid_session(cookie_header):
    token = parse_cookies(cookie_header).get(SESSION_COOKIE, "")
    pieces = token.split(":")
    if len(pieces) != 3:
        return False

    timestamp, nonce, signature = pieces
    if not timestamp.isdigit():
        return False

    age = int(__import__("time").time()) - int(timestamp)
    if age < 0 or age > SESSION_MAX_AGE:
        return False

    expected = sign_session(timestamp, nonce)
    return hmac.compare_digest(signature, expected)


def make_session_cookie(is_secure):
    timestamp = str(int(__import__("time").time()))
    nonce = secrets.token_urlsafe(18)
    signature = sign_session(timestamp, nonce)
    secure = "; Secure" if is_secure else ""
    return (
        f"{SESSION_COOKIE}={timestamp}:{nonce}:{signature}; "
        f"Max-Age={SESSION_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax{secure}"
    )


def init_db():
    with connect() as db:
        db.execute("PRAGMA foreign_keys = ON")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                sku TEXT NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS base_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT NOT NULL,
                price REAL NOT NULL,
                effective_date TEXT NOT NULL,
                note TEXT,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS customer_sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT NOT NULL,
                customer TEXT NOT NULL,
                price REAL NOT NULL,
                effective_date TEXT NOT NULL,
                note TEXT,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            );
            """
        )
        count = db.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if count == 0:
            replace_data(db, SEED_DATA)


def get_data():
    with connect() as db:
        db.row_factory = sqlite3.Row
        products = []
        for product in db.execute("SELECT * FROM products ORDER BY sku"):
            product_id = product["id"]
            base_prices = [
                {"price": row["price"], "date": row["effective_date"], "note": row["note"] or ""}
                for row in db.execute(
                    """
                    SELECT price, effective_date, note
                    FROM base_prices
                    WHERE product_id = ?
                    ORDER BY effective_date
                    """,
                    (product_id,),
                )
            ]

            sales_by_customer = {}
            for row in db.execute(
                """
                SELECT customer, price, effective_date, note
                FROM customer_sales
                WHERE product_id = ?
                ORDER BY customer, effective_date
                """,
                (product_id,),
            ):
                sales_by_customer.setdefault(row["customer"], []).append(
                    {"price": row["price"], "date": row["effective_date"], "note": row["note"] or ""}
                )

            products.append(
                {
                    "id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "category": product["category"],
                    "basePrices": base_prices,
                    "sales": [
                        {"customer": customer, "prices": prices}
                        for customer, prices in sales_by_customer.items()
                    ],
                }
            )
        return {"products": products}


def replace_data(db, data):
    products = data.get("products", [])
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("DELETE FROM customer_sales")
    db.execute("DELETE FROM base_prices")
    db.execute("DELETE FROM products")

    for product in products:
        db.execute(
            "INSERT INTO products (id, sku, name, category) VALUES (?, ?, ?, ?)",
            (product["id"], product["sku"], product["name"], product["category"]),
        )
        for entry in product.get("basePrices", []):
            db.execute(
                """
                INSERT INTO base_prices (product_id, price, effective_date, note)
                VALUES (?, ?, ?, ?)
                """,
                (product["id"], entry["price"], entry["date"], entry.get("note", "")),
            )
        for sale in product.get("sales", []):
            for entry in sale.get("prices", []):
                db.execute(
                    """
                    INSERT INTO customer_sales (product_id, customer, price, effective_date, note)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (product["id"], sale["customer"], entry["price"], entry["date"], entry.get("note", "")),
                )


class PricebookHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, status, html):
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location, extra_headers=None):
        self.send_response(303)
        self.send_header("Location", location)
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()

    def is_secure_request(self):
        return self.headers.get("X-Forwarded-Proto", "").lower() == "https"

    def is_authenticated(self):
        return is_valid_session(self.headers.get("Cookie", ""))

    def require_auth(self):
        path = urlparse(self.path).path
        if path in PUBLIC_PATHS or self.is_authenticated():
            return True

        if path.startswith("/api/"):
            self.send_json(401, {"error": "Authentication required"})
        else:
            self.redirect("/login")
        return False

    def render_login(self, error=""):
        error_markup = f'<p class="login-error">{error}</p>' if error else ""
        return f"""<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>登入產品售價管理</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="login-page">
    <main class="login-shell">
      <form class="login-card" method="post" action="/login">
        <h1>產品售價管理</h1>
        <p>請輸入密碼後繼續。</p>
        {error_markup}
        <label>
          密碼
          <input name="password" type="password" autocomplete="current-password" required autofocus />
        </label>
        <button class="primary-button" type="submit">登入</button>
      </form>
    </main>
  </body>
</html>"""

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/login":
            if self.is_authenticated():
                self.redirect("/")
                return
            self.send_html(200, self.render_login())
            return

        if not self.require_auth():
            return

        if urlparse(self.path).path == "/api/data":
            self.send_json(200, get_data())
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/login":
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            password = parse_qs(body).get("password", [""])[0]

            if hmac.compare_digest(password, APP_PASSWORD):
                self.redirect("/", {"Set-Cookie": make_session_cookie(self.is_secure_request())})
                return

            self.send_html(401, self.render_login("密碼不正確，請再試一次。"))
            return

        if path == "/logout":
            self.redirect("/login", {"Set-Cookie": f"{SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"})
            return

        self.send_json(404, {"error": "Not found"})

    def do_PUT(self):
        if not self.require_auth():
            return

        if urlparse(self.path).path != "/api/data":
            self.send_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload.get("products"), list):
                raise ValueError("products must be a list")
            with connect() as db:
                replace_data(db, payload)
            self.send_json(200, {"ok": True})
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), PricebookHandler)
    print(f"產品售價管理已啟動：http://localhost:{PORT}")
    print(f"同 Wi-Fi 手機可用：http://<這台電腦的IP>:{PORT}")
    print(f"資料庫位置：{DB_PATH}")
    if "PRICEBOOK_PASSWORD" not in os.environ:
        print(f"本次臨時登入密碼：{APP_PASSWORD}")
        print("正式部署請設定 PRICEBOOK_PASSWORD 環境變數。")
    server.serve_forever()
