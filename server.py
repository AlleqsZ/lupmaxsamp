# -*- coding: utf-8 -*-
"""
LUPMAX RPG — COMPLETE USER CONTROL PANEL (UCP) BACKEND & SECURITY ENGINE
100% Synced with gamemodes/LupMax.pwn & LUPMAX_MASTER_DATABASE.sql
Features:
- Cryptographic Session Binding (HMAC-SHA256 IP + UA + Device Fingerprint) Anti-Hijack
- Dual-Token CSRF + Constant-Time Verification + Strict Origin/Host & CSP
- Built-in WAF (Anti-SQLi, Anti-XSS, Path Traversal, Null-Byte & Flood Protection)
- Complete API for all 62+ Gamemode Tables & Live In-Game Execution via panelactions & emails
"""
from pathlib import Path
import sys
import os
import re
import json
import time
import hmac
import struct
import socket
import secrets
import hashlib
import decimal
import datetime
import threading
import subprocess
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT / "vendor"))
sys.path.insert(0, str(ROOT))

import pymysql
import pymysql.cursors
import bcrypt

from gamemode_constants import (
    VEHICLE_NAMES,
    SERVER_JOBS_LIST,
    JOBS_BY_ID,
    JOB_SKILLS_META,
    FACTION_META,
    BUSINESS_TYPES,
    VIP_PACKAGES,
    VIP_BENEFITS,
    SHOP_ITEMS,
    PANEL_ACTIONS_MAP,
    LEADER_SKINS_AND_TEAMS,
    PUNISHLOG_LABELS,
    COMPLAINT_CATEGORIES,
    TICKET_CATEGORIES,
    MANAGER_ROLES,
    FIGHT_STYLES,
    LUPMAX_WHEEL_PRIZES,
    PROFILE_BANNER_PRESETS,
    PROFILE_SHOWCASE_BADGES,
    format_quest1,
    format_quest2,
    read_daily_job,
    compute_vip_status,
    decode_special_quest,
)

# ==============================================================================
# SECURITY & SESSION STATE
# ==============================================================================
SERVER_BOOT_SECRET = secrets.token_bytes(32)
COOKIE_NAME = "lupmax_ucp_sid"
SESSION_TTL = 8 * 3600  # 8 hours

LOCK = threading.RLock()
MUTATION_LOCK = threading.RLock()

SESSIONS = {}        # sid -> {uid, uname, csrf, bind_hash, ip, ua, created, expires, last_seen, fp}
LOGIN_ATTEMPTS = {}  # ip -> [timestamps]
RATE_LIMITS = {}     # ip -> [timestamps]
SECURITY_EVENTS = [] # Recent blocked attacks in memory

STATIC_FILES = {
    "/": ("ucp.html", "text/html; charset=utf-8"),
    "/index.html": ("ucp.html", "text/html; charset=utf-8"),
    "/ucp.html": ("ucp.html", "text/html; charset=utf-8"),
    "/ucp.css": ("ucp.css", "text/css; charset=utf-8"),
    "/ucp.js": ("ucp.js", "application/javascript; charset=utf-8"),
    "/christmas.js": ("christmas.js", "application/javascript; charset=utf-8"),
}

WAF_PATTERNS = re.compile(
    r"(?:union\s+all\s+select|union\s+select|information_schema|benchmark\s*\(|sleep\s*\(|"
    r"load_file\s*\(|into\s+outfile|into\s+dumpfile|<script\b|javascript:|onerror\s*=|onload\s*=|"
    r"\.\./|\.\.\\|%2e%2e|%00|\x00)",
    re.IGNORECASE,
)


class APIError(Exception):
    def __init__(self, status: int, message: str, code: str = "ERROR"):
        self.status = status
        self.message = message
        self.code = code


def legacy_text(value: str) -> str:
    """Transliterates Romanian diacritics to clean ASCII/latin1 compatible with SA-MP & latin1 tables."""
    if not isinstance(value, str):
        return ""
    value = value.translate(str.maketrans("ăâîșşțţĂÂÎȘŞȚŢ", "aaissttAAISSTT"))
    cleaned = []
    for ch in value:
        code = ord(ch)
        if ch in ("\r", "\n", "\t") or (32 <= code <= 126) or (160 <= code <= 255):
            cleaned.append(ch)
    return "".join(cleaned)


def clean_samp_colors(text: str) -> str:
    """Strips SA-MP inline hex color tags like {00FF00} for clean display while keeping text intact."""
    if not isinstance(text, str):
        return ""
    return re.sub(r"\{[0-9A-Fa-f]{6}\}", "", text)


def json_default(value):
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat(sep=" ") if isinstance(value, datetime.datetime) else value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    raise TypeError(f"Unsupported type: {type(value)}")


# ==============================================================================
# DATABASE CONFIGURATION & AUTO-START XAMPP MYSQL
# ==============================================================================
_ACTIVE_DB_CONFIG = None
_SCHEMA_VERIFIED = False


def is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def ensure_mysql_service_running(cfg: dict):
    host = cfg.get("host", "127.0.0.1")
    port = int(cfg.get("port", 3306))
    if is_port_open(host, port, 0.8):
        return True
    if host not in ("127.0.0.1", "localhost"):
        return False
    mysqld = Path(cfg.get("xampp_mysqld_path", "C:/xampp/mysql/bin/mysqld.exe"))
    my_ini = Path(cfg.get("xampp_my_ini_path", "C:/xampp/mysql/bin/my.ini"))
    if not mysqld.exists():
        return False
    try:
        print("[UCP] Pornire automata serviciu MySQL local (XAMPP)...", flush=True)
        flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        args = [str(mysqld)]
        if my_ini.exists():
            args.append(f"--defaults-file={my_ini}")
        subprocess.Popen(
            args,
            cwd=str(mysqld.parent),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags if os.name == "nt" else 0,
        )
        for _ in range(24):
            time.sleep(0.5)
            if is_port_open(host, port, 0.8):
                time.sleep(0.5)
                print("[UCP] Serviciul MySQL local a pornit cu succes.", flush=True)
                return True
    except Exception as exc:
        print("[UCP] Eroare la pornirea automata MySQL:", exc, flush=True)
    return is_port_open(host, port, 1.0)


def load_db_config() -> dict:
    global _ACTIVE_DB_CONFIG
    if _ACTIVE_DB_CONFIG is not None:
        return _ACTIVE_DB_CONFIG

    cfg_path = ROOT / "ucp_config.json"
    raw = {}
    if cfg_path.exists():
        try:
            raw = json.loads(cfg_path.read_text(encoding="utf-8-sig"))
        except Exception:
            raw = {}

    host = raw.get("host", "127.0.0.1")
    port = int(raw.get("port", 3306))
    user = raw.get("user", "root")
    password = raw.get("password", "")
    database = raw.get("database", "test")
    fallbacks = raw.get("fallback_databases", ["lupmaxbetaa", "lupmax_schema_final_20261008", "test"])

    if raw.get("credential_source") == "phpmyadmin":
        pma = Path(raw.get("credential_file", "C:/xampp/phpMyAdmin/config.inc.php"))
        if pma.exists():
            src = pma.read_text(encoding="utf-8", errors="ignore")
            m_host = re.search(r"\$cfg\['Servers'\]\[\$i\]\['host'\]\s*=\s*'([^']*)'", src)
            m_user = re.search(r"\$cfg\['Servers'\]\[\$i\]\['user'\]\s*=\s*'([^']*)'", src)
            m_pass = re.search(r"\$cfg\['Servers'\]\[\$i\]\['password'\]\s*=\s*'([^']*)'", src)
            if m_host and m_host.group(1):
                host = m_host.group(1)
            if m_user and m_user.group(1):
                user = m_user.group(1)
            if m_pass:
                password = m_pass.group(1)
    else:
        local_cfg = PROJECT_ROOT / "scriptfiles" / "mysql_local.cfg"
        if local_cfg.exists():
            lines = local_cfg.read_text(encoding="utf-8-sig", errors="ignore").splitlines()
            if len(lines) >= 4:
                host = lines[0].strip() or host
                user = lines[1].strip() or user
                database = lines[2].strip() or database
                password = lines[3].strip()

    base = {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "database": database,
        "fallbacks": fallbacks,
        "ucp_port": int(raw.get("ucp_port", 8770)),
        "xampp_mysqld_path": raw.get("xampp_mysqld_path", "C:/xampp/mysql/bin/mysqld.exe"),
        "xampp_my_ini_path": raw.get("xampp_my_ini_path", "C:/xampp/mysql/bin/my.ini"),
    }
    ensure_mysql_service_running(base)

    # Probe candidate databases to pick the one that has `users` table
    candidates = [database] + [d for d in fallbacks if d != database]
    for cand in candidates:
        try:
            conn = pymysql.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                database=cand,
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=4,
            )
            with conn.cursor() as cur:
                cur.execute("SHOW TABLES LIKE 'users'")
                if cur.fetchone():
                    base["database"] = cand
                    conn.close()
                    _ACTIVE_DB_CONFIG = base
                    return base
            conn.close()
        except Exception:
            continue

    _ACTIVE_DB_CONFIG = base
    return base


def connect():
    global _SCHEMA_VERIFIED
    c = load_db_config()
    ensure_mysql_service_running(c)
    db = pymysql.connect(
        host=c["host"],
        port=int(c.get("port", 3306)),
        user=c["user"],
        password=c.get("password", ""),
        database=c["database"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
        read_timeout=10,
        write_timeout=10,
        autocommit=False,
    )
    if not _SCHEMA_VERIFIED:
        _SCHEMA_VERIFIED = True
        try:
            ensure_schema_compatibility(db)
        except Exception as exc:
            print("[UCP] Schema check note:", exc, flush=True)
    return db


def ensure_schema_compatibility(db):
    """Non-destructively ensures extra columns/tables exist so every gamemode feature works seamlessly."""
    stmts = [
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `Legend` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `PCID` VARCHAR(64) NOT NULL DEFAULT ''",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `VIPDays` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `PremiumDays` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `CarSlots` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `MissionPoints` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `ManagerLideriSupport` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `ReportMuted` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `HelpedPlayersToday` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `iplogs` ADD COLUMN IF NOT EXISTS `pcid` VARCHAR(64) NOT NULL DEFAULT ''",
        """CREATE TABLE IF NOT EXISTS `christmas_progress` (
            `player_id` INT NOT NULL,
            `season` INT NOT NULL,
            `days` INT UNSIGNED NOT NULL DEFAULT 0,
            `grand_claimed` INT NOT NULL DEFAULT 0,
            `task_date` INT NOT NULL DEFAULT 0,
            `tasks` INT NOT NULL DEFAULT 0,
            `secret_date` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`player_id`, `season`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1""",
        """CREATE TABLE IF NOT EXISTS `secret_santa_gifts` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `sender_sqlid` INT NOT NULL DEFAULT 0,
            `sender_name` VARCHAR(32) NOT NULL DEFAULT '',
            `gift_type` INT NOT NULL DEFAULT 1,
            `gift_amount` INT NOT NULL DEFAULT 0,
            `claimed` INT NOT NULL DEFAULT 0,
            `claimed_by_sqlid` INT NOT NULL DEFAULT 0,
            `claimed_by_name` VARCHAR(32) NOT NULL DEFAULT '',
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1""",
        """UPDATE `factions`
           SET `Name` = 'Government',
               `X` = 1262.14,
               `Y` = -785.331,
               `Z` = 1091.91,
               `Mats` = 25000,
               `Drugs` = 0,
               `Bank` = 1500000,
               `Anunt` = 'Sedinta duminica la ora 20:00 la Primaria Los Santos. Raport obligatoriu (/givetax)!',
               `MaxMembers` = 15,
               `MinLevel` = 7,
               `Application` = 1,
               `PaydayMoney` = 3000,
               `q1` = 'Nume real si varsta?:',
               `q2` = 'Cu ce se ocupa factiunea Government pe server?:',
               `q3` = 'Descrie-te in minim 20 de cuvinte:',
               `q4` = 'De ce doresti sa te alaturi Primariei San Andreas?:',
               `q5` = 'Cate ore petreci zilnic pe server (fara AFK)?:',
               `q6` = 'Care este nivelul maxim pentru care se acorda ajutor social (/givetax)?:',
               `q7` = 'Vei respecta Primarul (Mayor), Viceprimarul si colegii din Guvern?:',
               `q8` = 'Esti de acord sa ramai minim 14 zile in factiune pentru a nu fi demis cu FP?:',
               `q9` = 'Ai mai facut parte dintr-o factiune pasnica? Daca da, care?:',
               `q10` = 'Alte precizari?:',
               `Rank1` = 'Bodyguard',
               `Rank2` = 'Secret Service',
               `Rank3` = 'City Councilor',
               `Rank4` = 'State Inspector',
               `Rank5` = 'Prime Minister',
               `Rank6` = 'Deputy Mayor',
               `Rank7` = 'Mayor'
         WHERE `ID` = 7 AND (`Name` LIKE '%In Lucru%' OR `Name` = '' OR `Rank1` = 'Rank1')""",
        """CREATE TABLE IF NOT EXISTS `ucp_car_market` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `car_id` INT NOT NULL,
            `seller_sqlid` INT NOT NULL DEFAULT 0,
            `seller_name` VARCHAR(32) NOT NULL DEFAULT '',
            `model` INT NOT NULL DEFAULT 411,
            `buyout_price` INT NOT NULL DEFAULT 1000000,
            `min_bid` INT NOT NULL DEFAULT 500000,
            `current_bid` INT NOT NULL DEFAULT 0,
            `high_bidder_sqlid` INT NOT NULL DEFAULT 0,
            `high_bidder_name` VARCHAR(32) NOT NULL DEFAULT '',
            `seller_note` VARCHAR(120) NOT NULL DEFAULT '',
            `status` INT NOT NULL DEFAULT 0,
            `buyer_name` VARCHAR(32) NOT NULL DEFAULT '',
            `created_at` INT NOT NULL DEFAULT 0,
            `expires_at` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            KEY `idx_status` (`status`),
            KEY `idx_car` (`car_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        "ALTER TABLE `ucp_car_market` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci",
        """CREATE TABLE IF NOT EXISTS `ucp_update_ratings` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `update_id` INT NOT NULL,
            `user_id` INT NOT NULL,
            `user_name` VARCHAR(32) NOT NULL DEFAULT '',
            `rating` TINYINT NOT NULL DEFAULT 5,
            `updated_at` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_update_user` (`update_id`, `user_id`),
            KEY `idx_update` (`update_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS `ucp_update_meta` (
            `update_id` INT NOT NULL,
            `rating_enabled` TINYINT NOT NULL DEFAULT 1,
            PRIMARY KEY (`update_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS `ucp_leader_app_settings` (
            `factionid` INT NOT NULL,
            `open` TINYINT NOT NULL DEFAULT 1,
            `min_level` INT NOT NULL DEFAULT 10,
            `min_hours` INT NOT NULL DEFAULT 20,
            `updated_by` VARCHAR(32) NOT NULL DEFAULT '',
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`factionid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS `ucp_leader_applications` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `factionid` INT NOT NULL,
            `playerid` INT NOT NULL,
            `playername` VARCHAR(32) NOT NULL,
            `real_name` VARCHAR(64) NOT NULL DEFAULT '',
            `age` INT NOT NULL DEFAULT 16,
            `experience` TEXT NOT NULL,
            `activity` VARCHAR(128) NOT NULL DEFAULT '',
            `plan` TEXT NOT NULL,
            `status` TINYINT NOT NULL DEFAULT 0,
            `reviewed_by` VARCHAR(32) NOT NULL DEFAULT '',
            `review_note` VARCHAR(255) NOT NULL DEFAULT '',
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_leader_app_faction` (`factionid`, `status`),
            KEY `idx_leader_app_player` (`playerid`, `status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS `ucp_player_profiles` (
            `playerid` INT NOT NULL,
            `banner_preset` VARCHAR(32) NOT NULL DEFAULT 'midnight_wolf',
            `banner_url` VARCHAR(255) NOT NULL DEFAULT '',
            `accent_color` VARCHAR(16) NOT NULL DEFAULT '',
            `custom_title` VARCHAR(48) NOT NULL DEFAULT '',
            `bio` VARCHAR(280) NOT NULL DEFAULT '',
            `discord_tag` VARCHAR(48) NOT NULL DEFAULT '',
            `showcase_badge` VARCHAR(32) NOT NULL DEFAULT 'wolf_pack',
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`playerid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS `ucp_wheel_spins` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `playerid` INT NOT NULL,
            `playername` VARCHAR(32) NOT NULL,
            `prize_key` VARCHAR(32) NOT NULL,
            `prize_label` VARCHAR(80) NOT NULL,
            `reward_type` VARCHAR(24) NOT NULL,
            `reward_amount` INT NOT NULL DEFAULT 0,
            `rarity` VARCHAR(16) NOT NULL DEFAULT 'common',
            `delivered_mode` VARCHAR(16) NOT NULL DEFAULT 'db_direct',
            `spun_at` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            KEY `idx_wheel_player` (`playerid`, `spun_at`),
            KEY `idx_wheel_time` (`spun_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    ]
    with db.cursor() as cur:
        for s in stmts:
            try:
                cur.execute(s)
            except Exception:
                pass
        # Seed personal vehicles in `cars` if the table is completely empty
        try:
            cur.execute("SELECT COUNT(*) AS n FROM `cars`")
            c_cnt = cur.fetchone()
            if c_cnt and int(c_cnt.get("n", 0)) == 0:
                seed_cars = [
                    (1, 411, 1480.5, -1740.2, 13.5, 90.0, 3, 1, "AlleqsZ", 35000000, "LS-01-MAX", "Infernus", 1, 1840.5, 985.0, 94, 1, 42, 1, "LUPMAX"),
                    (2, 541, 1485.0, -1740.2, 13.5, 90.0, 6, 0, "AlleqsZ", 29500000, "LS-07-VIP", "Bullet", 1, 920.0, 1000.0, 100, 1, 28, 1, "KING"),
                    (3, 560, 1490.0, -1740.2, 13.5, 90.0, 0, 0, "AlleqsZ", 18000000, "LS-99-PRO", "Sultan", 1, 3410.2, 940.0, 82, 1, 64, 0, ""),
                    (4, 451, 1495.0, -1740.2, 13.5, 90.0, 2, 2, "InCuRaBiL", 26000000, "LV-88-GTR", "Turismo", 1, 1250.8, 975.0, 88, 1, 19, 1, "TURBO"),
                    (5, 522, 1500.0, -1740.2, 13.5, 90.0, 1, 3, "InCuRaBiL", 22000000, "LS-55-NRG", "NRG-500", 1, 610.4, 990.0, 95, 1, 12, 0, ""),
                ]
                for sc in seed_cars:
                    cur.execute(
                        "INSERT INTO `cars` "
                        "(`ID`,`Model`,`Locationx`,`Locationy`,`Locationz`,`Angle`,`ColorOne`,`ColorTwo`,`Owner`,`Value`,"
                        "`License`,`Description`,`Lockk`,`KM`,`HP`,`Gas`,`Owned`,`days`,`Vip`,`Vipname`,`Insurancecar`,`Inscarprice`) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,5000)",
                        sc,
                    )
        except Exception:
            pass
        # Seed initial showcase listings from existing owned cars if table is empty
        try:
            cur.execute("SELECT COUNT(*) AS n FROM `ucp_car_market`")
            cnt_row = cur.fetchone()
            if cnt_row and int(cnt_row.get("n", 0)) == 0:
                cur.execute(
                    "SELECT c.ID, c.Model, c.Owner, c.Value, c.KM, c.Vip, u.id AS uid "
                    "FROM `cars` c LEFT JOIN `users` u ON u.name = c.Owner "
                    "WHERE c.Owned <> 0 AND c.Owner NOT IN ('The State','AdmBot','') "
                    "ORDER BY c.Vip DESC, c.Value DESC, c.ID ASC LIMIT 4"
                )
                sample_cars = cur.fetchall() or []
                now_ts = int(time.time())
                notes = [
                    "Infernus VIP tunat complet, culori rare Hidden, accept Buyout instant sau licitatie!",
                    "Bullet VIP KING, doar 920 KM rulati, intretinut impecabil in garaj LS.",
                    "Turismo VIP TURBO, viteza maxima excelenta, pret negociabil prin licitatie.",
                    "NRG-500 rapid pentru stunt si raport, rulaj mic, asigurare activa.",
                ]
                for idx, sc in enumerate(sample_cars):
                    base_val = max(1500000, int(sc.get("Value") or 5000000))
                    buyout = int(base_val * 1.15)
                    min_b = int(base_val * 0.80)
                    cur_bid = int(base_val * 0.90) if idx == 0 else 0
                    bidder_id = 2 if idx == 0 else 0
                    bidder_name = "InCuRaBiL" if idx == 0 else ""
                    note = notes[idx % len(notes)]
                    cur.execute(
                        "INSERT INTO `ucp_car_market` "
                        "(`car_id`, `seller_sqlid`, `seller_name`, `model`, `buyout_price`, `min_bid`, `current_bid`, "
                        "`high_bidder_sqlid`, `high_bidder_name`, `seller_note`, `status`, `created_at`, `expires_at`) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s)",
                        (
                            int(sc["ID"]),
                            int(sc.get("uid") or 0),
                            sc.get("Owner", "AlleqsZ"),
                            int(sc.get("Model") or 411),
                            buyout,
                            min_b,
                            cur_bid,
                            bidder_id,
                            bidder_name,
                            note,
                            now_ts - (idx * 1800),
                            now_ts + (48 * 3600),
                        ),
                    )
        except Exception:
            pass
    db.commit()


def query(db, sql: str, args=(), one: bool = False):
    with db.cursor() as q:
        q.execute(sql, args)
        return q.fetchone() if one else q.fetchall()


def query_safe(db, sql: str, args=(), one: bool = False, default=None):
    try:
        return query(db, sql, args, one)
    except Exception:
        return default if default is not None else (None if one else [])


def write(db, sql: str, args=()):
    with db.cursor() as q:
        q.execute(sql, args)
        return q.lastrowid


def insert(db, table: str, values: dict):
    cols = ",".join("`" + k + "`" for k in values)
    placeholders = ",".join(["%s"] * len(values))
    return write(db, f"INSERT INTO `{table}` ({cols}) VALUES ({placeholders})", tuple(values.values()))


# ==============================================================================
# SECURITY HELPERS: SESSION BINDING, WAF, VALIDATION, AUDIT
# ==============================================================================
def compute_session_bind_hash(ip: str, user_agent: str, accept_lang: str, client_fp: str) -> str:
    raw = f"{ip}|{user_agent[:180]}|{accept_lang[:64]}|{client_fp[:64]}".encode("utf-8", errors="ignore")
    return hmac.new(SERVER_BOOT_SECRET, raw, hashlib.sha256).hexdigest()


def record_security_event(db, ip: str, actor: str, event_text: str):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with LOCK:
        SECURITY_EVENTS.insert(0, {"time": ts, "ip": ip, "actor": actor, "event": event_text})
        del SECURITY_EVENTS[100:]
    if db is not None:
        try:
            insert(db, "panellogs", {"text": legacy_text(f"[SEC:{ip}] {actor}: {event_text}")[:250]})
            insert(db, "antiflood", {"nume": legacy_text(actor)[:60], "text": legacy_text(event_text)[:120]})
            db.commit()
        except Exception:
            pass


def waf_inspect_payload(obj, path_Hint="") -> None:
    if isinstance(obj, str):
        if "\x00" in obj:
            raise APIError(400, "WAF Alert: Null-byte detectat în cerere.", "WAF_BLOCK")
        if WAF_PATTERNS.search(obj):
            raise APIError(403, f"WAF Shield: Cererea conține secvențe suspecte ({path_Hint}).", "WAF_BLOCK")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            waf_inspect_payload(str(k), "key")
            waf_inspect_payload(v, str(k))
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            waf_inspect_payload(item, f"{path_Hint}[{idx}]")


def require_text(data: dict, key: str, minlen: int = 1, maxlen: int = 2000) -> str:
    val = data.get(key, "")
    if not isinstance(val, str):
        raise APIError(400, f"Câmpul '{key}' trebuie să fie text.")
    val = val.strip()
    if not (minlen <= len(val) <= maxlen):
        raise APIError(400, f"Câmpul '{key}' trebuie să aibă între {minlen} și {maxlen} caractere.")
    waf_inspect_payload(val, key)
    return legacy_text(val)


def require_int(data: dict, key: str, lo: int, hi: int, default=None) -> int:
    val = data.get(key, default)
    if isinstance(val, bool):
        raise APIError(400, f"Valoare numerică invalidă pentru '{key}'.")
    if isinstance(val, str) and val.strip().lstrip("-").isdigit():
        val = int(val.strip())
    if not isinstance(val, int) or not (lo <= val <= hi):
        raise APIError(400, f"Câmpul '{key}' trebuie să fie între {lo} și {hi}.")
    return val


def is_staff(user: dict) -> bool:
    return bool(user and (int(user.get("Admin", 0)) >= 1 or int(user.get("Helper", 0)) >= 1))


def is_admin(user: dict, min_level: int = 1) -> bool:
    return bool(user and int(user.get("Admin", 0)) >= min_level)


def can_manage_faction(user: dict, faction_id: int) -> bool:
    if not user or faction_id <= 0:
        return False
    if int(user.get("Admin", 0)) >= 4 or int(user.get("ManagerLideri", 0)) >= 1 or int(user.get("ManagerLideriSupport", 0)) >= 1:
        return True
    if int(user.get("Leader", 0)) == faction_id:
        return True
    if int(user.get("Member", 0)) == faction_id and int(user.get("Rank", 0)) >= 6:
        return True
    return False


def can_manage_leaders(user: dict) -> bool:
    if not user:
        return False
    return bool(
        int(user.get("Admin", 0)) >= 4
        or int(user.get("ManagerLideri", 0)) >= 1
        or int(user.get("ManagerLideriSupport", 0)) >= 1
    )


def audit_log(db, user: dict, action_text: str):
    actor = user["name"] if user else "System"
    insert(db, "panellogs", {"text": legacy_text(f"{actor}: {action_text}")[:250]})


def notify_player_email(db, target_sqlid: int, giver_sqlid: int, message: str, link: str = "#"):
    """Inserts a notification into `emails` which FiveSecondsTimer in LupMax.pwn announces live in-game!"""
    if target_sqlid <= 0:
        return
    try:
        insert(
            db,
            "emails",
            {
                "playerid": int(target_sqlid),
                "giverid": int(giver_sqlid or 0),
                "Message": legacy_text(message)[:490],
                "EmailRead": 1,
                "LinkPanel": legacy_text(link)[:250],
            },
        )
    except Exception:
        pass


def verify_password(plain_password: str, stored_hash: str) -> bool:
    if not stored_hash or not plain_password:
        return False
    if stored_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), stored_hash.encode("ascii"))
        except Exception:
            return False
    p_bytes = plain_password.encode("utf-8", errors="ignore")
    s_bytes = stored_hash.encode("utf-8", errors="ignore")
    if hmac.compare_digest(p_bytes, s_bytes):
        return True
    escaped = pymysql.converters.escape_string(plain_password).encode("utf-8", errors="ignore")
    return hmac.compare_digest(escaped, s_bytes)


# ==============================================================================
# USER & PROFILE SERIALIZATION ("LA ULTIMA VIRGULA")
# ==============================================================================
def build_user_badges(u: dict) -> list:
    badges = []
    adm = int(u.get("Admin", 0))
    hlp = int(u.get("Helper", 0))
    ldr = int(u.get("Leader", 0))
    mem = int(u.get("Member", 0) or ldr)
    if adm > 0:
        titles = {
            1: "Trial Admin (1)",
            2: "Junior Admin (2)",
            3: "General Admin (3)",
            4: "Head Admin (4)",
            5: "Co-Owner / Scripter (5)",
            6: "Server Founder / Owner (6)",
        }
        badges.append({"type": "admin", "label": titles.get(adm, f"Admin Level {adm}"), "color": "#ef4444"})
    if hlp > 0:
        badges.append({"type": "helper", "label": f"Helper Level {hlp}", "color": "#10b981"})
    if ldr > 0:
        fmeta = FACTION_META.get(ldr, {"tag": f"F{ldr}", "color": "#3b82f6"})
        badges.append({"type": "leader", "label": f"Leader {fmeta['tag']}", "color": "#3b82f6"})
    elif mem > 0:
        fmeta = FACTION_META.get(mem, {"tag": f"F{mem}", "color": "#60a5fa"})
        badges.append({"type": "member", "label": f"Membru {fmeta['tag']} (R{u.get('Rank', 1)})", "color": fmeta["color"]})
    if int(u.get("Legend", 0)) >= 1:
        badges.append({"type": "legend", "label": "LEGEND", "color": "#f59e0b"})
    vip_info = compute_vip_status(u.get("VIP", 0), u.get("VIPDays", 0))
    if vip_info["active"]:
        badges.append({"type": "vip", "label": vip_info["label"], "color": "#eab308"})
    if int(u.get("Premium", 0)) >= 1 or int(u.get("PremiumDays", 0)) > 0:
        badges.append({"type": "premium", "label": "Premium Account", "color": "#a855f7"})
    for m in MANAGER_ROLES:
        if int(u.get(m["col"], 0)) >= 1:
            badges.append({"type": "manager", "label": m["label"], "color": m["color"]})
    if int(u.get("Support", 0)) >= 1:
        badges.append({"type": "support", "label": "Support Team", "color": "#06b6d4"})
    if int(u.get("Beta", 0)) >= 1:
        badges.append({"type": "beta", "label": "Beta Tester", "color": "#8b5cf6"})
    if int(u.get("Host", 0)) >= 1:
        badges.append({"type": "host", "label": "Event Host", "color": "#ec4899"})
    return badges


def serialize_user_summary(u: dict, factions_map: dict = None) -> dict:
    mem = int(u.get("Member", 0) or u.get("Leader", 0) or 0)
    f_name = "Civilian"
    f_rank_name = "Civil"
    if mem > 0 and factions_map and mem in factions_map:
        f = factions_map[mem]
        f_name = f.get("Name", f"Facțiunea #{mem}")
        rk = max(1, min(7, int(u.get("Rank", 1) or (7 if int(u.get("Leader", 0)) == mem else 1))))
        f_rank_name = f.get(f"Rank{rk}", f"Rank {rk}")
    elif mem > 0:
        f_name = FACTION_META.get(mem, {}).get("tag", f"Faction {mem}")
    vip_info = compute_vip_status(u.get("VIP", 0), u.get("VIPDays", 0))
    return {
        "id": int(u.get("id", 0)),
        "name": u.get("name", ""),
        "Level": int(u.get("Level", 0)),
        "Respect": int(u.get("Respect", 0)),
        "RespectNeeded": (int(u.get("Level", 1)) * 3) + 2,
        "Admin": int(u.get("Admin", 0)),
        "Helper": int(u.get("Helper", 0)),
        "Member": mem,
        "Leader": int(u.get("Leader", 0)),
        "Rank": int(u.get("Rank", 0)),
        "FactionName": f_name,
        "FactionTag": FACTION_META.get(mem, {"tag": "CIVIL"})["tag"],
        "FactionColor": FACTION_META.get(mem, {"color": "#94a3b8"})["color"],
        "FactionRankName": f_rank_name,
        "Status": int(u.get("Status", 0)),
        "Model": int(u.get("Model", 170) or 170),
        "Money": int(u.get("Money", 0)),
        "Bank": int(u.get("Bank", 0)),
        "PremiumPoints": int(u.get("PremiumPoints", 0)),
        "ConnectedTime": round(float(u.get("ConnectedTime", 0) or 0), 1),
        "OnlineToday": int(u.get("OnlineToday", 0)),
        "OnlineThisWeek": int(u.get("OnlineThisWeek", 0)),
        "Warnings": int(u.get("Warnings", 0)),
        "FWarn": int(u.get("FWarn", 0)),
        "FPunish": int(u.get("FPunish", 0)),
        "Clan": int(u.get("Clan", 0)),
        "CRank": int(u.get("CRank", 0)),
        "PhoneNr": int(u.get("PhoneNr", 0)),
        "House": int(u.get("House", 999)),
        "Bizz": int(u.get("Bizz", 255)),
        "Job": int(u.get("Job", 0)),
        "JobName": JOBS_BY_ID.get(int(u.get("Job", 0)), "Fără Job"),
        "Legend": int(u.get("Legend", 0)),
        "VIPStatus": vip_info,
        "RegisterDate": u.get("RegisterDate", ""),
        "lastOn": u.get("lastOn", ""),
        "badges": build_user_badges(u),
    }


def serialize_full_player_profile(db, target: dict, viewer: dict) -> dict:
    factions_rows = query(db, "SELECT * FROM factions ORDER BY ID")
    factions_map = {int(f["ID"]): f for f in factions_rows}
    summary = serialize_user_summary(target, factions_map)
    uid = int(target["id"])
    uname = target["name"]
    viewer_is_staff = is_staff(viewer)
    viewer_is_admin = is_admin(viewer, 1)
    viewer_is_self = bool(viewer and int(viewer["id"]) == uid)

    # Clan info
    clan_info = None
    if int(target.get("Clan", 0)) > 0:
        c_row = query_safe(db, "SELECT * FROM clans WHERE clanID=%s", (int(target["Clan"]),), one=True)
        if c_row:
            cr = max(1, min(7, int(target.get("CRank", 1) or 1)))
            clan_info = {
                "id": int(c_row["clanID"]),
                "name": c_row.get("clanName", ""),
                "tag": c_row.get("clanTag", ""),
                "color": c_row.get("clanColor", "FFCC99"),
                "rank": cr,
                "rank_name": c_row.get(f"clanRankName{cr}", f"Rank {cr}"),
                "days": int(target.get("ClanTime", 0)),
                "join_date": target.get("ClanJoin", "0"),
                "warns": int(target.get("ClanWarns", 0)),
            }

    # All 9 Job Skills + Extra Update Skills
    skills = []
    for sk in JOB_SKILLS_META:
        s_lvl = int(target.get(sk["skill_col"], 1) or 1)
        s_times = int(target.get(sk["times_col"], 0) or 0)
        s_rem = int(target.get(sk["rem_col"], 26) or 0)
        total_for_level = max(1, s_times + max(0, s_rem))
        pct = 100 if s_lvl >= 5 else min(100, int(round((s_times / total_for_level) * 100)))
        skills.append({
            "key": sk["key"],
            "name": sk["name"],
            "level": s_lvl,
            "deliveries": s_times,
            "remaining": max(0, s_rem),
            "progress_pct": pct,
        })

    # Licenses
    licenses = [
        {"key": "Car",  "name": "Permis Auto (Driving)",    "has": int(target.get("CarLic", 0)) == 1,  "hours": int(target.get("CarLicT", 0)),  "suspended": int(target.get("CarLicSuspend", 0))},
        {"key": "Fly",  "name": "Licență Zbor (Pilot)",     "has": int(target.get("FlyLic", 0)) == 1,  "hours": int(target.get("FlyLicT", 0)),  "suspended": 0},
        {"key": "Boat", "name": "Licență Navigație (Boat)", "has": int(target.get("BoatLic", 0)) == 1, "hours": int(target.get("BoatLicT", 0)), "suspended": 0},
        {"key": "Fish", "name": "Permis Pescuit (Fishing)", "has": int(target.get("FishLic", 0)) == 1, "hours": int(target.get("FishLicT", 0)), "suspended": 0},
        {"key": "Gun",  "name": "Port-Armă (Weapon)",       "has": int(target.get("GunLic", 0)) == 1,  "hours": int(target.get("GunLicT", 0)),  "suspended": int(target.get("GunLicSuspend", 0))},
    ]

    # Faction & Department Raport
    raport = {
        "faction_id": summary["Member"],
        "faction_name": summary["FactionName"],
        "rank": summary["Rank"],
        "rank_name": summary["FactionRankName"],
        "fwarns": int(target.get("FWarn", 0)),
        "fpunish": int(target.get("FPunish", 0)),
        "faction_days": int(target.get("FactionTime", 0)),
        "faction_join": target.get("FactionJoin", "0"),
        "fworks": int(target.get("FWorks", 0)),
        "arrested": int(target.get("Arrested", 0)),
        "tickets_issued": int(target.get("Tickets", 0)),
        "licenses_confiscated": int(target.get("Lconf", 0)),
        "frisks": int(target.get("Frisks", 0)),
        "drugs_confiscated": int(target.get("Drugsdep", 0)),
        "mats_confiscated": int(target.get("Matsdep", 0)),
        "medics_healed": int(target.get("Mdep", 0)),
        "news_lives": int(target.get("Lives", 0)),
    }

    # Combat, Crime, Paintball, Race & Quests
    q1_type = int(target.get("Misiune", 0))
    q1_prog = int(target.get("ProgresMisiune", 0))
    q1_targ = int(target.get("CerinteMisiune", 0))
    q1_done = int(target.get("MisiuneTerminata", 0))

    q2_type = int(target.get("Misiune2", 0))
    q2_prog = int(target.get("ProgresMisiune2", 0))
    q2_targ = int(target.get("CerinteMisiune2", 0))
    q2_done = int(target.get("MisiuneTerminata2", 0))

    xmas = query_safe(
        db,
        "SELECT * FROM christmas_progress WHERE player_id=%s ORDER BY season DESC LIMIT 1",
        (uid,),
        one=True,
    )
    claimed_advent_days = []
    if xmas:
        bitmask = int(xmas.get("days", 0) or 0)
        claimed_advent_days = [d for d in range(1, 26) if (bitmask & (1 << (d - 1)))]

    gameplay = {
        "kills": int(target.get("Kills", 0)),
        "deaths": int(target.get("Deaths", 0)),
        "crimes": int(target.get("Crimes", 0)),
        "wanted_level": int(target.get("WantedLevel", 0)),
        "wanted_deaths": int(target.get("WantedDeaths", 0)),
        "head_value": int(target.get("HeadValue", 0)),
        "jailed": int(target.get("Jailed", 0)),
        "jail_time": int(target.get("JailTime", 0)),
        "muted": int(target.get("Muted", 0)),
        "mute_time": int(target.get("MuteTime", 0)),
        "rob_points": int(target.get("Rob", 0)),
        "materials": int(target.get("Materials", 0)),
        "drugs": int(target.get("Drugs", 0)),
        "fishes": int(target.get("Fishes", 0)),
        "gas_can": int(target.get("GasCan", 0)),
        "hidden_color": int(target.get("HiddenColor", 0)),
        "wtalkie": int(target.get("WTalkie", 0)),
        "phone_type": "iPhone" if int(target.get("Phone", 0)) == 2 else ("Standard" if int(target.get("Phone", 0)) == 1 else "Fără"),
        "phone_credits": int(target.get("PhoneCredits", 0)),
        "mp3": int(target.get("MP3", 0)),
        "glasses": int(target.get("Glasses", 0)),
        "hats": int(target.get("Hats", 0)),
        "fight_style": FIGHT_STYLES.get(int(target.get("FightStyle", 0)), "Standard"),
        "paintball": {
            "kills": int(target.get("PaintKills", 0)),
            "deaths": int(target.get("PaintDeath", 0)),
            "rank": int(target.get("PaintRank", 0)),
        },
        "race_arena": {
            "points": int(target.get("RacePoints", 0)),
            "exp": int(target.get("RaceExp", 0)),
        },
        "quests": {
            "q1": {
                "type": q1_type,
                "text": format_quest1(q1_type, q1_prog, q1_targ),
                "progress": q1_prog,
                "target": q1_targ,
                "done": bool(q1_done),
            },
            "q2": {
                "type": q2_type,
                "text": format_quest2(q2_type, q2_prog, q2_targ),
                "progress": q2_prog,
                "target": q2_targ,
                "done": bool(q2_done),
            },
            "special_quest": decode_special_quest(target.get("SpecialQuest", "")),
            "christmas": {
                "season": int(xmas["season"]) if xmas else datetime.date.today().year,
                "claimed_days": claimed_advent_days,
                "grand_claimed": bool(xmas and int(xmas.get("grand_claimed", 0))),
            },
        },
        "staff_metrics": {
            "admin_warns": int(target.get("AW", 0)),
            "helper_warns": int(target.get("HW", 0)),
            "helped_players": int(target.get("HelpedPlayers", 0)),
            "helped_today": int(target.get("HelpedPlayersToday", 0)),
            "admin_commands": int(target.get("Commands", 0)),
            "cr_players": int(target.get("CrPlayers", 0)),
            "helper_points": int(target.get("HPoints", 0)),
        },
    }

    # Personal Vehicles (cars table)
    raw_cars = query(
        db,
        "SELECT ID, Model, Description, KM, Gas, Value, License, HP, ColorOne, ColorTwo, "
        "Lockk, Spawned, PaintJ, days, Insurancecar, Inscarprice, Vip, Vipname, Vipnamecolor "
        "FROM cars WHERE Owner=%s AND Owned<>0 ORDER BY ID",
        (uname,),
    )
    cars = []
    for c in raw_cars:
        mdl = int(c.get("Model", 400))
        cars.append({
            "ID": int(c["ID"]),
            "Model": mdl,
            "ModelName": VEHICLE_NAMES.get(mdl, c.get("Description") or f"Model {mdl}"),
            "KM": round(float(c.get("KM", 0) or 0), 1),
            "Gas": int(c.get("Gas", 100)),
            "Value": int(c.get("Value", 0)),
            "License": c.get("License", "NewCar"),
            "HP": round(float(c.get("HP", 1000) or 1000), 0),
            "ColorOne": int(c.get("ColorOne", 0)),
            "ColorTwo": int(c.get("ColorTwo", 0)),
            "Locked": int(c.get("Lockk", 0)) == 1,
            "Spawned": int(c.get("Spawned", 0)) == 1,
            "Days": int(c.get("days", 0)),
            "InsurancePoints": int(c.get("Insurancecar", 0)),
            "InsurancePrice": int(c.get("Inscarprice", 0)),
            "Vip": int(c.get("Vip", 0)) >= 1,
            "VipName": c.get("Vipname", ""),
            "VipNameColor": c.get("Vipnamecolor", "FFFFFF"),
        })

    # Houses & Businesses
    houses = query(
        db,
        "SELECT ID, Owner, Discription, Rent, Rentabil, Value, Level, Lockk, Takings, Interior, Entrancex, Entrancey "
        "FROM houses WHERE Owner=%s AND Owned<>0 ORDER BY ID",
        (uname,),
    )
    businesses = query(
        db,
        "SELECT ID, Owner, Message, EntranceCost, BuyPrice, Type, Till, Locked, LevelNeeded "
        "FROM bizz WHERE Owner=%s AND Owned<>0 ORDER BY ID",
        (uname,),
    )
    for b in businesses:
        btype = BUSINESS_TYPES.get(int(b.get("Type", 0)), {"name": "Business", "color": "#38bdf8"})
        b["TypeName"] = btype["name"]
        b["TypeColor"] = btype["color"]

    # Faction History (faction_logs + factionlog)
    fh = query_safe(
        db,
        "SELECT id, Text AS text, time FROM faction_logs WHERE player=%s ORDER BY id DESC LIMIT 40",
        (uid,),
    )
    if not fh:
        fh = query_safe(
            db,
            "SELECT ID AS id, action AS text, time FROM factionlog WHERE player=%s ORDER BY ID DESC LIMIT 40",
            (uname,),
        )
    for row in fh:
        row["text"] = clean_samp_colors(row.get("text", ""))

    # Sanctions / Punishlogs (visible to self or staff)
    sanctions = []
    if viewer_is_self or viewer_is_staff:
        sanctions = query_safe(
            db,
            "SELECT id, playername, givername, actionid, actiontime, reason, complaintid, time "
            "FROM punishlogs WHERE playerid=%s OR playername=%s ORDER BY id DESC LIMIT 40",
            (uid, uname),
        )
        for s in sanctions:
            meta = PUNISHLOG_LABELS.get(int(s.get("actionid", 0)), {"label": f"Acțiune #{s.get('actionid')}", "color": "#94a3b8"})
            s["action_label"] = meta["label"]
            s["action_color"] = meta["color"]

    # Extended update tables if present (Crypto, Bunker, BattlePass, Crates, Marriage, Shares)
    extended = {
        "crypto": query_safe(db, "SELECT * FROM crypto_wallets WHERE player_sqlid=%s", (uid,), one=True),
        "bunker": query_safe(db, "SELECT * FROM player_bunkers WHERE player_sqlid=%s", (uid,), one=True),
        "battlepass": query_safe(db, "SELECT * FROM battlepass_data WHERE player_sqlid=%s", (uid,), one=True),
        "crates": query_safe(db, "SELECT * FROM crates_inventory WHERE player_sqlid=%s", (uid,), one=True),
        "marriage": query_safe(
            db,
            "SELECT * FROM marriage_data WHERE player1_sqlid=%s OR player2_sqlid=%s LIMIT 1",
            (uid, uid),
            one=True,
        ),
        "biz_shares": query_safe(db, "SELECT * FROM biz_shares WHERE player_sqlid=%s", (uid,)),
    }

    # Admin-only security & multi-account intelligence
    admin_intel = None
    if viewer_is_admin:
        ip_cur = target.get("IP", "0.0.0.0")
        ip_last = target.get("LastIP", "0")
        pcid = target.get("PCID", "")
        clones = []
        if ip_cur not in ("", "0", "0.0.0.0"):
            clones = query_safe(
                db,
                "SELECT id, name, Level, Status, IP, LastIP, PCID, lastOn FROM users "
                "WHERE id<>%s AND (IP=%s OR LastIP=%s OR (PCID<>'' AND PCID=%s)) LIMIT 25",
                (uid, ip_cur, ip_cur, pcid or "__NONE__"),
            )
        ip_history = query_safe(
            db,
            "SELECT ID, ip, time FROM iplogs WHERE playerid=%s OR name=%s ORDER BY ID DESC LIMIT 25",
            (uid, uname),
        )
        player_logs = query_safe(
            db,
            "SELECT ID, action, time FROM playerlogs WHERE playerid=%s ORDER BY ID DESC LIMIT 30",
            (uid,),
        )
        active_ban = query_safe(
            db,
            "SELECT * FROM bans WHERE PlayerName=%s AND Active=1 AND (Permanent=1 OR Time>%s) ORDER BY ID DESC LIMIT 1",
            (uname, int(time.time())),
            one=True,
        )
        admin_intel = {
            "ip": ip_cur,
            "last_ip": ip_last,
            "pcid": pcid,
            "email": target.get("Email", ""),
            "clones": clones,
            "ip_history": ip_history,
            "player_logs": player_logs,
            "active_ban": active_ban,
        }

    custom_row = query_safe(db, "SELECT * FROM ucp_player_profiles WHERE playerid=%s", (uid,), one=True) or {}
    preset_key = custom_row.get("banner_preset") or "midnight_wolf"
    if preset_key not in PROFILE_BANNER_PRESETS:
        preset_key = "midnight_wolf"
    badge_key = custom_row.get("showcase_badge") or "wolf_pack"
    if badge_key not in PROFILE_SHOWCASE_BADGES:
        badge_key = "wolf_pack"
    wheel_cnt_row = query_safe(db, "SELECT COUNT(*) AS n FROM ucp_wheel_spins WHERE playerid=%s", (uid,), one=True, default={"n": 0})
    profile_custom = {
        "banner_preset": preset_key,
        "banner_css": PROFILE_BANNER_PRESETS[preset_key]["css"],
        "banner_url": custom_row.get("banner_url") or "",
        "accent_color": custom_row.get("accent_color") or "",
        "custom_title": custom_row.get("custom_title") or "",
        "bio": custom_row.get("bio") or "",
        "discord_tag": custom_row.get("discord_tag") or "",
        "showcase_badge": badge_key,
        "showcase_badge_meta": PROFILE_SHOWCASE_BADGES[badge_key],
        "wheel_spins_total": int(wheel_cnt_row.get("n", 0) or 0),
    }

    return {
        "summary": summary,
        "profile_custom": profile_custom,
        "identity": {
            "sex": "Feminin" if int(target.get("Sex", 1)) == 2 else "Masculin",
            "age": int(target.get("Age", 18)),
            "origin": "Las Venturas" if int(target.get("Origin", 1)) == 2 else "Los Santos",
            "register_date": target.get("RegisterDate", ""),
            "last_on": target.get("lastOn", ""),
            "online_today": int(target.get("OnlineToday", 0)),
            "online_this_week": int(target.get("OnlineThisWeek", 0)),
            "online_last_week": int(target.get("OnlineLastWeek", 0)),
            "payday_had": int(target.get("PayDayHad", 0)),
            "rented_house": int(target.get("Rented", 0)),
        },
        "raport": raport,
        "clan": clan_info,
        "skills": skills,
        "licenses": licenses,
        "gameplay": gameplay,
        "cars": cars,
        "houses": houses,
        "businesses": businesses,
        "faction_history": fh,
        "sanctions": sanctions,
        "extended": extended,
        "admin_intel": admin_intel,
    }


# ==============================================================================
# LIVE SA-MP UDP QUERY ENGINE (OPCODE 'i', 'r', 'c' ON PORT 7777)
# ==============================================================================
def query_samp_udp(host: str = "127.0.0.1", port: int = 7777, fallback_online: int = 0) -> dict:
    """Queries live samp-server.exe via official SA-MP UDP Query protocol with graceful fallback."""
    result = {
        "udp_online": False,
        "address": "rpg.lupmax.ro:7777",
        "ip": host,
        "port": port,
        "hostname": "LupMax RPG [0.3.7]",
        "gamemode": "LupMax RPG v2.4",
        "language": "Romanian / English",
        "mapname": "San Andreas",
        "version": "0.3.7-R2",
        "weather": "10",
        "worldtime": datetime.datetime.now().strftime("%H:00"),
        "lagcomp": "On",
        "weburl": "panel.lupmax.ro",
        "passworded": False,
        "players": int(fallback_online),
        "max_players": 100,
        "ping_ms": 1,
        "udp_clients": [],
    }
    # Read server.cfg defaults if present
    srv_cfg = PROJECT_ROOT / "server.cfg"
    if srv_cfg.exists():
        try:
            for line in srv_cfg.read_text(encoding="utf-8", errors="ignore").splitlines():
                parts = line.strip().split(None, 1)
                if len(parts) == 2:
                    k, v = parts[0].lower(), parts[1].strip()
                    if k == "hostname":
                        result["hostname"] = v
                    elif k == "maxplayers" and v.isdigit():
                        result["max_players"] = int(v)
                    elif k == "port" and v.isdigit():
                        port = int(v)
                        result["port"] = port
                    elif k == "weburl":
                        result["weburl"] = v
                    elif k == "language":
                        result["language"] = v
        except Exception:
            pass

    try:
        ip_bytes = socket.inet_aton(socket.gethostbyname(host))
        hdr = b"SAMP" + ip_bytes + struct.pack("<H", port)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.28)
        t0 = time.perf_counter()

        # 1. Opcode 'i' (Information)
        sock.sendto(hdr + b"i", (host, port))
        data, _ = sock.recvfrom(2048)
        ping_ms = max(1, int(round((time.perf_counter() - t0) * 1000)))
        if len(data) > 11 and data[:11] == hdr + b"i":
            pos = 11
            passworded = data[pos] != 0
            pos += 1
            players, max_players = struct.unpack("<HH", data[pos:pos + 4])
            pos += 4

            def read_str4(buf, p):
                ln = struct.unpack("<I", buf[p:p + 4])[0]
                p += 4
                s = buf[p:p + ln].decode("latin1", errors="ignore")
                return s, p + ln

            hostname, pos = read_str4(data, pos)
            gamemode, pos = read_str4(data, pos)
            language, pos = read_str4(data, pos)
            result.update({
                "udp_online": True,
                "passworded": passworded,
                "players": players,
                "max_players": max_players,
                "hostname": hostname or result["hostname"],
                "gamemode": gamemode or result["gamemode"],
                "language": language or result["language"],
                "ping_ms": ping_ms,
            })

            # 2. Opcode 'r' (Rules)
            try:
                sock.sendto(hdr + b"r", (host, port))
                rdata, _ = sock.recvfrom(2048)
                if len(rdata) > 13 and rdata[:11] == hdr + b"r":
                    rcount = struct.unpack("<H", rdata[11:13])[0]
                    rpos = 13
                    rules = {}
                    for _ in range(rcount):
                        klen = rdata[rpos]
                        rpos += 1
                        rk = rdata[rpos:rpos + klen].decode("latin1", errors="ignore").lower()
                        rpos += klen
                        vlen = rdata[rpos]
                        rpos += 1
                        rv = rdata[rpos:rpos + vlen].decode("latin1", errors="ignore")
                        rpos += vlen
                        rules[rk] = rv
                    if "mapname" in rules:
                        result["mapname"] = rules["mapname"]
                    if "version" in rules:
                        result["version"] = rules["version"]
                    if "weather" in rules:
                        result["weather"] = rules["weather"]
                    if "worldtime" in rules:
                        result["worldtime"] = rules["worldtime"]
                    if "lagcomp" in rules:
                        result["lagcomp"] = rules["lagcomp"]
                    if "weburl" in rules:
                        result["weburl"] = rules["weburl"]
            except Exception:
                pass

            # 3. Opcode 'c' (Client list)
            try:
                sock.sendto(hdr + b"c", (host, port))
                cdata, _ = sock.recvfrom(4096)
                if len(cdata) > 13 and cdata[:11] == hdr + b"c":
                    ccount = struct.unpack("<H", cdata[11:13])[0]
                    cpos = 13
                    clients = []
                    for _ in range(min(ccount, 100)):
                        nlen = cdata[cpos]
                        cpos += 1
                        cname = cdata[cpos:cpos + nlen].decode("latin1", errors="ignore")
                        cpos += nlen
                        cscore = struct.unpack("<i", cdata[cpos:cpos + 4])[0]
                        cpos += 4
                        clients.append({"name": cname, "score": cscore})
                    result["udp_clients"] = clients
            except Exception:
                pass
        sock.close()
    except Exception:
        pass
    return result


# ==============================================================================
# API DATA BUILDERS
# ==============================================================================
def build_bootstrap(db, user: dict, session_info: dict = None) -> dict:
    now = int(time.time())
    factions_rows = query(
        db,
        "SELECT f.*, (SELECT COUNT(*) FROM users u WHERE u.Member=f.ID OR u.Leader=f.ID) AS MembersCount, "
        "(SELECT u2.name FROM users u2 WHERE u2.Leader=f.ID LIMIT 1) AS LeaderName "
        "FROM factions f ORDER BY f.ID",
    )
    factions_map = {int(f["ID"]): f for f in factions_rows}

    stats = {
        "online": int(query(db, "SELECT COUNT(*) n FROM users WHERE Status=1", one=True)["n"]),
        "total_users": int(query(db, "SELECT COUNT(*) n FROM users", one=True)["n"]),
        "total_houses": int(query(db, "SELECT COUNT(*) n FROM houses", one=True)["n"]),
        "owned_houses": int(query(db, "SELECT COUNT(*) n FROM houses WHERE Owned<>0 AND Owner NOT IN ('The State','AdmBot','LupMax House','.empty.')", one=True)["n"]),
        "total_bizz": int(query(db, "SELECT COUNT(*) n FROM bizz", one=True)["n"]),
        "owned_bizz": int(query(db, "SELECT COUNT(*) n FROM bizz WHERE Owned<>0 AND Owner NOT IN ('The State','AdmBot')", one=True)["n"]),
        "total_cars": int(query(db, "SELECT COUNT(*) n FROM cars WHERE Owned<>0", one=True)["n"]),
        "vip_cars": int(query_safe(db, "SELECT COUNT(*) n FROM cars WHERE Owned<>0 AND Vip>0", one=True, default={"n": 0})["n"]),
        "total_factions": len(factions_rows),
        "total_clans": int(query_safe(db, "SELECT COUNT(*) n FROM clans", one=True, default={"n": 0})["n"]),
        "active_bans": int(query(db, "SELECT COUNT(*) n FROM bans WHERE Active=1 AND (Permanent=1 OR Time>%s)", (now,), one=True)["n"]),
        "open_tickets": int(query(db, "SELECT COUNT(*) n FROM tickets WHERE Status=0", one=True)["n"]),
        "open_complaints": int(query(db, "SELECT COUNT(*) n FROM complaints WHERE status=0", one=True)["n"]),
        "open_unbans": int(query_safe(db, "SELECT COUNT(*) n FROM unban_requests WHERE status=0", one=True, default={"n": 0})["n"]),
        "open_applications": int(query(db, "SELECT COUNT(*) n FROM aplications WHERE status=0", one=True)["n"]),
        "open_leader_apps": int(query_safe(db, "SELECT COUNT(*) n FROM ucp_leader_applications WHERE status=0", one=True, default={"n": 0})["n"]),
    }

    online_players = [
        serialize_user_summary(u, factions_map)
        for u in query(db, "SELECT * FROM users WHERE Status=1 ORDER BY Admin DESC, Helper DESC, Level DESC LIMIT 50")
    ]

    recent_sanctions = query(
        db,
        "SELECT id, playername, givername, actionid, actiontime, reason, complaintid, time "
        "FROM punishlogs ORDER BY id DESC LIMIT 15",
    )
    for s in recent_sanctions:
        meta = PUNISHLOG_LABELS.get(int(s.get("actionid", 0)), {"label": f"Acțiune #{s.get('actionid')}", "color": "#94a3b8"})
        s["action_label"] = meta["label"]
        s["action_color"] = meta["color"]

    recent_fh = query_safe(db, "SELECT id, player, Text AS text, time FROM faction_logs ORDER BY id DESC LIMIT 15")
    for r in recent_fh:
        r["text"] = clean_samp_colors(r.get("text", ""))

    updates = query_safe(db, "SELECT id, text, date, byAdmin, `For`, time FROM updates ORDER BY id DESC LIMIT 30")
    up_ids = [int(up["id"]) for up in updates if up.get("id") is not None]
    rating_stats_map = {}
    user_ratings_map = {}
    rating_meta_map = {}
    if up_ids:
        ph = ",".join(["%s"] * len(up_ids))
        r_rows = query_safe(
            db,
            f"SELECT update_id, COUNT(*) AS cnt, ROUND(AVG(rating), 2) AS avg_rating "
            f"FROM ucp_update_ratings WHERE update_id IN ({ph}) GROUP BY update_id",
            tuple(up_ids),
        )
        for rr in r_rows:
            rating_stats_map[int(rr["update_id"])] = {
                "count": int(rr.get("cnt", 0) or 0),
                "avg": float(rr.get("avg_rating", 0) or 0),
            }
        m_rows = query_safe(
            db,
            f"SELECT update_id, rating_enabled FROM ucp_update_meta WHERE update_id IN ({ph})",
            tuple(up_ids),
        )
        for mr in m_rows:
            rating_meta_map[int(mr["update_id"])] = int(mr.get("rating_enabled", 1)) == 1
        if user:
            ur_rows = query_safe(
                db,
                f"SELECT update_id, rating FROM ucp_update_ratings WHERE user_id=%s AND update_id IN ({ph})",
                (int(user["id"]), *up_ids),
            )
            for ur in ur_rows:
                user_ratings_map[int(ur["update_id"])] = int(ur.get("rating", 0) or 0)

    for up in updates:
        uid_item = int(up.get("id", 0))
        up["text"] = clean_samp_colors(up.get("text", ""))
        st = rating_stats_map.get(uid_item, {"count": 0, "avg": 0.0})
        up["rating_count"] = st["count"]
        up["rating_avg"] = round(st["avg"], 2)
        up["user_rating"] = user_ratings_map.get(uid_item, 0)
        up["rating_enabled"] = rating_meta_map.get(uid_item, True)

    leader_settings_rows = query_safe(db, "SELECT factionid, open, min_level, min_hours FROM ucp_leader_app_settings")
    leader_settings_map = {int(r["factionid"]): r for r in leader_settings_rows}

    factions_summary = []
    for f in factions_rows:
        fid = int(f["ID"])
        meta = FACTION_META.get(fid, {"tag": f"F{fid}", "type": "Faction", "color": "#3b82f6", "city": "LS"})
        leader_name = f.get("LeaderName") or "Fără Lider"
        ls_cfg = leader_settings_map.get(fid)
        leader_app_open = (int(ls_cfg["open"]) == 1) if ls_cfg is not None else (leader_name == "Fără Lider")
        factions_summary.append({
            "ID": fid,
            "Name": f.get("Name", ""),
            "Tag": meta["tag"],
            "Type": meta["type"],
            "Color": meta["color"],
            "City": meta["city"],
            "LeaderName": leader_name,
            "LeaderAppOpen": leader_app_open,
            "LeaderAppMinLevel": int(ls_cfg["min_level"]) if ls_cfg is not None else max(10, int(f.get("MinLevel", 5))),
            "LeaderAppMinHours": int(ls_cfg["min_hours"]) if ls_cfg is not None else 20,
            "Members": int(f.get("MembersCount", 0)),
            "MaxMembers": int(f.get("MaxMembers", 15)),
            "MinLevel": int(f.get("MinLevel", 5)),
            "Application": int(f.get("Application", 0)) == 1,
            "Anunt": clean_samp_colors(f.get("Anunt", "")),
            "Bank": int(f.get("Bank", 0)),
            "Mats": int(f.get("Mats", 0)),
            "Drugs": int(f.get("Drugs", 0)),
            "Win": int(f.get("Win", 0)),
            "Lost": int(f.get("Lost", 0)),
            "Ranks": {str(i): f.get(f"Rank{i}", f"Rank {i}") for i in range(1, 8)},
            "Questions": [f.get(f"q{i}", "") for i in range(1, 16)],
        })

    unread_emails = 0
    user_emails = []
    if user:
        user_emails = query_safe(
            db,
            "SELECT ID, playerid, giverid, Message, EmailRead, LinkPanel, Time "
            "FROM emails WHERE playerid=%s ORDER BY ID DESC LIMIT 40",
            (int(user["id"]),),
        )
        for em in user_emails:
            em["Message"] = clean_samp_colors(em.get("Message", ""))
            if int(em.get("EmailRead", 0)) == 1:
                unread_emails += 1

    top_players = [
        serialize_user_summary(u, factions_map)
        for u in query(db, "SELECT * FROM users ORDER BY Status DESC, Level DESC, ConnectedTime DESC, id DESC LIMIT 10")
    ]

    cfg = load_db_config()
    return {
        "database_name": cfg.get("database", "test"),
        "stats": stats,
        "samp_query": query_samp_udp("127.0.0.1", 7777, stats["online"]),
        "daily_job": read_daily_job(PROJECT_ROOT),
        "economy_tracker": query_safe(db, "SELECT * FROM server_economy WHERE id=1", one=True),
        "online_players": online_players,
        "top_players": top_players,
        "recent_sanctions": recent_sanctions,
        "recent_faction_logs": recent_fh,
        "updates": updates,
        "factions": factions_summary,
        "user": serialize_user_summary(user, factions_map) if user else None,
        "unread_emails": unread_emails,
        "emails": user_emails,
        "security": {
            "session_bound": bool(session_info),
            "ip": session_info.get("ip", "127.0.0.1") if session_info else "127.0.0.1",
            "fingerprint": session_info.get("bind_hash", "")[:16] if session_info else "",
            "expires_in": int(max(0, session_info["expires"] - time.time())) if session_info else 0,
        },
        "constants": {
            "complaint_categories": COMPLAINT_CATEGORIES,
            "ticket_categories": TICKET_CATEGORIES,
            "panel_actions": PANEL_ACTIONS_MAP,
            "manager_roles": MANAGER_ROLES,
            "profile_banners": PROFILE_BANNER_PRESETS,
            "profile_badges": PROFILE_SHOWCASE_BADGES,
            "wheel_prizes": LUPMAX_WHEEL_PRIZES,
        },
        "wheel_ready": (
            True
            if (
                user
                and int(
                    (
                        query_safe(
                            db,
                            "SELECT MAX(spun_at) AS last_ts FROM ucp_wheel_spins WHERE playerid=%s",
                            (int(user["id"]),),
                            one=True,
                            default={"last_ts": 0},
                        )
                        or {}
                    ).get("last_ts")
                    or 0
                )
                + 86400
                <= now
            )
            else False
        ),
    }


def get_players_directory(db, params: dict) -> dict:
    factions_rows = query(db, "SELECT * FROM factions ORDER BY ID")
    factions_map = {int(f["ID"]): f for f in factions_rows}

    q = (params.get("q", [""])[0] or "").strip()
    role = (params.get("role", ["all"])[0] or "all").strip().lower()
    faction_filter = int(params.get("faction", ["0"])[0] or 0)
    status_filter = (params.get("status", ["all"])[0] or "all").strip().lower()
    raw_limit = (params.get("limit", ["0"])[0] or "0").strip()
    req_limit = int(raw_limit) if raw_limit.isdigit() else 0

    where = ["1=1"]
    args = []
    if q:
        waf_inspect_payload(q, "search")
        if q.isdigit():
            where.append("(id=%s OR name LIKE %s)")
            args.extend([int(q), f"%{q}%"])
        else:
            where.append("name LIKE %s")
            args.append(f"%{q}%")
    if faction_filter > 0:
        where.append("(Member=%s OR Leader=%s)")
        args.extend([faction_filter, faction_filter])
    if status_filter == "online":
        where.append("Status=1")
    elif status_filter == "offline":
        where.append("Status=0")

    if role == "admins":
        where.append("Admin>0")
    elif role == "helpers":
        where.append("Helper>0")
    elif role == "leaders":
        where.append("Leader>0")
    elif role == "vips":
        where.append("(VIP=1 OR VIP>%s OR VIPDays>0)")
        args.append(int(time.time()))
    elif role == "legends":
        where.append("Legend>0")
    elif role == "managers":
        mgr_cols = " OR ".join(f"`{m['col']}`>0" for m in MANAGER_ROLES)
        where.append(f"({mgr_cols})")

    if q:
        limit_val = min(max(req_limit or 10, 5), 10)
        order_clause = (
            "ORDER BY (LOWER(name) = LOWER(%s)) DESC, "
            "(LOWER(name) LIKE LOWER(%s)) DESC, "
            "Status DESC, Level DESC, ConnectedTime DESC, id DESC"
        )
        args.extend([q, f"{q}%"])
    else:
        limit_val = min(max(req_limit, 5), 50) if req_limit > 0 else 10
        order_clause = "ORDER BY Status DESC, Level DESC, ConnectedTime DESC, Admin DESC, Helper DESC, id DESC"

    sql = f"SELECT * FROM users WHERE {' AND '.join(where)} {order_clause} LIMIT {int(limit_val)}"
    rows = [serialize_user_summary(u, factions_map) for u in query(db, sql, tuple(args))]

    # Staff overview tabs
    all_staff_rows = query(
        db,
        "SELECT * FROM users WHERE Admin>0 OR Helper>0 OR Leader>0 OR ManagerLideri>0 OR ManagerStaff>0 "
        "OR ManagerDepartamente>0 OR ManagerTaxi>0 OR ManagerInstructori>0 OR ManagerMedici>0 OR ManagerHitman>0 "
        "ORDER BY Admin DESC, Helper DESC, Leader ASC, Level DESC",
    )
    admins, helpers, leaders, managers = [], [], [], []
    for u in all_staff_rows:
        s = serialize_user_summary(u, factions_map)
        s["AW"] = int(u.get("AW", 0))
        s["HW"] = int(u.get("HW", 0))
        s["Commands"] = int(u.get("Commands", 0))
        s["CrPlayers"] = int(u.get("CrPlayers", 0))
        s["HelpedPlayers"] = int(u.get("HelpedPlayers", 0))
        s["HelpedPlayersToday"] = int(u.get("HelpedPlayersToday", 0))
        s["HPoints"] = int(u.get("HPoints", 0))
        if int(u.get("Admin", 0)) > 0:
            admins.append(s)
        if int(u.get("Helper", 0)) > 0:
            helpers.append(s)
        if int(u.get("Leader", 0)) > 0:
            leaders.append(s)
        active_mgrs = [m["label"] for m in MANAGER_ROLES if int(u.get(m["col"], 0)) > 0]
        if active_mgrs:
            s["ManagerTitles"] = active_mgrs
            managers.append(s)

    return {
        "players": rows,
        "staff": {
            "admins": admins,
            "helpers": helpers,
            "leaders": leaders,
            "managers": managers,
        },
    }


def compute_member_raport_eval(u: dict, fid: int) -> dict:
    rk = max(1, min(7, int(u.get("Rank", 1) or 1)))
    fworks = int(u.get("FWorks", 0))
    cmds = int(u.get("Commands", 0))
    arr = int(u.get("Arrested", 0))
    tck = int(u.get("Tickets", 0))
    lconf = int(u.get("Lconf", 0))
    frisks = int(u.get("Frisks", 0))
    mdep = int(u.get("Mdep", 0))
    lives = int(u.get("Lives", 0))
    mats = int(u.get("Matsdep", 0))
    drugs = int(u.get("Drugsdep", 0))

    if fid in (1, 2, 3, 8):  # Departments
        pts = arr + tck + lconf + frisks + fworks
        norm_by_rank = {1: 20, 2: 25, 3: 30, 4: 25, 5: 15, 6: 0, 7: 0}
        target = norm_by_rank.get(rk, 20)
        breakdown = f"Arestări: {arr} · Amenzi: {tck} · Permise: {lconf} · Percheziții: {frisks}"
    elif fid in (4, 5, 6, 10):  # Mafias
        pts = fworks + (mats // 1000) + (drugs // 10)
        target = 0 if rk >= 6 else 15
        breakdown = f"War/Act: {fworks} · Mats: {mats:,} · Drugs: {drugs}g"
    elif fid == 7:  # Government
        pts = fworks + cmds
        target = 0 if rk >= 6 else 15
        breakdown = f"Ajutoare sociale (/givetax): {pts}"
    elif fid == 9:  # News Reporters
        pts = fworks + lives
        target = 0 if rk >= 6 else 20
        breakdown = f"Anunțuri: {fworks} · Interviuri Live: {lives}"
    elif fid == 11:  # Hitman Agency
        pts = fworks + cmds
        target = 0 if rk >= 6 else 15
        breakdown = f"Contracte îndeplinite: {pts}"
    elif fid == 12:  # School Instructors
        pts = fworks + cmds
        target = 0 if rk >= 6 else 15
        breakdown = f"Licențe acordate: {pts}"
    elif fid == 13:  # Taxi LS
        pts = fworks + cmds
        target = 0 if rk >= 6 else 20
        breakdown = f"Clienți transportați: {pts}"
    elif fid == 14:  # Paramedic LV
        pts = mdep + fworks
        target = 0 if rk >= 6 else 25
        breakdown = f"Pacienți vindecați (/heal): {pts}"
    else:
        pts = fworks + cmds
        target = 0 if rk >= 6 else 15
        breakdown = f"Acțiuni facțiune: {pts}"

    if rk >= 6 or target == 0:
        status = "exempt"
        status_label = "Scutit (Conducere)"
        pct = 100
    elif pts >= target:
        status = "complete"
        status_label = "Raport Complet"
        pct = 100
    else:
        status = "incomplete"
        status_label = "Raport Incomplet"
        pct = min(99, int(round((pts / max(1, target)) * 100)))

    return {
        "points": pts,
        "target": target,
        "pct": pct,
        "status": status,
        "status_label": status_label,
        "breakdown": breakdown,
    }


def get_faction_detail(db, fid: int, viewer: dict) -> dict:
    f = query(db, "SELECT * FROM factions WHERE ID=%s", (fid,), one=True)
    if not f:
        raise APIError(404, "Facțiunea nu există.")
    factions_map = {fid: f}
    meta = FACTION_META.get(fid, {"tag": f"F{fid}", "type": "Faction", "color": "#3b82f6", "city": "LS"})

    members_raw = query(
        db,
        "SELECT * FROM users WHERE Member=%s OR Leader=%s ORDER BY Leader DESC, Rank DESC, FactionTime DESC",
        (fid, fid),
    )
    members = []
    raport_stats = {"total": len(members_raw), "complete": 0, "incomplete": 0, "exempt": 0}
    for u in members_raw:
        s = serialize_user_summary(u, factions_map)
        s["FactionTime"] = int(u.get("FactionTime", 0))
        s["FactionJoin"] = u.get("FactionJoin", "0")
        s["OnlineThisWeek"] = int(u.get("OnlineThisWeek", 0))
        s["FWorks"] = int(u.get("FWorks", 0))
        s["Commands"] = int(u.get("Commands", 0))
        s["Arrested"] = int(u.get("Arrested", 0))
        s["Tickets"] = int(u.get("Tickets", 0))
        s["Lconf"] = int(u.get("Lconf", 0))
        s["Frisks"] = int(u.get("Frisks", 0))
        s["Mdep"] = int(u.get("Mdep", 0))
        s["Lives"] = int(u.get("Lives", 0))
        s["Matsdep"] = int(u.get("Matsdep", 0))
        s["Drugsdep"] = int(u.get("Drugsdep", 0))
        rep_eval = compute_member_raport_eval(u, fid)
        s["RaportEval"] = rep_eval
        raport_stats[rep_eval["status"]] = raport_stats.get(rep_eval["status"], 0) + 1
        members.append(s)

    can_manage = can_manage_faction(viewer, fid)
    apps_raw = query(
        db,
        "SELECT a.*, u.Level, u.ConnectedTime, u.Warnings, u.FPunish, u.Status "
        "FROM aplications a LEFT JOIN users u ON u.id=a.playerid "
        "WHERE a.factionid=%s ORDER BY a.status ASC, a.id DESC LIMIT 80",
        (fid,),
    )
    applications = []
    for a in apps_raw:
        is_own = bool(viewer and int(viewer["id"]) == int(a.get("playerid", 0)))
        qa_pairs = []
        if can_manage or is_own or is_staff(viewer):
            for i in range(1, 16):
                q_txt = a.get(f"q{i}", "") or f.get(f"q{i}", "")
                r_txt = a.get(f"r{i}", "")
                if q_txt or r_txt:
                    qa_pairs.append({"index": i, "q": q_txt, "a": r_txt})
        applications.append({
            "id": int(a["id"]),
            "name": a.get("name", ""),
            "playerid": int(a.get("playerid", 0)),
            "factionid": fid,
            "status": int(a.get("status", 0)),
            "actionby": a.get("actionby", ""),
            "time": a.get("time", ""),
            "Level": int(a.get("Level") or 0),
            "ConnectedTime": round(float(a.get("ConnectedTime") or 0), 1),
            "Warnings": int(a.get("Warnings") or 0),
            "FPunish": int(a.get("FPunish") or 0),
            "Online": int(a.get("Status") or 0) == 1,
            "qa": qa_pairs,
        })

    flogs = query_safe(db, "SELECT ID, player, action, time FROM factionlog WHERE factionid=%s ORDER BY ID DESC LIMIT 50", (fid,))
    for l in flogs:
        l["action"] = clean_samp_colors(l.get("action", ""))

    deplogs = query_safe(db, "SELECT id, name, action, time FROM factions_deposit WHERE factionid=%s ORDER BY id DESC LIMIT 50", (fid,))
    for d in deplogs:
        d["action"] = clean_samp_colors(d.get("action", ""))

    chatlogs = []
    if can_manage or is_staff(viewer):
        chatlogs = query_safe(db, "SELECT id, text, playerid FROM factions_chat WHERE factionid=%s ORDER BY id DESC LIMIT 50", (fid,))

    return {
        "faction": {
            "ID": fid,
            "Name": f.get("Name", ""),
            "Tag": meta["tag"],
            "Type": meta["type"],
            "Color": meta["color"],
            "City": meta["city"],
            "Members": len(members),
            "MaxMembers": int(f.get("MaxMembers", 15)),
            "MinLevel": int(f.get("MinLevel", 5)),
            "Application": int(f.get("Application", 0)) == 1,
            "Anunt": clean_samp_colors(f.get("Anunt", "")),
            "Bank": int(f.get("Bank", 0)),
            "Mats": int(f.get("Mats", 0)),
            "Drugs": int(f.get("Drugs", 0)),
            "PaydayMoney": int(f.get("PaydayMoney", 0)),
            "Win": int(f.get("Win", 0)),
            "Lost": int(f.get("Lost", 0)),
            "Ranks": {str(i): f.get(f"Rank{i}", f"Rank {i}") for i in range(1, 8)},
            "Questions": [f.get(f"q{i}", "") for i in range(1, 16)],
        },
        "can_manage": can_manage,
        "raport_summary": raport_stats,
        "members": members,
        "applications": applications,
        "logs": flogs,
        "deposit_logs": deplogs,
        "chat_logs": chatlogs,
    }


def get_leader_applications_data(db, viewer: dict) -> dict:
    factions_rows = query(
        db,
        "SELECT f.ID, f.Name, f.MinLevel, f.MaxMembers, "
        "(SELECT COUNT(*) FROM users u WHERE u.Member=f.ID OR u.Leader=f.ID) AS MembersCount, "
        "(SELECT u2.name FROM users u2 WHERE u2.Leader=f.ID LIMIT 1) AS LeaderName "
        "FROM factions f ORDER BY f.ID",
    )
    settings_rows = query_safe(db, "SELECT * FROM ucp_leader_app_settings")
    settings_map = {int(r["factionid"]): r for r in settings_rows}
    fmap = {}
    factions_out = []
    for f in factions_rows:
        fid = int(f["ID"])
        meta = FACTION_META.get(fid, {"tag": f"F{fid}", "type": "Faction", "color": "#3b82f6", "city": "LS"})
        leader_name = f.get("LeaderName") or "Fără Lider"
        scfg = settings_map.get(fid)
        is_open = (int(scfg["open"]) == 1) if scfg is not None else (leader_name == "Fără Lider")
        min_lvl = int(scfg["min_level"]) if scfg is not None else max(10, int(f.get("MinLevel", 5)))
        min_hrs = int(scfg["min_hours"]) if scfg is not None else 20
        item = {
            "ID": fid,
            "Name": f.get("Name", ""),
            "Tag": meta["tag"],
            "Color": meta["color"],
            "City": meta["city"],
            "LeaderName": leader_name,
            "Members": int(f.get("MembersCount", 0)),
            "MaxMembers": int(f.get("MaxMembers", 15)),
            "Open": is_open,
            "MinLevel": min_lvl,
            "MinHours": min_hrs,
        }
        fmap[fid] = item
        factions_out.append(item)

    can_manage = can_manage_leaders(viewer)
    apps_raw = query_safe(
        db,
        "SELECT a.*, u.Level, u.ConnectedTime, u.Warnings, u.FPunish, u.Status, u.Leader AS CurLeader, u.Member AS CurMember "
        "FROM ucp_leader_applications a LEFT JOIN users u ON u.id=a.playerid "
        "ORDER BY a.status ASC, a.id DESC LIMIT 100",
    )
    apps_out = []
    for a in apps_raw:
        fid = int(a.get("factionid", 0))
        finfo = fmap.get(fid, {"Name": f"Facțiunea #{fid}", "Tag": f"F{fid}", "Color": "#3b82f6"})
        is_own = bool(viewer and int(viewer["id"]) == int(a.get("playerid", 0)))
        can_see_details = can_manage or is_own or is_staff(viewer)
        apps_out.append({
            "id": int(a["id"]),
            "factionid": fid,
            "FactionName": finfo["Name"],
            "FactionTag": finfo["Tag"],
            "FactionColor": finfo["Color"],
            "playerid": int(a.get("playerid", 0)),
            "playername": a.get("playername", ""),
            "real_name": a.get("real_name", "") if can_see_details else "Confidențial",
            "age": int(a.get("age", 0)) if can_see_details else 0,
            "experience": a.get("experience", "") if can_see_details else "",
            "activity": a.get("activity", "") if can_see_details else "",
            "plan": a.get("plan", "") if can_see_details else "",
            "status": int(a.get("status", 0)),
            "reviewed_by": a.get("reviewed_by", ""),
            "review_note": a.get("review_note", ""),
            "created_at": a.get("created_at", ""),
            "Level": int(a.get("Level") or 0),
            "ConnectedTime": round(float(a.get("ConnectedTime") or 0), 1),
            "Warnings": int(a.get("Warnings") or 0),
            "FPunish": int(a.get("FPunish") or 0),
            "Online": int(a.get("Status") or 0) == 1,
            "can_see_details": can_see_details,
        })

    return {
        "can_manage": can_manage,
        "factions": factions_out,
        "applications": apps_out,
    }


def apply_set_leader(db, admin_user: dict, target: dict, fid: int, reason: str = "Numire din UCP") -> dict:
    skin_team = LEADER_SKINS_AND_TEAMS.get(fid, {"model": 170, "team": 3})
    f_row = query(db, "SELECT Name FROM factions WHERE ID=%s", (fid,), one=True) if fid > 0 else None
    fname = f_row["Name"] if f_row else (f"Facțiunea #{fid}" if fid > 0 else "Civilian")
    if fid > 0:
        write(
            db,
            "UPDATE users SET Leader=%s, Member=%s, Rank=7, Team=%s, Model=%s, FWarn=0, FPunish=0, ALeader=0 WHERE id=%s",
            (fid, fid, skin_team["team"], skin_team["model"], int(target["id"])),
        )
        msg = f"{target['name']} a fost numit Lider la {fname} (#{fid})!"
    else:
        write(
            db,
            "UPDATE users SET Leader=0, Member=0, Rank=0, Team=3, Model=170, ALeader=0 WHERE id=%s",
            (int(target["id"]),),
        )
        msg = f"{target['name']} a fost scos din funcția de Lider."

    insert(db, "faction_logs", {"player": int(target["id"]), "leader": int(admin_user["id"]), "Text": legacy_text(f"[UCP] {admin_user['name']}: {msg}")})

    online = int(target.get("Status", 0)) == 1
    queued_id = None
    if online:
        queued_id = insert(
            db,
            "panelactions",
            {
                "actionid": 11,
                "actiontime": fid,
                "complaintid": 0,
                "playerid": int(target["id"]),
                "giverid": int(admin_user["id"]),
                "playername": target["name"],
                "givername": admin_user["name"],
                "reason": legacy_text(reason)[:60],
                "dm": 0,
            },
        )
        msg += f" (Trimis și în coada live a serverului: panelactions #{queued_id})."

    notify_player_email(db, int(target["id"]), int(admin_user["id"]), f"[Staff UCP] {msg}", "#factions")
    audit_log(db, admin_user, msg)
    return {"message": msg, "queued": online, "queue_id": queued_id}


def get_wheel_data(db, user: dict) -> dict:
    now = int(time.time())
    cooldown_sec = 86400  # 24h per account
    can_spin = False
    seconds_remaining = 0
    next_spin_at = 0
    my_spins = []
    if user:
        last_row = query_safe(
            db,
            "SELECT MAX(spun_at) AS last_ts FROM ucp_wheel_spins WHERE playerid=%s",
            (int(user["id"]),),
            one=True,
            default={"last_ts": 0},
        )
        last_ts = int((last_row or {}).get("last_ts") or 0)
        if last_ts == 0 or (last_ts + cooldown_sec) <= now:
            can_spin = True
        else:
            next_spin_at = last_ts + cooldown_sec
            seconds_remaining = max(0, next_spin_at - now)
        my_spins = query_safe(
            db,
            "SELECT id, prize_key, prize_label, reward_type, reward_amount, rarity, delivered_mode, spun_at "
            "FROM ucp_wheel_spins WHERE playerid=%s ORDER BY id DESC LIMIT 15",
            (int(user["id"]),),
        )
    recent_winners = query_safe(
        db,
        "SELECT id, playername, prize_key, prize_label, reward_type, reward_amount, rarity, delivered_mode, spun_at "
        "FROM ucp_wheel_spins ORDER BY id DESC LIMIT 20",
    )
    total_spins_row = query_safe(db, "SELECT COUNT(*) AS n FROM ucp_wheel_spins", one=True, default={"n": 0})
    return {
        "prizes": LUPMAX_WHEEL_PRIZES,
        "authenticated": bool(user),
        "can_spin": can_spin,
        "seconds_remaining": seconds_remaining,
        "next_spin_at": next_spin_at,
        "total_server_spins": int((total_spins_row or {}).get("n") or 0),
        "my_spins": my_spins,
        "recent_winners": recent_winners,
    }


def get_clans_data(db, clan_id: int = 0) -> dict:
    clans = query_safe(
        db,
        "SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.Clan=c.clanID) AS MembersCount, "
        "(SELECT u2.name FROM users u2 WHERE u2.Clan=c.clanID AND u2.CRank=7 LIMIT 1) AS OwnerName "
        "FROM clans c ORDER BY c.clanID ASC",
    )
    selected = None
    members = []
    logs = []
    if clan_id == 0 and clans:
        clan_id = int(clans[0]["clanID"])
    if clan_id > 0:
        for c in clans:
            if int(c["clanID"]) == clan_id:
                selected = c
                break
        if selected:
            members = query(
                db,
                "SELECT id, name, Level, CRank, ClanTime, ClanJoin, ClanWarns, Status, Model "
                "FROM users WHERE Clan=%s ORDER BY CRank DESC, ClanTime DESC",
                (clan_id,),
            )
            for m in members:
                rk = max(1, min(7, int(m.get("CRank", 1) or 1)))
                m["RankName"] = selected.get(f"clanRankName{rk}", f"Rank {rk}")
            logs = query_safe(db, "SELECT id, action, time FROM clan_logs WHERE clanid=%s ORDER BY id DESC LIMIT 50", (clan_id,))
            for l in logs:
                l["action"] = clean_samp_colors(l.get("action", ""))
    return {"clans": clans, "selected": selected, "members": members, "logs": logs}


def get_wars_and_turfs(db) -> dict:
    factions_rows = query(db, "SELECT ID, Name, Win, Lost, Mats, Drugs, Bank FROM factions WHERE ID IN (4, 5, 6, 10) ORDER BY ID")
    fmap = {int(f["ID"]): f for f in factions_rows}

    turfs = query(db, "SELECT ID, Owned, MinX, MinY, MaxX, MaxY FROM turfs ORDER BY ID ASC")
    counts = {4: 0, 5: 0, 6: 0, 10: 0}
    for t in turfs:
        owner_id = int(t.get("Owned", 0))
        meta = FACTION_META.get(owner_id, {"tag": "NEUTRU", "color": "#475569"})
        t["OwnerName"] = fmap.get(owner_id, {}).get("Name", f"Facțiune #{owner_id}")
        t["OwnerTag"] = meta["tag"]
        t["Color"] = meta["color"]
        t["City"] = "Las Venturas" if float(t.get("MinY", 0)) > 400 else "Los Santos"
        if owner_id in counts:
            counts[owner_id] += 1

    mafias = []
    for fid in (4, 5, 6, 10):
        f = fmap.get(fid, {"ID": fid, "Name": f"Mafia #{fid}", "Win": 0, "Lost": 0, "Mats": 0, "Drugs": 0, "Bank": 0})
        meta = FACTION_META[fid]
        mafias.append({
            "ID": fid,
            "Name": f["Name"],
            "Tag": meta["tag"],
            "Color": meta["color"],
            "Turfs": counts.get(fid, 0),
            "TurfSharePct": round((counts.get(fid, 0) / max(1, len(turfs))) * 100, 1),
            "Win": int(f.get("Win", 0)),
            "Lost": int(f.get("Lost", 0)),
            "Mats": int(f.get("Mats", 0)),
            "Drugs": int(f.get("Drugs", 0)),
            "Bank": int(f.get("Bank", 0)),
        })
    mafias.sort(key=lambda x: x["Turfs"], reverse=True)

    wars = query_safe(db, "SELECT * FROM wars ORDER BY id DESC LIMIT 40")
    for w in wars:
        att = int(w.get("Attacker", 0))
        dfd = int(w.get("Defender", 0))
        w["AttackerName"] = fmap.get(att, {}).get("Name", FACTION_META.get(att, {}).get("tag", f"F#{att}"))
        w["DefenderName"] = fmap.get(dfd, {}).get("Name", FACTION_META.get(dfd, {}).get("tag", f"F#{dfd}"))
        w["AttackerColor"] = FACTION_META.get(att, {}).get("color", "#38bdf8")
        w["DefenderColor"] = FACTION_META.get(dfd, {}).get("color", "#f43f5e")

    war_top = query_safe(
        db,
        "SELECT w.PlayerID, u.name, w.Faction, SUM(w.Kills) AS TotalKills, SUM(w.Deaths) AS TotalDeaths, COUNT(*) AS WarsPlayed "
        "FROM warlogs w LEFT JOIN users u ON u.id=w.PlayerID "
        "GROUP BY w.PlayerID, u.name, w.Faction ORDER BY TotalKills DESC LIMIT 25",
    )
    for wt in war_top:
        fid = int(wt.get("Faction", 0))
        wt["FactionTag"] = FACTION_META.get(fid, {"tag": "MAFIA"})["tag"]
        wt["FactionColor"] = FACTION_META.get(fid, {"color": "#a855f7"})["color"]

    return {"turfs": turfs, "mafias": mafias, "wars": wars, "war_top": war_top}


def get_economy_data(db, viewer: dict = None) -> dict:
    houses = query(
        db,
        "SELECT ID, Owner, Discription, Hel, Arm, Interior, Lockk, Owned, Rent, Rentabil, Takings, Value, Level, Entrancex, Entrancey "
        "FROM houses ORDER BY ID ASC",
    )
    bizz = query(
        db,
        "SELECT ID, Owned, Owner, Message, LevelNeeded, EntranceCost, Till, Sbiz, Type, Locked, BuyPrice, EntranceX, EntranceY "
        "FROM bizz ORDER BY ID ASC",
    )
    for b in bizz:
        bmeta = BUSINESS_TYPES.get(int(b.get("Type", 0)), {"name": "Business", "color": "#38bdf8"})
        b["TypeName"] = bmeta["name"]
        b["TypeColor"] = bmeta["color"]

    stock = query(db, "SELECT ID, Price, Car, vid, speed, Stock FROM stock ORDER BY Price ASC, ID ASC")
    auctions = query_safe(db, "SELECT * FROM auctions_data WHERE is_active=1 ORDER BY id DESC LIMIT 50")
    trades = query_safe(db, "SELECT * FROM trade_logs ORDER BY id DESC LIMIT 40")
    shares = query_safe(db, "SELECT * FROM biz_shares ORDER BY shares_percent DESC LIMIT 50")

    now_ts = int(time.time())
    market_raw = query_safe(
        db,
        "SELECT m.*, c.Model AS CarModel, c.Description, c.KM, c.days, c.Gas, c.HP, c.ColorOne, c.ColorTwo, "
        "c.License, c.Vip, c.Vipname, c.Value AS BaseValue, c.Insurancecar "
        "FROM ucp_car_market m LEFT JOIN cars c ON c.ID = m.car_id "
        "ORDER BY (m.status = 0) DESC, m.id DESC LIMIT 45",
    )
    market_listings = []
    active_car_ids = set()
    for m in market_raw:
        mdl = int(m.get("CarModel") or m.get("model") or 411)
        st = int(m.get("status", 0))
        if st == 0:
            active_car_ids.add(int(m["car_id"]))
        rem_sec = max(0, int(m.get("expires_at") or 0) - now_ts)
        vip_clean = clean_samp_colors(m.get("Vipname") or "")
        market_listings.append({
            "id": int(m["id"]),
            "car_id": int(m["car_id"]),
            "seller_sqlid": int(m.get("seller_sqlid", 0)),
            "seller_name": m.get("seller_name", ""),
            "model": mdl,
            "Model": mdl,
            "Description": m.get("Description") or VEHICLE_NAMES.get(mdl, f"Vehicul #{mdl}"),
            "model_name": VEHICLE_NAMES.get(mdl, m.get("Description") or f"Vehicul #{mdl}"),
            "buyout_price": int(m.get("buyout_price", 0)),
            "min_bid": int(m.get("min_bid", 0)),
            "current_bid": int(m.get("current_bid", 0)),
            "high_bidder_sqlid": int(m.get("high_bidder_sqlid", 0)),
            "high_bidder_name": m.get("high_bidder_name", ""),
            "seller_note": m.get("seller_note", ""),
            "status": st,
            "buyer_name": m.get("buyer_name", ""),
            "remaining_hours": round(rem_sec / 3600, 1),
            "km": round(float(m.get("KM") or 0), 1),
            "KM": round(float(m.get("KM") or 0), 1),
            "days": int(m.get("days") or 0),
            "gas": int(m.get("Gas") or 100),
            "Gas": int(m.get("Gas") or 100),
            "hp": round(float(m.get("HP") or 1000), 0),
            "HP": round(float(m.get("HP") or 1000), 0),
            "color1": int(m.get("ColorOne") or 1),
            "ColorOne": int(m.get("ColorOne") or 1),
            "color2": int(m.get("ColorTwo") or 1),
            "ColorTwo": int(m.get("ColorTwo") or 1),
            "plate": m.get("License") or "LS-LUPMAX",
            "License": m.get("License") or "LS-LUPMAX",
            "vip": int(m.get("Vip") or 0) > 0,
            "Vip": int(m.get("Vip") or 0),
            "vip_text": vip_clean,
            "Vipname": vip_clean,
            "Insurancecar": int(m.get("Insurancecar") or 0),
            "base_value": int(m.get("BaseValue") or 0),
        })

    my_cars = []
    if viewer:
        raw_my = query_safe(
            db,
            "SELECT ID, Model, Description, KM, days, Value, License, Vip, ColorOne, ColorTwo "
            "FROM cars WHERE Owner=%s AND Owned<>0 ORDER BY ID ASC",
            (viewer["name"],),
        )
        for mc in raw_my:
            cid = int(mc["ID"])
            mdl = int(mc.get("Model") or 411)
            my_cars.append({
                "ID": cid,
                "Model": mdl,
                "ModelName": VEHICLE_NAMES.get(mdl, mc.get("Description") or f"Vehicul #{mdl}"),
                "KM": round(float(mc.get("KM") or 0), 1),
                "Days": int(mc.get("days") or 0),
                "Value": int(mc.get("Value") or 0),
                "License": mc.get("License") or "LS-01",
                "Vip": int(mc.get("Vip") or 0) > 0,
                "AlreadyListed": cid in active_car_ids,
            })

    return {
        "houses": houses,
        "businesses": bizz,
        "dealership": stock,
        "market_listings": market_listings,
        "my_cars": my_cars,
        "auctions": auctions,
        "trades": trades,
        "biz_shares": shares,
    }


def get_leaderboards(db) -> dict:
    factions_rows = query(db, "SELECT ID, Name FROM factions")
    fmap = {int(f["ID"]): f for f in factions_rows}

    def enrich(rows):
        out = []
        for r in rows:
            mem = int(r.get("Member", 0) or r.get("Leader", 0) or 0)
            r["FactionTag"] = FACTION_META.get(mem, {"tag": "CIVIL"})["tag"]
            r["FactionColor"] = FACTION_META.get(mem, {"color": "#94a3b8"})["color"]
            r["FactionName"] = fmap.get(mem, {}).get("Name", "Civilian")
            out.append(r)
        return out

    cols = "id, name, Level, Respect, ConnectedTime, OnlineThisWeek, Money, Bank, (Money + Bank) AS TotalWealth, " \
           "PaintKills, PaintDeath, RacePoints, RaceExp, Rob, Kills, Deaths, Admin, Helper, Commands, HelpedPlayers, " \
           "Member, Leader, Status, Model, VIP, Legend"

    return {
        "level": enrich(query(db, f"SELECT {cols} FROM users ORDER BY Level DESC, Respect DESC, ConnectedTime DESC LIMIT 25")),
        "hours": enrich(query(db, f"SELECT {cols} FROM users ORDER BY ConnectedTime DESC, OnlineThisWeek DESC LIMIT 25")),
        "wealth": enrich(query(db, f"SELECT {cols} FROM users ORDER BY (Money + Bank) DESC LIMIT 25")),
        "paintball": enrich(query(db, f"SELECT {cols} FROM users ORDER BY PaintKills DESC, Level DESC LIMIT 25")),
        "race": enrich(query(db, f"SELECT {cols} FROM users ORDER BY RacePoints DESC, RaceExp DESC LIMIT 25")),
        "robbers": enrich(query(db, f"SELECT {cols} FROM users ORDER BY Rob DESC, Crimes DESC LIMIT 25")),
        "admins": enrich(query(db, f"SELECT {cols} FROM users WHERE Admin>0 ORDER BY Commands DESC, Admin DESC LIMIT 25")),
        "helpers": enrich(query(db, f"SELECT {cols} FROM users WHERE Helper>0 ORDER BY HelpedPlayers DESC, Helper DESC LIMIT 25")),
    }


# ==============================================================================
# MUTATION HANDLERS (ALL UCP ACTIONS & LIVE IN-GAME SYNC)
# ==============================================================================
def execute_sanction(db, admin_user: dict, data: dict) -> dict:
    action = require_int(data, "action", 1, 10)
    if action not in PANEL_ACTIONS_MAP:
        raise APIError(400, "Tip de acțiune invalid.")
    meta = PANEL_ACTIONS_MAP[action]
    if int(admin_user.get("Admin", 0)) < meta["min_admin"]:
        raise APIError(403, f"Această acțiune necesită Admin Level minimum {meta['min_admin']}.")

    target_name = require_text(data, "player", 2, 30)
    reason = require_text(data, "reason", 2, 60)
    duration = require_int(data, "duration", 0, 100000000, default=0)
    complaint_id = require_int(data, "complaintid", 0, 2147483647, default=0)
    dm_suspend = require_int(data, "dm", 0, 100, default=0)

    if action == 1 and not (1 <= duration <= 365):
        raise APIError(400, "Durata banului temporar trebuie să fie între 1 și 365 zile.")
    if action in (3, 5) and not (1 <= duration <= 1440):
        raise APIError(400, "Durata pentru Jail / Mute trebuie să fie între 1 și 1440 minute.")
    if action == 6 and not (1 <= duration <= 100000000):
        raise APIError(400, "Suma de bani trebuie să fie între $1 și $100,000,000.")
    if action == 7 and not (1 <= duration <= 50000):
        raise APIError(400, "Punctele Premium trebuie să fie între 1 și 50,000 PP.")
    if action == 8 and not (0 <= duration <= 6):
        raise APIError(400, "Admin Level trebuie să fie între 0 și 6.")
    if action == 9 and not (0 <= duration <= 3):
        raise APIError(400, "Helper Level trebuie să fie între 0 și 3.")

    target = query(db, "SELECT * FROM users WHERE name=%s FOR UPDATE", (target_name,), one=True)
    if not target:
        raise APIError(404, "Jucătorul specificat nu există în baza de date.")

    is_reward_or_role = action in (6, 7, 8, 9)
    if not is_reward_or_role:
        if int(target["id"]) == int(admin_user["id"]):
            raise APIError(403, "Nu te poți sancționa singur din panel.")
        if int(target.get("Admin", 0)) >= int(admin_user.get("Admin", 0)) and int(admin_user.get("Admin", 0)) < 6:
            raise APIError(403, "Nu poți sancționa un administrator cu grad egal sau superior.")

    online = int(target.get("Status", 0)) == 1
    now = int(time.time())
    warn_autobanned = False

    if action == 10 and not online:
        raise APIError(409, "Jucătorul este offline; comanda Kick se aplică doar jucătorilor conectați în joc.")

    # Persist directly in DB tables
    if action in (1, 2):
        existing_ban = query(
            db,
            "SELECT ID FROM bans WHERE PlayerName=%s AND Active=1 AND (Permanent=1 OR Time>%s) LIMIT 1",
            (target["name"], now),
            one=True,
        )
        if existing_ban:
            raise APIError(409, "Acest jucător are deja un ban activ în lista de banuri.")
        days = duration if action == 1 else 0
        insert(
            db,
            "bans",
            {
                "PlayerName": target["name"],
                "AdminName": admin_user["name"],
                "Reason": reason if complaint_id == 0 else f"{reason} [complaint:{complaint_id}]",
                "IP": target.get("IP", "0") or "0",
                "Days": days,
                "IPBan": 0,
                "Permanent": 1 if action == 2 else 0,
                "Time": (now + days * 86400) if action == 1 else 0,
                "Active": 1,
            },
        )
    elif action == 3:
        write(
            db,
            "UPDATE users SET Jailed=2, JailTime=%s, WantedLevel=0 WHERE id=%s",
            (duration * 60, int(target["id"])),
        )
    elif action == 4:
        new_warns = int(target.get("Warnings", 0)) + 1
        if not online and new_warns >= 3:
            warn_autobanned = True
            write(db, "UPDATE users SET Warnings=0 WHERE id=%s", (int(target["id"]),))
            insert(
                db,
                "bans",
                {
                    "PlayerName": target["name"],
                    "AdminName": "AdmBot",
                    "Reason": "3/3 warns",
                    "IP": target.get("IP", "0") or "0",
                    "Days": 3,
                    "IPBan": 0,
                    "Permanent": 0,
                    "Time": now + 3 * 86400,
                    "Active": 1,
                },
            )
        else:
            write(db, "UPDATE users SET Warnings=%s WHERE id=%s", (new_warns, int(target["id"])))
    elif action == 5:
        write(
            db,
            "UPDATE users SET Muted=1, MuteTime=%s WHERE id=%s",
            (duration * 60, int(target["id"])),
        )
    elif action == 6 and not online:
        write(db, "UPDATE users SET Money=Money+%s WHERE id=%s", (duration, int(target["id"])))
    elif action == 7 and not online:
        write(db, "UPDATE users SET PremiumPoints=PremiumPoints+%s WHERE id=%s", (duration, int(target["id"])))
    elif action == 8:
        write(db, "UPDATE users SET Admin=%s WHERE id=%s", (duration, int(target["id"])))
    elif action == 9:
        write(db, "UPDATE users SET Helper=%s WHERE id=%s", (duration, int(target["id"])))

    queued_id = None
    if online:
        queued_id = insert(
            db,
            "panelactions",
            {
                "actionid": action,
                "actiontime": duration,
                "complaintid": complaint_id,
                "playerid": int(target["id"]),
                "giverid": int(admin_user["id"]),
                "playername": target["name"],
                "givername": admin_user["name"],
                "reason": reason,
                "dm": dm_suspend,
            },
        )
    else:
        plog_id = meta["punishlog_id"]
        if plog_id > 0:
            insert(
                db,
                "punishlogs",
                {
                    "playerid": int(target["id"]),
                    "giverid": int(admin_user["id"]),
                    "playername": target["name"],
                    "givername": admin_user["name"],
                    "complaintid": complaint_id,
                    "actionid": plog_id,
                    "actiontime": duration,
                    "reason": reason if complaint_id == 0 else f"{reason} [complaint:{complaint_id}]",
                },
            )
        if warn_autobanned:
            insert(
                db,
                "punishlogs",
                {
                    "playerid": int(target["id"]),
                    "giverid": 0,
                    "playername": target["name"],
                    "givername": "AdmBot",
                    "complaintid": complaint_id,
                    "actionid": 1,
                    "actiontime": 3,
                    "reason": "3/3 warns",
                },
            )

    notify_player_email(
        db,
        int(target["id"]),
        int(admin_user["id"]),
        f"[UCP] Admin {admin_user['name']} a executat '{meta['name']}' pe contul tau. Motiv: {reason}",
        "#profile",
    )
    audit_log(db, admin_user, f"{meta['name']} pe {target['name']} (durata/val: {duration}, motiv: {reason})")
    return {
        "queued": online,
        "queue_id": queued_id,
        "message": (
            f"Acțiunea '{meta['name']}' pentru {target['name']} a fost salvată și trimisă în coada live a serverului (panelactions #{queued_id})."
            if online
            else f"Acțiunea '{meta['name']}' pentru {target['name']} a fost aplicată direct în baza de date (jucător offline)."
        ),
    }


def handle_post_mutation(db, user: dict, path: str, data: dict, session_info: dict, current_token: str) -> dict:
    # 1. FACTION APPLICATION CREATE
    if path == "/api/applications/create":
        fid = require_int(data, "factionid", 1, 14)
        f = query(db, "SELECT * FROM factions WHERE ID=%s FOR UPDATE", (fid,), one=True)
        if not f or int(f.get("Application", 0)) != 1:
            raise APIError(409, "Aplicațiile pentru această facțiune sunt închise în acest moment.")
        if int(user.get("Level", 0)) < int(f.get("MinLevel", 5)):
            raise APIError(409, f"Ai nevoie de minim Level {f.get('MinLevel', 5)} pentru a aplica la {f.get('Name')}.")
        if int(user.get("Member", 0)) > 0 or int(user.get("Leader", 0)) > 0:
            raise APIError(409, "Faci deja parte dintr-o facțiune. Părăsește facțiunea actuală înainte de a aplica.")
        if int(user.get("FPunish", 0)) > 0:
            raise APIError(409, f"Nu poți aplica cât timp ai Faction Punish ({user.get('FPunish')}/20 FP).")
        existing = query(db, "SELECT id FROM aplications WHERE playerid=%s AND status=0 LIMIT 1", (int(user["id"]),), one=True)
        if existing:
            raise APIError(409, "Ai deja o aplicație în așteptare. Așteaptă răspunsul liderului.")

        answers = data.get("answers", [])
        if not isinstance(answers, list):
            raise APIError(400, "Formatul răspunsurilor este invalid.")
        row_vals = {
            "name": user["name"],
            "status": 0,
            "factionid": fid,
            "playerid": int(user["id"]),
            "actionby": "Fara",
        }
        for i in range(1, 16):
            q_text = (f.get(f"q{i}", "") or "").strip()
            ans_text = (answers[i - 1] if i - 1 < len(answers) and isinstance(answers[i - 1], str) else "").strip()
            if q_text and len(ans_text) < 2:
                raise APIError(400, f"Te rugăm să completezi răspunsul la întrebarea #{i}.")
            waf_inspect_payload(ans_text, f"r{i}")
            row_vals[f"q{i}"] = legacy_text(q_text)[:128]
            row_vals[f"r{i}"] = legacy_text(ans_text)[:250]

        app_id = insert(db, "aplications", row_vals)
        audit_log(db, user, f"Aplicație #{app_id} depusă la {f.get('Name')}")
        return {"id": app_id, "message": f"Aplicația ta (#{app_id}) la {f.get('Name')} a fost înregistrată cu succes!"}

    # 2. FACTION APPLICATION REVIEW (LEADER / CO-LEADER / ADMIN)
    if path == "/api/applications/review":
        app_id = require_int(data, "id", 1, 2147483647)
        new_status = require_int(data, "status", 1, 3)  # 1: Acceptat pt teste, 2: Acceptat final, 3: Respins
        reason = require_text(data, "reason", 0, 120) if data.get("reason") else ""
        app = query(db, "SELECT * FROM aplications WHERE id=%s FOR UPDATE", (app_id,), one=True)
        if not app:
            raise APIError(404, "Aplicația nu există.")
        fid = int(app["factionid"])
        if not can_manage_faction(user, fid):
            raise APIError(403, "Doar Liderul, Co-Liderul (Rank 6+) sau Managerul de Lideri poate procesa aplicațiile acestei facțiuni.")
        f = query(db, "SELECT Name FROM factions WHERE ID=%s", (fid,), one=True)
        fname = f["Name"] if f else f"Facțiunea #{fid}"
        status_labels = {1: "Acceptată pentru Teste", 2: "Acceptată", 3: "Respinsă"}
        action_by = f"{user['name']}" + (f" ({reason})" if reason else "")
        write(db, "UPDATE aplications SET status=%s, actionby=%s WHERE id=%s", (new_status, legacy_text(action_by)[:50], app_id))
        notify_player_email(
            db,
            int(app["playerid"]),
            int(user["id"]),
            f"[Facțiune] Aplicația ta #{app_id} la {fname} a fost {status_labels[new_status]} de către {user['name']}.",
            "#factions",
        )
        audit_log(db, user, f"Aplicație #{app_id} ({app['name']}) -> {status_labels[new_status]}")
        return {"message": f"Aplicația #{app_id} a lui {app['name']} a fost marcată: {status_labels[new_status]}."}

    # 2B. LEADER APPLICATIONS (CREATE / TOGGLE / REVIEW + AUTO PROMOTE)
    if path == "/api/leader-applications/create":
        fid = require_int(data, "factionid", 1, 14)
        f = query(db, "SELECT * FROM factions WHERE ID=%s", (fid,), one=True)
        if not f:
            raise APIError(404, "Facțiunea selectată nu există.")
        leader_row = query(db, "SELECT name FROM users WHERE Leader=%s LIMIT 1", (fid,), one=True)
        scfg = query_safe(db, "SELECT * FROM ucp_leader_app_settings WHERE factionid=%s", (fid,), one=True)
        is_open = (int(scfg["open"]) == 1) if scfg is not None else (leader_row is None)
        min_lvl = int(scfg["min_level"]) if scfg is not None else max(10, int(f.get("MinLevel", 5)))
        min_hrs = int(scfg["min_hours"]) if scfg is not None else 20
        if not is_open:
            raise APIError(409, f"Aplicațiile pentru funcția de Lider la {f.get('Name')} sunt închise.")
        if int(user.get("Leader", 0)) > 0:
            raise APIError(409, "Ești deja Liderul unei facțiuni active.")
        if int(user.get("Level", 0)) < min_lvl:
            raise APIError(409, f"Ai nevoie de minim Level {min_lvl} pentru a aplica la funcția de Lider.")
        if float(user.get("ConnectedTime", 0) or 0) < min_hrs and not is_admin(user, 4):
            raise APIError(409, f"Ai nevoie de minim {min_hrs} ore jucate pentru a aplica la funcția de Lider.")
        if int(user.get("FPunish", 0)) > 0:
            raise APIError(409, f"Nu poți aplica pentru Lider cât timp ai Faction Punish ({user.get('FPunish')}/20 FP).")
        existing = query_safe(
            db,
            "SELECT id FROM ucp_leader_applications WHERE playerid=%s AND status=0 LIMIT 1",
            (int(user["id"]),),
            one=True,
        )
        if existing:
            raise APIError(409, "Ai deja o aplicație de Lider în așteptare. Așteaptă decizia echipei Manager Lideri.")

        real_name = require_text(data, "real_name", 2, 60)
        age = require_int(data, "age", 12, 80)
        activity = require_text(data, "activity", 2, 120)
        experience = require_text(data, "experience", 10, 1500)
        plan = require_text(data, "plan", 15, 2000)

        lid = insert(
            db,
            "ucp_leader_applications",
            {
                "factionid": fid,
                "playerid": int(user["id"]),
                "playername": user["name"],
                "real_name": real_name,
                "age": age,
                "experience": experience,
                "activity": activity,
                "plan": plan,
                "status": 0,
                "reviewed_by": "",
                "review_note": "",
            },
        )
        audit_log(db, user, f"Aplicație Lider #{lid} depusă pentru {f.get('Name')}")
        return {"id": lid, "message": f"Aplicația ta pentru funcția de Lider la {f.get('Name')} (#{lid}) a fost trimisă cu succes!"}

    if path == "/api/leader-applications/toggle":
        if not can_manage_leaders(user):
            raise APIError(403, "Doar Adminii Level 4+ sau Managerii de Lideri pot deschide/închide aplicațiile de Lider.")
        fid = require_int(data, "factionid", 1, 14)
        is_open = 1 if bool(data.get("open", True)) else 0
        min_lvl = require_int(data, "min_level", 1, 50, default=10)
        min_hrs = require_int(data, "min_hours", 0, 5000, default=20)
        write(
            db,
            "INSERT INTO ucp_leader_app_settings (factionid, open, min_level, min_hours, updated_by) "
            "VALUES (%s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE open=VALUES(open), min_level=VALUES(min_level), min_hours=VALUES(min_hours), updated_by=VALUES(updated_by)",
            (fid, is_open, min_lvl, min_hrs, user["name"]),
        )
        f_row = query(db, "SELECT Name FROM factions WHERE ID=%s", (fid,), one=True)
        fname = f_row["Name"] if f_row else f"Facțiunea #{fid}"
        audit_log(db, user, f"Aplicații Lider {fname}: {'DESCHISE' if is_open else 'ÎNCHISE'} (MinLvl {min_lvl}, MinOre {min_hrs})")
        return {"message": f"Aplicațiile de Lider pentru {fname} sunt acum {'DESCHISE' if is_open else 'ÎNCHISE'} (Min. Level {min_lvl}, {min_hrs}h)."}

    if path == "/api/leader-applications/review":
        if not can_manage_leaders(user):
            raise APIError(403, "Doar Adminii Level 4+ sau Managerii de Lideri pot procesa aplicațiile de Lider.")
        app_id = require_int(data, "id", 1, 2147483647)
        new_status = require_int(data, "status", 1, 3)  # 1: Interviu, 2: Aprobat & Set Leader, 3: Respins
        note = require_text(data, "note", 0, 240) if data.get("note") else ""
        app = query(db, "SELECT * FROM ucp_leader_applications WHERE id=%s FOR UPDATE", (app_id,), one=True)
        if not app:
            raise APIError(404, "Aplicația de Lider nu există.")
        fid = int(app["factionid"])
        f_row = query(db, "SELECT Name FROM factions WHERE ID=%s", (fid,), one=True)
        fname = f_row["Name"] if f_row else f"Facțiunea #{fid}"
        status_labels = {1: "Acceptată pentru Interviu / Teste", 2: "Aprobată (Numit Lider)", 3: "Respinsă"}

        write(
            db,
            "UPDATE ucp_leader_applications SET status=%s, reviewed_by=%s, review_note=%s WHERE id=%s",
            (new_status, user["name"], note, app_id),
        )

        extra_msg = ""
        if new_status == 2:
            target = query(db, "SELECT * FROM users WHERE id=%s FOR UPDATE", (int(app["playerid"]),), one=True)
            if not target:
                raise APIError(404, "Contul aplicantului nu mai există în baza de date.")
            res_ldr = apply_set_leader(db, user, target, fid, f"Aplicatie Lider #{app_id} aprobata")
            write(
                db,
                "INSERT INTO ucp_leader_app_settings (factionid, open, min_level, min_hours, updated_by) "
                "VALUES (%s, 0, 10, 20, %s) ON DUPLICATE KEY UPDATE open=0, updated_by=VALUES(updated_by)",
                (fid, user["name"]),
            )
            extra_msg = " " + res_ldr["message"]
        else:
            notify_player_email(
                db,
                int(app["playerid"]),
                int(user["id"]),
                f"[Aplicație Lider] Aplicația ta #{app_id} pentru {fname} a fost {status_labels[new_status]} de {user['name']}"
                + (f" ({note})." if note else "."),
                "#factions",
            )
            audit_log(db, user, f"Aplicație Lider #{app_id} ({app['playername']} -> {fname}): {status_labels[new_status]}")

        return {"message": f"Aplicația de Lider #{app_id} ({app['playername']}) -> {status_labels[new_status]}.{extra_msg}"}

    # 3. LEADER CONTROL PANEL: SETTINGS (MOTD, MinLevel, Recruitment Toggle, Ranks, Questions)
    if path == "/api/leader/settings":
        fid = require_int(data, "factionid", 1, 14)
        if not can_manage_faction(user, fid):
            raise APIError(403, "Nu ai permisiunea de a modifica setările acestei facțiuni.")
        min_level = require_int(data, "MinLevel", 1, 50)
        app_open = 1 if data.get("Application") else 0
        anunt = require_text(data, "Anunt", 1, 125)
        ranks = data.get("Ranks", {})
        questions = data.get("Questions", [])

        updates_sql = ["MinLevel=%s", "Application=%s", "Anunt=%s"]
        sql_args = [min_level, app_open, anunt]
        if isinstance(ranks, dict):
            for i in range(1, 8):
                r_val = ranks.get(str(i))
                if isinstance(r_val, str) and 1 <= len(r_val.strip()) <= 60:
                    updates_sql.append(f"Rank{i}=%s")
                    sql_args.append(legacy_text(r_val.strip()))
        if isinstance(questions, list):
            for i in range(1, 16):
                q_val = questions[i - 1] if i - 1 < len(questions) and isinstance(questions[i - 1], str) else ""
                updates_sql.append(f"q{i}=%s")
                sql_args.append(legacy_text(q_val.strip())[:128])

        sql_args.append(fid)
        write(db, f"UPDATE factions SET {', '.join(updates_sql)} WHERE ID=%s", tuple(sql_args))
        audit_log(db, user, f"Actualizat setări facțiune #{fid} (Recrutare: {'ON' if app_open else 'OFF'}, MinLvl: {min_level})")
        return {"message": "Setările facțiunii, rank-urile și chestionarul de recrutare au fost salvate!"}

    # 4. LEADER CONTROL PANEL: MEMBER MANAGEMENT (Rank, FWarn, Reset Raport, Uninvite)
    if path == "/api/leader/member":
        fid = require_int(data, "factionid", 1, 14)
        if not can_manage_faction(user, fid):
            raise APIError(403, "Nu ai acces la panoul de conducere al acestei facțiuni.")
        target_id = require_int(data, "playerid", 1, 2147483647)
        op = require_text(data, "operation", 2, 30)
        target = query(db, "SELECT * FROM users WHERE id=%s FOR UPDATE", (target_id,), one=True)
        if not target or (int(target.get("Member", 0)) != fid and int(target.get("Leader", 0)) != fid):
            raise APIError(404, "Jucătorul nu este membru al acestei facțiuni.")
        if int(target["id"]) == int(user["id"]) and not is_admin(user, 4):
            raise APIError(403, "Nu poți executa această acțiune asupra propriului cont.")
        if int(target.get("Status", 0)) == 1 and op in ("uninvite", "rank", "fwarn_add", "fwarn_clear"):
            raise APIError(409, "Jucătorul este conectat în joc. Pentru membrii online folosește comenzile din joc (/giverank, /fwarn, /uninvite) ca să nu fie suprascrisă starea la deconectare.")

        f = query(db, "SELECT Name FROM factions WHERE ID=%s", (fid,), one=True)
        fname = f["Name"] if f else f"Facțiunea #{fid}"

        if op == "rank":
            new_rank = require_int(data, "rank", 1, 6)
            write(db, "UPDATE users SET Rank=%s WHERE id=%s", (new_rank, target_id))
            log_txt = f"{user['name']} i-a schimbat rank-ul lui {target['name']} la Rank {new_rank} (din UCP)."
        elif op == "fwarn_add":
            reason = require_text(data, "reason", 2, 80)
            fw = min(3, int(target.get("FWarn", 0)) + 1)
            write(db, "UPDATE users SET FWarn=%s WHERE id=%s", (fw, target_id))
            log_txt = f"{target['name']} a primit Faction Warn ({fw}/3) de la {user['name']}, motiv: {reason}"
        elif op == "fwarn_clear":
            fw = max(0, int(target.get("FWarn", 0)) - 1)
            write(db, "UPDATE users SET FWarn=%s WHERE id=%s", (fw, target_id))
            log_txt = f"{user['name']} i-a șters un Faction Warn lui {target['name']} ({fw}/3)."
        elif op == "reset_raport":
            write(
                db,
                "UPDATE users SET FWorks=0, Commands=0, Arrested=0, Lconf=0, Mdep=0, Frisks=0, Matsdep=0, Drugsdep=0, Lives=0, Tickets=0 WHERE id=%s",
                (target_id,),
            )
            log_txt = f"{user['name']} a resetat raportul de activitate al lui {target['name']}."
        elif op == "uninvite":
            fp = require_int(data, "fpunish", 0, 60, default=0)
            reason = require_text(data, "reason", 2, 80)
            days = int(target.get("FactionTime", 0))
            write(
                db,
                "UPDATE users SET Member=0, Leader=0, Rank=0, FWarn=0, FPunish=%s, FactionTime=0, FWorks=0, Model=170 WHERE id=%s",
                (fp, target_id),
            )
            log_txt = f"{target['name']} a fost demis de {user['name']} din {fname} după {days} zile (FP: {fp}), motiv: {reason}."
            insert(db, "faction_logs", {"player": target_id, "leader": int(user["id"]), "Text": legacy_text(log_txt)})
        else:
            raise APIError(400, "Operațiune necunoscută.")

        insert(db, "factionlog", {"factionid": fid, "player": target["name"], "leader": int(user["id"]), "action": legacy_text(log_txt)})
        notify_player_email(db, target_id, int(user["id"]), f"[Facțiune] {log_txt}", "#factions")
        audit_log(db, user, log_txt)
        return {"message": log_txt}

    if path == "/api/leader/reset-all-raport":
        fid = require_int(data, "factionid", 1, 14)
        if not can_manage_faction(user, fid):
            raise APIError(403, "Doar Liderul, Co-Liderul sau un Admin poate reseta raportul săptămânal al facțiunii.")
        f = query(db, "SELECT Name FROM factions WHERE ID=%s", (fid,), one=True)
        fname = f["Name"] if f else f"Facțiunea #{fid}"
        write(
            db,
            "UPDATE users SET FWorks=0, Commands=0, Arrested=0, Lconf=0, Mdep=0, Frisks=0, Matsdep=0, Drugsdep=0, Lives=0, Tickets=0 "
            "WHERE Member=%s OR Leader=%s",
            (fid, fid),
        )
        log_txt = f"{user['name']} a resetat raportul săptămânal pentru toți membrii din {fname}."
        insert(db, "factionlog", {"factionid": fid, "player": user["name"], "leader": int(user["id"]), "action": legacy_text(log_txt)})
        audit_log(db, user, log_txt)
        return {"message": log_txt}

    # 5. CLAN MANAGEMENT
    if path == "/api/clan/manage":
        cid = require_int(data, "clanID", 1, 99999)
        clan = query(db, "SELECT * FROM clans WHERE clanID=%s", (cid,), one=True)
        if not clan:
            raise APIError(404, "Clanul nu există.")
        is_owner = int(user.get("Clan", 0)) == cid and int(user.get("CRank", 0)) >= 6
        if not (is_owner or is_admin(user, 5)):
            raise APIError(403, "Doar Ownerul clanului (Rank 6-7) sau un Admin 5+ poate modifica setările clanului.")
        motd = require_text(data, "clanMOTD", 1, 120)
        color = require_text(data, "clanColor", 6, 6).upper()
        if not re.fullmatch(r"[0-9A-F]{6}", color):
            raise APIError(400, "Culoarea clanului trebuie să fie un cod HEX din 6 caractere (ex: FFCC99).")
        desc = require_text(data, "clanDescription", 1, 500)
        write(db, "UPDATE clans SET clanMOTD=%s, clanColor=%s, clanDescription=%s WHERE clanID=%s", (motd, color, desc, cid))
        insert(db, "clan_logs", {"clanid": cid, "action": legacy_text(f"{user['name']} a actualizat setările clanului din UCP.")})
        audit_log(db, user, f"Actualizat setări clan #{cid} ({clan.get('clanName')})")
        return {"message": "Setările clanului au fost salvate cu succes!"}

    # 6. PROPERTY & VEHICLE MANAGEMENT (HOUSE / BUSINESS / PERSONAL CAR)
    if path == "/api/property/manage":
        kind = require_text(data, "kind", 3, 15)
        item_id = require_int(data, "id", 1, 2147483647)
        if int(user.get("Status", 0)) == 1 and not is_admin(user, 6):
            raise APIError(409, "Ieși din joc înainte de a modifica proprietățile din UCP, pentru ca serverul să nu suprascrie valorile din memoria RAM.")

        if kind == "house":
            h = query(db, "SELECT * FROM houses WHERE ID=%s FOR UPDATE", (item_id,), one=True)
            if not h or (h.get("Owner") != user["name"] and not is_admin(user, 5)):
                raise APIError(403, "Nu ești proprietarul acestei case.")
            desc = require_text(data, "description", 1, 45)
            rent = require_int(data, "rent", 1, 100000)
            rentabil = 1 if data.get("rentabil") else 0
            locked = 1 if data.get("locked") else 0
            write(db, "UPDATE houses SET Discription=%s, Rent=%s, Rentabil=%s, Lockk=%s WHERE ID=%s", (desc, rent, rentabil, locked, item_id))
            audit_log(db, user, f"Actualizat Casa #{item_id} (Chirie: ${rent}, Lock: {locked})")
            return {"message": f"Setările Casei #{item_id} au fost actualizate în baza de date!"}

        if kind == "bizz":
            b = query(db, "SELECT * FROM bizz WHERE ID=%s FOR UPDATE", (item_id,), one=True)
            if not b or (b.get("Owner") != user["name"] and not is_admin(user, 5)):
                raise APIError(403, "Nu ești proprietarul acestei afaceri.")
            msg = require_text(data, "message", 1, 45)
            fee = require_int(data, "fee", 1, 50000)
            locked = 1 if data.get("locked") else 0
            write(db, "UPDATE bizz SET Message=%s, EntranceCost=%s, Locked=%s WHERE ID=%s", (msg, fee, locked, item_id))
            audit_log(db, user, f"Actualizat Business #{item_id} (Intrare: ${fee}, Lock: {locked})")
            return {"message": f"Setările Afacerii #{item_id} au fost actualizate!"}

        if kind == "car_unstuck":
            c = query(db, "SELECT * FROM cars WHERE ID=%s FOR UPDATE", (item_id,), one=True)
            if not c or (c.get("Owner") != user["name"] and not is_admin(user, 5)):
                raise APIError(403, "Acest vehicul nu îți aparține.")
            # Safe Commerce/Pershing Square parking spot in LS
            write(db, "UPDATE cars SET Locationx=1481.2, Locationy=-1730.5, Locationz=13.5, Angle=180.0, Lockk=1 WHERE ID=%s", (item_id,))
            audit_log(db, user, f"Deblocat/Tractat vehicul #{item_id} la Primaria LS")
            return {"message": f"Vehiculul #{item_id} a fost relocat în siguranță în parcarea Primăriei Los Santos și încuiat!"}

        raise APIError(400, "Tip proprietate necunoscut.")

    # 7. COMPLAINTS (CREATE / REPLY / STATUS & DIRECT SANCTION)
    if path == "/api/complaints/create":
        target_name = require_text(data, "player", 2, 30)
        cat = require_int(data, "category", 0, 6)
        evidence = require_text(data, "evidence", 5, 1500)
        details = require_text(data, "details", 10, 2000)
        subject = query(db, "SELECT id, name, Member, Leader FROM users WHERE name=%s", (target_name,), one=True)
        if not subject:
            raise APIError(404, "Jucătorul reclamat nu există în baza de date.")
        if subject["name"].lower() == user["name"].lower():
            raise APIError(400, "Nu poți deschide o reclamație împotriva propriului cont.")
        cid = insert(
            db,
            "complaints",
            {
                "playername": subject["name"],
                "createdby": user["name"],
                "status": 0,
                "reasoncomplaint": cat,
                "evidence": evidence,
                "details": details,
                "ip": session_info.get("ip", "127.0.0.1"),
                "factionid": int(subject.get("Member", 0) or subject.get("Leader", 0) or 0),
            },
        )
        notify_player_email(
            db,
            int(subject["id"]),
            int(user["id"]),
            f"[Reclamație] {user['name']} a deschis reclamația #{cid} împotriva ta ({COMPLAINT_CATEGORIES.get(cat, 'General')}).",
            "#complaints",
        )
        audit_log(db, user, f"Reclamație #{cid} creată împotriva lui {subject['name']}")
        return {"id": cid, "message": f"Reclamația #{cid} împotriva lui {subject['name']} a fost publicată!"}

    if path == "/api/complaints/reply":
        cid = require_int(data, "id", 1, 2147483647)
        text = require_text(data, "text", 2, 1500)
        c = query(db, "SELECT * FROM complaints WHERE id=%s", (cid,), one=True)
        if not c:
            raise APIError(404, "Reclamația nu există.")
        can_access = is_staff(user) or user["name"] in (c["createdby"], c["playername"]) or can_manage_faction(user, int(c.get("factionid", 0)))
        if not can_access:
            raise APIError(403, "Nu ai permisiunea de a răspunde la această reclamație.")
        if int(c.get("status", 0)) != 0 and not is_staff(user):
            raise APIError(409, "Reclamația este deja închisă.")
        insert(db, "reply_complaints", {"idd": cid, "user": user["name"], "text": text})
        audit_log(db, user, f"Răspuns la reclamația #{cid}")
        return {"message": "Răspunsul a fost adăugat la reclamație."}

    if path == "/api/complaints/resolve":
        cid = require_int(data, "id", 1, 2147483647)
        new_status = require_int(data, "status", 0, 1)
        c = query(db, "SELECT * FROM complaints WHERE id=%s FOR UPDATE", (cid,), one=True)
        if not c:
            raise APIError(404, "Reclamația nu există.")
        if not (is_admin(user, 1) or can_manage_faction(user, int(c.get("factionid", 0)))):
            raise APIError(403, "Doar Adminii sau Liderul facțiunii vizate pot închide/redeschide reclamația.")
        write(db, "UPDATE complaints SET status=%s WHERE id=%s", (new_status, cid))
        verdict = (data.get("verdict") or "").strip()
        if verdict:
            insert(db, "reply_complaints", {"idd": cid, "user": user["name"], "text": legacy_text(f"[VERDICT] {verdict}")[:1500]})
        sanction_msg = ""
        if data.get("apply_sanction") and int(data.get("sanction_action", 0)) > 0:
            res = execute_sanction(
                db,
                user,
                {
                    "action": int(data["sanction_action"]),
                    "player": c["playername"],
                    "reason": data.get("sanction_reason") or f"Reclamatie #{cid}",
                    "duration": int(data.get("sanction_duration", 0)),
                    "complaintid": cid,
                    "dm": int(data.get("sanction_dm", 0)),
                },
            )
            sanction_msg = " " + res["message"]
        audit_log(db, user, f"Reclamație #{cid} -> {'Închisă' if new_status == 1 else 'Redeschisă'}")
        return {"message": f"Reclamația #{cid} a fost {'închisă' if new_status == 1 else 'redeschisă'}.{sanction_msg}"}

    # 7B. PIAȚA AUTO ONLINE (UCP VEHICLE MARKETPLACE & AUCTIONS)
    if path == "/api/market/list":
        car_id = require_int(data, "car_id", 1, 2147483647)
        buyout = require_int(data, "buyout_price", 50000, 500000000)
        min_bid = require_int(data, "min_bid", 10000, buyout)
        hours = require_int(data, "hours", 12, 168, default=48)
        note = require_text(data, "note", 3, 115) if data.get("note") else "Disponibil în Piața Auto UCP (Buyout sau Licitație)"

        car = query(db, "SELECT * FROM cars WHERE ID=%s FOR UPDATE", (car_id,), one=True)
        if not car or int(car.get("Owned", 0)) == 0 or car.get("Owner") != user["name"]:
            raise APIError(403, "Acest vehicul nu îți aparține.")
        already = query(db, "SELECT id FROM ucp_car_market WHERE car_id=%s AND status=0 LIMIT 1", (car_id,), one=True)
        if already:
            raise APIError(409, "Acest vehicul este deja listat în Piața Auto Online.")

        now_ts = int(time.time())
        mdl = int(car.get("Model") or 411)
        mname = VEHICLE_NAMES.get(mdl, f"Vehicul #{mdl}")
        lid = insert(
            db,
            "ucp_car_market",
            {
                "car_id": car_id,
                "seller_sqlid": int(user["id"]),
                "seller_name": user["name"],
                "model": mdl,
                "buyout_price": buyout,
                "min_bid": min_bid,
                "current_bid": 0,
                "high_bidder_sqlid": 0,
                "high_bidder_name": "",
                "seller_note": note,
                "status": 0,
                "buyer_name": "",
                "created_at": now_ts,
                "expires_at": now_ts + (hours * 3600),
            },
        )
        audit_log(db, user, f"Listat {mname} (#{car_id}) în Piața Auto UCP (Buyout: ${buyout:,}, Start: ${min_bid:,})")
        return {"id": lid, "message": f"Vehiculul {mname} (#{car_id}) a fost publicat în Piața Auto Online!"}

    if path == "/api/market/buy":
        listing_id = require_int(data, "id", 1, 2147483647)
        if int(user.get("Status", 0)) == 1 and not is_admin(user, 6):
            raise APIError(409, "Ieși din joc înainte de a cumpăra un vehicul din Piața Auto UCP, pentru sincronizare sigură cu contul bancar.")
        listing = query(db, "SELECT * FROM ucp_car_market WHERE id=%s FOR UPDATE", (listing_id,), one=True)
        if not listing or int(listing.get("status", 0)) != 0:
            raise APIError(404, "Acest anunț auto nu mai este activ.")
        if listing["seller_name"].lower() == user["name"].lower():
            raise APIError(400, "Nu îți poți cumpăra propriul vehicul.")

        car_id = int(listing["car_id"])
        car = query(db, "SELECT * FROM cars WHERE ID=%s FOR UPDATE", (car_id,), one=True)
        if not car or car.get("Owner") != listing["seller_name"]:
            write(db, "UPDATE ucp_car_market SET status=2 WHERE id=%s", (listing_id,))
            raise APIError(409, "Vehiculul nu mai aparține vânzătorului inițial. Anunțul a fost închis.")

        price = int(listing["buyout_price"])
        buyer_bank = int(user.get("Bank", 0))
        if buyer_bank < price:
            raise APIError(409, f"Fonduri insuficiente în contul bancar (Maze Bank). Ai ${buyer_bank:,}, iar prețul Buyout este ${price:,}.")

        # Refund previous highest bidder if any
        prev_bidder = int(listing.get("high_bidder_sqlid", 0))
        prev_bid = int(listing.get("current_bid", 0))
        if prev_bidder > 0 and prev_bid > 0 and prev_bidder != int(user["id"]):
            write(db, "UPDATE users SET Bank = Bank + %s WHERE id=%s", (prev_bid, prev_bidder))
            notify_player_email(
                db,
                prev_bidder,
                int(user["id"]),
                f"[Piața Auto] Licitația #{listing_id} a fost cumpărată instant (Buyout). Suma ta licitată (${prev_bid:,}) a fost returnată în Bank.",
                "#economy",
            )
        elif prev_bidder == int(user["id"]) and prev_bid > 0:
            # Buyer was already highest bidder, only pay difference
            write(db, "UPDATE users SET Bank = Bank + %s WHERE id=%s", (prev_bid, int(user["id"])))

        # Deduct from buyer, credit seller, transfer car ownership
        write(db, "UPDATE users SET Bank = Bank - %s WHERE id=%s", (price, int(user["id"])))
        write(db, "UPDATE users SET Bank = Bank + %s WHERE id=%s", (price, int(listing["seller_sqlid"])))
        write(db, "UPDATE cars SET Owner=%s, Lockk=1 WHERE ID=%s", (user["name"], car_id))
        write(db, "UPDATE ucp_car_market SET status=1, buyer_name=%s WHERE id=%s", (user["name"], listing_id))

        mdl = int(car.get("Model") or 411)
        mname = VEHICLE_NAMES.get(mdl, f"Vehicul #{mdl}")
        notify_player_email(
            db,
            int(listing["seller_sqlid"]),
            int(user["id"]),
            f"[Piața Auto] {user['name']} ți-a cumpărat vehiculul {mname} (#{car_id}) cu ${price:,} (Buyout). Banii au fost virați în Bank!",
            "#economy",
        )
        audit_log(db, user, f"Cumpărat {mname} (#{car_id}) de la {listing['seller_name']} cu ${price:,} din Piața Auto UCP")
        return {"message": f"Ai achiziționat {mname} (#{car_id}) de la {listing['seller_name']} pentru ${price:,}! Vehiculul se află acum în garajul tău."}

    if path == "/api/market/bid":
        listing_id = require_int(data, "id", 1, 2147483647)
        bid_amount = require_int(data, "bid_amount", 10000, 500000000)
        if int(user.get("Status", 0)) == 1 and not is_admin(user, 6):
            raise APIError(409, "Ieși din joc înainte de a plasa o ofertă în Piața Auto UCP.")
        listing = query(db, "SELECT * FROM ucp_car_market WHERE id=%s FOR UPDATE", (listing_id,), one=True)
        if not listing or int(listing.get("status", 0)) != 0:
            raise APIError(404, "Acest anunț auto nu mai este activ.")
        if listing["seller_name"].lower() == user["name"].lower():
            raise APIError(400, "Nu poți licita la propriul tău vehicul.")

        min_required = max(int(listing.get("min_bid", 0)), int(listing.get("current_bid", 0)) + 25000)
        if bid_amount < min_required:
            raise APIError(400, f"Oferta minimă permisă este ${min_required:,}.")
        if bid_amount >= int(listing["buyout_price"]):
            raise APIError(400, f"Oferta ta depășește sau egalează prețul Buyout (${int(listing['buyout_price']):,}). Folosește butonul Cumpără Instant!")

        buyer_bank = int(user.get("Bank", 0))
        if buyer_bank < bid_amount:
            raise APIError(409, f"Fonduri insuficiente în Bank. Ai nevoie de ${bid_amount:,} în contul bancar.")

        prev_bidder = int(listing.get("high_bidder_sqlid", 0))
        prev_bid = int(listing.get("current_bid", 0))
        if prev_bidder > 0 and prev_bid > 0:
            write(db, "UPDATE users SET Bank = Bank + %s WHERE id=%s", (prev_bid, prev_bidder))
            if prev_bidder != int(user["id"]):
                notify_player_email(
                    db,
                    prev_bidder,
                    int(user["id"]),
                    f"[Piața Auto] Oferta ta la anunțul #{listing_id} a fost depășită de {user['name']} (${bid_amount:,}). Suma de ${prev_bid:,} ți-a fost returnată în Bank.",
                    "#economy",
                )

        write(db, "UPDATE users SET Bank = Bank - %s WHERE id=%s", (bid_amount, int(user["id"])))
        write(
            db,
            "UPDATE ucp_car_market SET current_bid=%s, high_bidder_sqlid=%s, high_bidder_name=%s WHERE id=%s",
            (bid_amount, int(user["id"]), user["name"], listing_id),
        )
        notify_player_email(
            db,
            int(listing["seller_sqlid"]),
            int(user["id"]),
            f"[Piața Auto] {user['name']} a licitat ${bid_amount:,} pentru vehiculul tău (Anunțul #{listing_id}).",
            "#economy",
        )
        audit_log(db, user, f"Licitat ${bid_amount:,} la anunțul auto #{listing_id}")
        return {"message": f"Oferta ta de ${bid_amount:,} a fost înregistrată ca cea mai mare ofertă!"}

    if path == "/api/market/accept-bid":
        listing_id = require_int(data, "id", 1, 2147483647)
        listing = query(db, "SELECT * FROM ucp_car_market WHERE id=%s FOR UPDATE", (listing_id,), one=True)
        if not listing or int(listing.get("status", 0)) != 0:
            raise APIError(404, "Anunțul nu mai este activ.")
        if int(listing["seller_sqlid"]) != int(user["id"]) and not is_admin(user, 5):
            raise APIError(403, "Doar vânzătorul vehiculului poate accepta oferta curentă.")
        bidder_id = int(listing.get("high_bidder_sqlid", 0))
        bid_val = int(listing.get("current_bid", 0))
        bidder_name = listing.get("high_bidder_name", "")
        if bidder_id <= 0 or bid_val <= 0 or not bidder_name:
            raise APIError(409, "Nu există nicio ofertă de licitație activă pe acest vehicul.")

        car_id = int(listing["car_id"])
        write(db, "UPDATE users SET Bank = Bank + %s WHERE id=%s", (bid_val, int(listing["seller_sqlid"])))
        write(db, "UPDATE cars SET Owner=%s, Lockk=1 WHERE ID=%s", (bidder_name, car_id))
        write(db, "UPDATE ucp_car_market SET status=1, buyer_name=%s WHERE id=%s", (bidder_name, listing_id))
        notify_player_email(
            db,
            bidder_id,
            int(user["id"]),
            f"[Piața Auto] {user['name']} ți-a acceptat oferta de ${bid_val:,} pentru vehiculul #{car_id}! Mașina este acum în garajul tău.",
            "#economy",
        )
        audit_log(db, user, f"Acceptat oferta de ${bid_val:,} de la {bidder_name} pentru vehiculul #{car_id}")
        return {"message": f"Ai acceptat oferta de ${bid_val:,} a lui {bidder_name}! Banii au fost virați în Bank."}

    if path == "/api/market/cancel":
        listing_id = require_int(data, "id", 1, 2147483647)
        listing = query(db, "SELECT * FROM ucp_car_market WHERE id=%s FOR UPDATE", (listing_id,), one=True)
        if not listing or int(listing.get("status", 0)) != 0:
            raise APIError(404, "Anunțul nu mai este activ.")
        if int(listing["seller_sqlid"]) != int(user["id"]) and not is_admin(user, 5):
            raise APIError(403, "Doar proprietarul anunțului sau un Admin 5+ poate retrage vehiculul de la vânzare.")
        prev_bidder = int(listing.get("high_bidder_sqlid", 0))
        prev_bid = int(listing.get("current_bid", 0))
        if prev_bidder > 0 and prev_bid > 0:
            write(db, "UPDATE users SET Bank = Bank + %s WHERE id=%s", (prev_bid, prev_bidder))
            notify_player_email(
                db,
                prev_bidder,
                int(user["id"]),
                f"[Piața Auto] Anunțul auto #{listing_id} a fost retras de vânzător. Suma ta licitată (${prev_bid:,}) a fost returnată în Bank.",
                "#economy",
            )
        write(db, "UPDATE ucp_car_market SET status=2 WHERE id=%s", (listing_id,))
        audit_log(db, user, f"Retras anunțul auto #{listing_id} din Piața Auto UCP")
        return {"message": f"Anunțul #{listing_id} a fost retras din Piața Auto Online."}

    # 8. SUPPORT TICKETS (CREATE / REPLY / STATUS)
    if path == "/api/tickets/create":
        if len(user["name"]) > 20:
            raise APIError(409, "Numele contului depășește 20 caractere (limita coloanei tickets.Name).")
        title = require_text(data, "title", 4, 80)
        body = require_text(data, "body", 10, 1800)
        ttype = require_int(data, "type", 0, 2)
        tid = insert(
            db,
            "tickets",
            {
                "Name": user["name"][:20],
                "Ticket": f"[{TICKET_CATEGORIES.get(ttype, 'General')}] {title}\n\n{body}",
                "Status": 0,
                "type": ttype,
                "idd": int(user["id"]),
            },
        )
        audit_log(db, user, f"Tichet #{tid} deschis")
        return {"id": tid, "message": f"Tichetul de suport #{tid} a fost creat!"}

    if path == "/api/tickets/reply":
        tid = require_int(data, "id", 1, 2147483647)
        text = require_text(data, "text", 1, 1500)
        t = query(db, "SELECT * FROM tickets WHERE id=%s", (tid,), one=True)
        if not t:
            raise APIError(404, "Tichetul nu există.")
        if not is_staff(user) and int(t.get("idd", 0)) != int(user["id"]):
            raise APIError(403, "Nu ai acces la acest tichet.")
        if int(t.get("Status", 0)) != 0 and not is_staff(user):
            raise APIError(409, "Tichetul este închis.")
        insert(db, "reply_tickets", {"idd": tid, "user": user["name"][:20], "text": text})
        if is_staff(user) and int(t.get("idd", 0)) != int(user["id"]):
            notify_player_email(
                db,
                int(t["idd"]),
                int(user["id"]),
                f"[Suport] Staff-ul ({user['name']}) a răspuns la tichetul tău #{tid}.",
                "#tickets",
            )
        audit_log(db, user, f"Răspuns la tichetul #{tid}")
        return {"message": "Răspunsul a fost salvat în tichet."}

    if path == "/api/tickets/status":
        if not is_staff(user):
            raise APIError(403, "Doar membrii Staff (Admin / Helper) pot modifica statusul tichetelor.")
        tid = require_int(data, "id", 1, 2147483647)
        status = require_int(data, "status", 0, 1)
        write(db, "UPDATE tickets SET Status=%s WHERE id=%s", (status, tid))
        audit_log(db, user, f"Tichet #{tid} -> {'Închis' if status == 1 else 'Redeschis'}")
        return {"message": f"Tichetul #{tid} a fost {'închis' if status == 1 else 'redeschis'}."}

    # 9. UNBAN REQUESTS (CREATE / REPLY / RESOLVE WITH AUTO-UNBAN)
    if path == "/api/unban/create":
        details = require_text(data, "details", 10, 1500)
        evidence = require_text(data, "evidence", 3, 500)
        open_req = query_safe(db, "SELECT id FROM unban_requests WHERE user=%s AND status=0 LIMIT 1", (user["name"],), one=True)
        if open_req:
            raise APIError(409, "Ai deja o cerere de unban deschisă.")
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        uid_req = insert(
            db,
            "unban_requests",
            {
                "text": f"Motiv/Explicatie: {details}\nDovezi: {evidence}",
                "tip": 1,
                "user": user["name"],
                "data": now_str,
                "status": 0,
                "idd": str(user["id"]),
            },
        )
        audit_log(db, user, f"Cerere Unban #{uid_req} creată")
        return {"id": uid_req, "message": f"Cererea de Unban #{uid_req} a fost înregistrată!"}

    if path == "/api/unban/reply":
        rid = require_int(data, "id", 1, 2147483647)
        text = require_text(data, "text", 2, 1200)
        req = query_safe(db, "SELECT * FROM unban_requests WHERE id=%s", (rid,), one=True)
        if not req:
            raise APIError(404, "Cererea de unban nu există.")
        if not is_staff(user) and req.get("user") != user["name"]:
            raise APIError(403, "Nu ai acces la această cerere de unban.")
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        insert(
            db,
            "reply_requests",
            {
                "text": text,
                "tip": 1,
                "user": user["name"],
                "data": now_str,
                "status": int(req.get("status", 0)),
                "idd": str(rid),
            },
        )
        return {"message": "Răspunsul a fost adăugat la cererea de unban."}

    if path == "/api/unban/resolve":
        if not is_admin(user, 3):
            raise APIError(403, "Doar Adminii Level 3+ pot soluționa cererile de unban.")
        rid = require_int(data, "id", 1, 2147483647)
        decision = require_int(data, "status", 1, 2)  # 1: Acceptat (Unban), 2: Respins
        note = require_text(data, "note", 2, 500)
        req = query_safe(db, "SELECT * FROM unban_requests WHERE id=%s", (rid,), one=True)
        if not req:
            raise APIError(404, "Cererea de unban nu există.")
        write(db, "UPDATE unban_requests SET status=%s WHERE id=%s", (decision, rid))
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        verdict_label = "ACCEPTATĂ (Cont Debanat)" if decision == 1 else "RESPINSĂ"
        insert(
            db,
            "reply_requests",
            {
                "text": f"[VERDICT - {verdict_label}] {note}",
                "tip": 1,
                "user": user["name"],
                "data": now_str,
                "status": decision,
                "idd": str(rid),
            },
        )
        target_name = req.get("user", "")
        if decision == 1 and target_name:
            write(db, "UPDATE bans SET Active=0 WHERE PlayerName=%s", (target_name,))
            t_user = query_safe(db, "SELECT id, name FROM users WHERE name=%s", (target_name,), one=True)
            if t_user:
                write(db, "UPDATE users SET BTemp=0, BReason='', BBy='' WHERE id=%s", (int(t_user["id"]),))
                insert(
                    db,
                    "punishlogs",
                    {
                        "playerid": int(t_user["id"]),
                        "giverid": int(user["id"]),
                        "playername": t_user["name"],
                        "givername": user["name"],
                        "complaintid": 0,
                        "actionid": 3,
                        "actiontime": 0,
                        "reason": f"Unban Request #{rid} Approved",
                    },
                )
                notify_player_email(
                    db,
                    int(t_user["id"]),
                    int(user["id"]),
                    f"[Unban] Cererea ta de unban #{rid} a fost aprobată de {user['name']}! Contul tău a fost debanat.",
                    "#unban",
                )
        audit_log(db, user, f"Cerere Unban #{rid} ({target_name}) -> {verdict_label}")
        return {"message": f"Cererea de Unban #{rid} a fost marcată ca {verdict_label}."}

    # 10. DONATIONS (CREATE & ADMIN 6 VALIDATION)
    if path == "/api/donations/create":
        pin = require_text(data, "pin", 4, 19)
        sum_eur = require_int(data, "sum", 1, 500)
        did = insert(
            db,
            "donations",
            {
                "donateName": user["name"],
                "donatePIN": pin,
                "donateSUM": str(sum_eur),
                "donateStatus": 0,
                "donateAdminAction": "In asteptare verificare Admin 6",
            },
        )
        audit_log(db, user, f"Donație #{did} înregistrată ({sum_eur} EUR)")
        return {"id": did, "message": f"Donația #{did} ({sum_eur} EUR) a fost trimisă spre verificare fondatorilor!"}

    if path == "/api/donations/review":
        if not is_admin(user, 6):
            raise APIError(403, "Doar Fondatorii (Admin Level 6) pot valida donații.")
        did = require_int(data, "id", 1, 2147483647)
        status = require_int(data, "status", 1, 2)  # 1: Aprobat, 2: Respins
        pp_reward = require_int(data, "pp", 0, 50000, default=0)
        don = query(db, "SELECT * FROM donations WHERE donateID=%s FOR UPDATE", (did,), one=True)
        if not don:
            raise APIError(404, "Donația nu există.")
        if int(don.get("donateStatus", 0)) != 0:
            raise APIError(409, "Această donație a fost deja procesată.")

        action_note = f"{'Aprobat' if status == 1 else 'Respins'} de {user['name']} ({pp_reward} PP)"
        write(db, "UPDATE donations SET donateStatus=%s, donateAdminAction=%s WHERE donateID=%s", (status, legacy_text(action_note), did))
        if status == 1 and pp_reward > 0:
            execute_sanction(
                db,
                user,
                {
                    "action": 7,  # actionid 7 = Add Premium Points in FiveSecondsTimer!
                    "player": don["donateName"],
                    "reason": f"Donatie #{did} aprobata",
                    "duration": pp_reward,
                },
            )
        audit_log(db, user, f"Donație #{did} ({don['donateName']}) -> {action_note}")
        return {"message": f"Donația #{did} a fost procesată: {action_note}."}

    # 11. ACCOUNT SECURITY CENTER (PASSWORD / PIN / EMAILS / SESSIONS)
    if path == "/api/account/password":
        curr_pw = data.get("current_password", "")
        new_pw = data.get("new_password", "")
        if not isinstance(curr_pw, str) or not isinstance(new_pw, str):
            raise APIError(400, "Parole invalide.")
        if not (5 <= len(new_pw) <= 20):
            raise APIError(400, "Noua parolă trebuie să aibă între 5 și 20 caractere (exact ca în comanda /changepass din gamemode).")
        fresh = query(db, "SELECT password FROM users WHERE id=%s", (int(user["id"]),), one=True)
        if not fresh or not verify_password(curr_pw, fresh["password"]):
            raise APIError(401, "Parola actuală este incorectă.")
        hashed = bcrypt.hashpw(new_pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")
        write(db, "UPDATE users SET password=%s WHERE id=%s", (hashed, int(user["id"])))
        audit_log(db, user, "Parola contului a fost schimbată din UCP (bcrypt cost 12)")
        return {"message": "Parola contului a fost actualizată și criptată cu bcrypt (cost 12)!"}

    if path == "/api/account/pin":
        curr_pw = data.get("password", "")
        new_pin = require_text(data, "pin", 4, 8)
        new_email = require_text(data, "email", 5, 50)
        if not new_pin.isdigit():
            raise APIError(400, "PIN-ul de securitate trebuie să conțină doar cifre (4–8 cifre).")
        fresh = query(db, "SELECT password FROM users WHERE id=%s", (int(user["id"]),), one=True)
        if not fresh or not verify_password(curr_pw, fresh["password"]):
            raise APIError(401, "Parola contului este incorectă.")
        write(db, "UPDATE users SET Pin=%s, Email=%s WHERE id=%s", (new_pin, new_email, int(user["id"])))
        audit_log(db, user, "Actualizat PIN de securitate și adresă Email")
        return {"message": "PIN-ul de securitate și adresa de Email au fost actualizate!"}

    if path == "/api/account/emails/read":
        write(db, "UPDATE emails SET EmailRead=0 WHERE playerid=%s", (int(user["id"]),))
        return {"message": "Toate notificările au fost marcate ca citite."}

    if path == "/api/account/sessions/revoke":
        revoked = 0
        with LOCK:
            for sid in list(SESSIONS.keys()):
                if SESSIONS[sid]["uid"] == int(user["id"]) and sid != current_token:
                    del SESSIONS[sid]
                    revoked += 1
        audit_log(db, user, f"Revocat {revoked} sesiuni UCP secundare")
        return {"message": f"Au fost închise {revoked} alte sesiuni active ale contului tău."}

    # 12. ADMIN CONTROL PANEL ACTIONS
    if path == "/api/admin/sanction":
        return execute_sanction(db, user, data)

    if path == "/api/admin/unban":
        if not is_admin(user, 3):
            raise APIError(403, "Doar Adminii Level 3+ pot debana conturi.")
        target_name = require_text(data, "player", 2, 30)
        reason = require_text(data, "reason", 2, 60)
        active_bans = query_safe(db, "SELECT COUNT(*) AS n FROM bans WHERE PlayerName=%s AND Active=1", (target_name,), one=True, default={"n": 0})
        lifted = int(active_bans.get("n", 0) or 0)
        write(db, "UPDATE bans SET Active=0 WHERE PlayerName=%s", (target_name,))
        t_user = query_safe(db, "SELECT id, name FROM users WHERE name=%s", (target_name,), one=True)
        if not t_user and lifted == 0:
            raise APIError(404, f"Jucătorul '{target_name}' nu există și nu are niciun ban activ.")
        if t_user:
            write(db, "UPDATE users SET BTemp=0, BReason='', BBy='' WHERE id=%s", (int(t_user["id"]),))
            insert(
                db,
                "punishlogs",
                {
                    "playerid": int(t_user["id"]),
                    "giverid": int(user["id"]),
                    "playername": t_user["name"],
                    "givername": user["name"],
                    "complaintid": 0,
                    "actionid": 3,
                    "actiontime": 0,
                    "reason": reason,
                },
            )
            notify_player_email(db, int(t_user["id"]), int(user["id"]), f"[Unban] Ai primit unban de la {user['name']}. Motiv: {reason}", "#profile")
        audit_log(db, user, f"Unban aplicat pentru {target_name} ({reason}, {lifted} banuri dezactivate)")
        return {
            "lifted": lifted,
            "message": f"Contul {target_name} a fost debanat cu succes ({lifted} banuri active ridicate)!"
            if lifted > 0
            else f"Restricțiile de ban pentru {target_name} au fost curățate (nu existau banuri active în tabelul bans).",
        }

    if path == "/api/admin/panelactions/manage":
        if not is_admin(user, 6):
            raise APIError(403, "Doar Fondatorii (Admin Level 6) pot gestiona manual coada panelactions.")
        pa_id = require_int(data, "id", 1, 2147483647)
        op = require_text(data, "op", 3, 20)
        pa = query(db, "SELECT * FROM panelactions WHERE id=%s FOR UPDATE", (pa_id,), one=True)
        if not pa:
            raise APIError(404, "Acțiunea din coadă nu mai există (a fost deja procesată de server).")
        act = int(pa.get("actionid", 0))
        val = int(pa.get("actiontime", 0))
        pid = int(pa.get("playerid", 0))
        pname = pa.get("playername", "")
        meta = PANEL_ACTIONS_MAP.get(act, {"name": f"Action #{act}"})

        if op == "delete":
            write(db, "DELETE FROM panelactions WHERE id=%s", (pa_id,))
            audit_log(db, user, f"Șters din coada panelactions #{pa_id} ({meta['name']} pt. {pname})")
            return {"message": f"Acțiunea #{pa_id} ({meta['name']} pt. {pname}) a fost ștearsă din coadă."}
        if op == "apply_now":
            if act == 6:
                write(db, "UPDATE users SET Money=Money+%s WHERE id=%s", (val, pid))
            elif act == 7:
                write(db, "UPDATE users SET PremiumPoints=PremiumPoints+%s WHERE id=%s", (val, pid))
            elif act == 8:
                write(db, "UPDATE users SET Admin=%s WHERE id=%s", (val, pid))
            elif act == 9:
                write(db, "UPDATE users SET Helper=%s WHERE id=%s", (val, pid))
            elif act == 11:
                st = LEADER_SKINS_AND_TEAMS.get(val, {"model": 170, "team": 3})
                if val > 0:
                    write(db, "UPDATE users SET Leader=%s, Member=%s, Rank=7, Team=%s, Model=%s, FWarn=0, FPunish=0, ALeader=0 WHERE id=%s", (val, val, st["team"], st["model"], pid))
                else:
                    write(db, "UPDATE users SET Leader=0, Member=0, Rank=0, Team=3, Model=170, ALeader=0 WHERE id=%s", (pid,))
            write(db, "DELETE FROM panelactions WHERE id=%s", (pa_id,))
            audit_log(db, user, f"Forțat aplicare directă DB pentru panelactions #{pa_id} ({meta['name']} = {val} pt. {pname})")
            return {"message": f"Acțiunea #{pa_id} ({meta['name']}, val: {val}) pentru {pname} a fost aplicată direct în baza de date și eliminată din coadă!"}
        raise APIError(400, "Operațiune invalidă pe coada panelactions.")

    if path == "/api/admin/player-roles":
        op = require_text(data, "op", 3, 30)
        if op == "set_leader":
            if not can_manage_leaders(user):
                raise APIError(403, "Setarea de Lider necesită Admin Level 4+ sau Manager Lideri.")
        else:
            if not is_admin(user, 5):
                raise APIError(403, "Această operațiune necesită Admin Level 5+.")
        target_name = require_text(data, "player", 2, 30)
        target = query(db, "SELECT * FROM users WHERE name=%s FOR UPDATE", (target_name,), one=True)
        if not target:
            raise APIError(404, "Jucătorul nu există.")

        if op == "set_leader":
            fid = require_int(data, "factionid", 0, 14)
            return apply_set_leader(db, user, target, fid, "Set Leader din Admin Panel UCP")
        elif op == "set_vip":
            days = require_int(data, "days", 0, 3650)
            if days == 0:
                vip_val = 0
                lbl = "VIP Dezactivat"
            elif days == 999:
                vip_val = 1
                lbl = "VIP Permanent"
            else:
                base_ts = max(int(time.time()), int(target.get("VIP", 0)) if int(target.get("VIP", 0)) > 1 else int(time.time()))
                vip_val = base_ts + (days * 86400)
                lbl = f"VIP +{days} Zile"
            write(db, "UPDATE users SET VIP=%s WHERE id=%s", (vip_val, int(target["id"])))
            msg = f"Statutul VIP pentru {target['name']} a fost setat: {lbl}."
        elif op == "toggle_badge":
            if not is_admin(user, 6):
                raise APIError(403, "Doar Fondatorii (Admin 6) pot atribui funcții de Manager / Legend.")
            badge_col = require_text(data, "column", 3, 30)
            allowed_cols = {"Legend", "Support", "Beta", "Host"} | {m["col"] for m in MANAGER_ROLES}
            if badge_col not in allowed_cols:
                raise APIError(400, "Rol invalid.")
            new_val = 0 if int(target.get(badge_col, 0)) > 0 else 1
            write(db, f"UPDATE users SET `{badge_col}`=%s WHERE id=%s", (new_val, int(target["id"])))
            msg = f"Rolul '{badge_col}' pentru {target['name']} a fost {'ACTIVAT' if new_val else 'DEZACTIVAT'}."
        else:
            raise APIError(400, "Operațiune necunoscută.")

        notify_player_email(db, int(target["id"]), int(user["id"]), f"[Staff UCP] {msg}", "#profile")
        audit_log(db, user, msg)
        return {"message": msg}

    if path == "/api/admin/server-manage":
        if not is_admin(user, 6):
            raise APIError(403, "Operațiune rezervată exclusiv Admin Level 6 (Founder).")
        op = require_text(data, "op", 3, 30)

        if op == "post_update":
            text = require_text(data, "text", 5, 1500)
            for_type = require_int(data, "for_type", 0, 2, default=0)  # 0: Server, 1: Panel, 2: Security
            allow_rating = 1 if bool(data.get("allow_rating", True)) else 0
            date_str = datetime.datetime.now().strftime("%d.%m.%Y %H:%M")
            uid_up = insert(
                db,
                "updates",
                {
                    "text": text,
                    "date": date_str,
                    "byAdmin": user["name"],
                    "For": for_type,
                },
            )
            write(
                db,
                "INSERT INTO ucp_update_meta (update_id, rating_enabled) VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE rating_enabled=VALUES(rating_enabled)",
                (int(uid_up), allow_rating),
            )
            audit_log(db, user, f"Publicat Server Update #{uid_up}")
            return {"message": f"Update-ul #{uid_up} a fost publicat în changelog!"}

        if op == "edit_stock":
            sid = require_int(data, "id", 0, 500)
            price = require_int(data, "price", 1000, 1000000000)
            stock_cnt = require_int(data, "stock", 0, 1000)
            write(db, "UPDATE stock SET Price=%s, Stock=%s WHERE ID=%s", (price, stock_cnt, sid))
            audit_log(db, user, f"Actualizat Dealership Stock #{sid} (Preț: ${price}, Stoc: {stock_cnt})")
            return {"message": f"Modelul Dealership #{sid} a fost actualizat (Preț: ${price:,}, Stoc: {stock_cnt})."}

        if op == "panel_restrict":
            target_name = require_text(data, "player", 2, 20)
            days = require_int(data, "days", 0, 365)
            reason = require_text(data, "reason", 2, 120)
            if days == 0:
                write(db, "DELETE FROM panel_restrict WHERE PlayerName=%s", (target_name,))
                msg = f"Restricția UCP pentru {target_name} a fost ridicată."
            else:
                insert(
                    db,
                    "panel_restrict",
                    {
                        "PlayerName": target_name,
                        "AdminName": user["name"][:20],
                        "Reason": reason,
                        "Time": int(time.time()) + days * 86400,
                        "Days": days,
                        "Permanent": 1 if days >= 365 else 0,
                    },
                )
                msg = f"Accesul la UCP pentru {target_name} a fost restricționat ({days} zile)."
            audit_log(db, user, msg)
            return {"message": msg}

        if op == "allow_ip":
            ip_addr = require_text(data, "ip", 7, 18)
            max_c = require_int(data, "max_connections", 0, 50)
            if max_c == 0:
                write(db, "DELETE FROM allow_ip_list WHERE ip=%s", (ip_addr,))
                msg = f"IP-ul {ip_addr} a fost șters din whitelist."
            else:
                insert(db, "allow_ip_list", {"ip": ip_addr, "max_connections": max_c})
                msg = f"IP-ul {ip_addr} a fost adăugat în whitelist (max {max_c} conexiuni)."
            audit_log(db, user, msg)
            return {"message": msg}

        raise APIError(400, "Comandă administrativă necunoscută.")

    # 13. LUPMAX SIGNATURE: CUSTOM PLAYER PROFILE STUDIO
    if path == "/api/profile/customize":
        uid = int(user["id"])
        preset = (data.get("banner_preset") or "midnight_wolf").strip()
        if preset not in PROFILE_BANNER_PRESETS:
            preset = "midnight_wolf"
        banner_url = (data.get("banner_url") or "").strip()[:250]
        if banner_url and not re.match(r"^https://[^\s<>\"']+$", banner_url, re.IGNORECASE):
            raise APIError(400, "URL-ul bannerului trebuie să înceapă cu https:// și să nu conțină caractere invalide.")
        accent = (data.get("accent_color") or "").strip()
        if accent and not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
            raise APIError(400, "Culoarea de accent trebuie să fie un cod HEX valid (ex: #3b82f6).")
        custom_title = (data.get("custom_title") or "").strip()[:48]
        bio = (data.get("bio") or "").strip()[:280]
        discord_tag = (data.get("discord_tag") or "").strip()[:48]
        badge = (data.get("showcase_badge") or "wolf_pack").strip()
        if badge not in PROFILE_SHOWCASE_BADGES:
            badge = "wolf_pack"
        waf_inspect_payload({"title": custom_title, "bio": bio, "discord": discord_tag, "url": banner_url}, "profile_custom")
        write(
            db,
            "INSERT INTO ucp_player_profiles (playerid, banner_preset, banner_url, accent_color, custom_title, bio, discord_tag, showcase_badge) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE banner_preset=VALUES(banner_preset), banner_url=VALUES(banner_url), "
            "accent_color=VALUES(accent_color), custom_title=VALUES(custom_title), bio=VALUES(bio), "
            "discord_tag=VALUES(discord_tag), showcase_badge=VALUES(showcase_badge)",
            (uid, preset, banner_url, accent, custom_title, bio, discord_tag, badge),
        )
        audit_log(db, user, f"Personalizat profil UCP (Banner: {preset}, Titlu: '{custom_title or '-'}')")
        return {"message": "Profilul tău LupMax a fost personalizat și salvat!"}

    # 14. LUPMAX SIGNATURE: DAILY SPIN / ROATA NOROCULUI (LIVE REWARD DELIVERY)
    if path == "/api/wheel/spin":
        uid = int(user["id"])
        now = int(time.time())
        target = query(db, "SELECT * FROM users WHERE id=%s FOR UPDATE", (uid,), one=True)
        if not target:
            raise APIError(404, "Contul nu a fost găsit.")
        last_row = query_safe(
            db,
            "SELECT MAX(spun_at) AS last_ts FROM ucp_wheel_spins WHERE playerid=%s",
            (uid,),
            one=True,
            default={"last_ts": 0},
        )
        last_ts = int((last_row or {}).get("last_ts") or 0)
        if last_ts > 0 and (last_ts + 86400) > now:
            rem = (last_ts + 86400) - now
            hrs, rem_m = divmod(rem, 3600)
            mins = rem_m // 60
            raise APIError(429, f"Ai învârtit deja Roata LupMax! Revino peste {hrs}h {mins}m.")

        # Cryptographically fair weighted selection via secrets.randbelow
        total_weight = sum(int(p["weight"]) for p in LUPMAX_WHEEL_PRIZES)
        roll = secrets.randbelow(total_weight)
        acc = 0
        chosen_idx = 0
        for idx, prize in enumerate(LUPMAX_WHEEL_PRIZES):
            acc += int(prize["weight"])
            if roll < acc:
                chosen_idx = idx
                break
        prize = LUPMAX_WHEEL_PRIZES[chosen_idx]
        rtype = prize["type"]
        ramount = int(prize["amount"])
        online = int(target.get("Status", 0)) == 1
        delivered_mode = "db_direct"

        if rtype == "money":
            if online:
                delivered_mode = "live_queue"
                insert(
                    db,
                    "panelactions",
                    {
                        "actionid": 6,
                        "actiontime": ramount,
                        "complaintid": 0,
                        "playerid": uid,
                        "giverid": 0,
                        "playername": target["name"],
                        "givername": "RoataLupMax",
                        "reason": f"Roata LupMax: {prize['label']}",
                        "dm": 0,
                    },
                )
            else:
                write(db, "UPDATE users SET Money=Money+%s WHERE id=%s", (ramount, uid))
        elif rtype == "pp":
            if online:
                delivered_mode = "live_queue"
                insert(
                    db,
                    "panelactions",
                    {
                        "actionid": 7,
                        "actiontime": ramount,
                        "complaintid": 0,
                        "playerid": uid,
                        "giverid": 0,
                        "playername": target["name"],
                        "givername": "RoataLupMax",
                        "reason": f"Roata LupMax: {prize['label']}",
                        "dm": 0,
                    },
                )
            else:
                write(db, "UPDATE users SET PremiumPoints=PremiumPoints+%s WHERE id=%s", (ramount, uid))
        elif rtype == "mats":
            write(db, "UPDATE users SET Materials=Materials+%s WHERE id=%s", (ramount, uid))
        elif rtype == "respect":
            write(db, "UPDATE users SET Respect=Respect+%s WHERE id=%s", (ramount, uid))
        elif rtype == "hidden":
            write(db, "UPDATE users SET HiddenColor=HiddenColor+%s WHERE id=%s", (ramount, uid))
        elif rtype == "jackpot":
            # +50 PP + 3 days VIP
            base_ts = max(now, int(target.get("VIP", 0)) if int(target.get("VIP", 0)) > 1 else now)
            if int(target.get("VIP", 0)) != 1:
                write(db, "UPDATE users SET VIP=%s WHERE id=%s", (base_ts + 3 * 86400, uid))
            if online:
                delivered_mode = "live_queue"
                insert(
                    db,
                    "panelactions",
                    {
                        "actionid": 7,
                        "actiontime": ramount,
                        "complaintid": 0,
                        "playerid": uid,
                        "giverid": 0,
                        "playername": target["name"],
                        "givername": "RoataLupMax",
                        "reason": "JACKPOT Roata LupMax (+50 PP & 3z VIP)",
                        "dm": 0,
                    },
                )
            else:
                write(db, "UPDATE users SET PremiumPoints=PremiumPoints+%s WHERE id=%s", (ramount, uid))

        spin_id = insert(
            db,
            "ucp_wheel_spins",
            {
                "playerid": uid,
                "playername": target["name"],
                "prize_key": prize["key"],
                "prize_label": prize["label"],
                "reward_type": rtype,
                "reward_amount": ramount,
                "rarity": prize["rarity"],
                "delivered_mode": delivered_mode,
                "spun_at": now,
            },
        )
        notify_player_email(
            db,
            uid,
            0,
            f"[Roata LupMax] Felicitări! Ai câștigat {prize['label']} la Roata Norocului UCP.",
            "#wheel",
        )
        audit_log(db, user, f"Roata LupMax #{spin_id}: câștigat {prize['label']} ({delivered_mode})")
        return {
            "spin_id": spin_id,
            "prize_index": chosen_idx,
            "prize": prize,
            "delivered_mode": delivered_mode,
            "message": f"Felicitări! Ai câștigat {prize['label']}!"
            + (" Premiul a fost trimis în coada live către joc." if delivered_mode == "live_queue" else " Premiul a fost creditat direct în cont!"),
        }

    if path == "/api/wheel/reset-cooldown":
        if not is_admin(user, 6):
            raise APIError(403, "Doar Fondatorii (Admin Level 6) pot reseta cooldown-ul de test al Roții.")
        target_id = require_int(data, "playerid", 1, 2147483647, default=int(user["id"]))
        write(db, "UPDATE ucp_wheel_spins SET spun_at=spun_at-90000 WHERE playerid=%s", (target_id,))
        audit_log(db, user, f"Resetat cooldown Roata LupMax pentru user #{target_id}")
        return {"message": "Cooldown-ul Roții LupMax a fost resetat! Poți testa din nou imediat."}

    if path == "/api/updates/rate":
        update_id = require_int(data, "update_id", 1, 2147483647)
        rating = require_int(data, "rating", 0, 5)
        up_row = query(db, "SELECT id FROM updates WHERE id=%s", (update_id,), one=True)
        if not up_row:
            raise APIError(404, f"Update-ul #{update_id} nu există.")
        meta_row = query_safe(db, "SELECT rating_enabled FROM ucp_update_meta WHERE update_id=%s", (update_id,), one=True)
        if meta_row and int(meta_row.get("rating_enabled", 1)) == 0:
            raise APIError(403, "Evaluarea prin stele este dezactivată pentru acest update.")

        uid = int(user["id"])
        if rating == 0:
            write(db, "DELETE FROM ucp_update_ratings WHERE update_id=%s AND user_id=%s", (update_id, uid))
            msg = f"Votul tău pentru Update #{update_id} a fost retras."
        else:
            now_ts = int(time.time())
            write(
                db,
                "INSERT INTO ucp_update_ratings (update_id, user_id, user_name, rating, updated_at) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON DUPLICATE KEY UPDATE rating=VALUES(rating), user_name=VALUES(user_name), updated_at=VALUES(updated_at)",
                (update_id, uid, legacy_text(user["name"])[:32], rating, now_ts),
            )
            msg = f"Ai evaluat Update #{update_id} cu {rating} {'stea' if rating == 1 else 'stele'}!"

        agg = query(
            db,
            "SELECT COUNT(*) AS cnt, COALESCE(ROUND(AVG(rating), 2), 0) AS avg_rating "
            "FROM ucp_update_ratings WHERE update_id=%s",
            (update_id,),
            one=True,
        ) or {"cnt": 0, "avg_rating": 0}
        return {
            "message": msg,
            "update_id": update_id,
            "rating_avg": round(float(agg.get("avg_rating", 0) or 0), 2),
            "rating_count": int(agg.get("cnt", 0) or 0),
            "user_rating": rating,
        }

    raise APIError(404, "Endpoint necunoscut.")


# ==============================================================================
# HTTP SERVER & REQUEST HANDLER
# ==============================================================================
class UCPRequestHandler(BaseHTTPRequestHandler):
    server_version = "LupMaxUCP-Shield/2.0"

    def log_message(self, fmt, *args):
        print("UCP-HTTP", self.command, urlsplit(self.path).path, str(args[1]) if len(args) > 1 else "-", flush=True)

    def client_ip(self) -> str:
        return self.client_address[0] if self.client_address else "127.0.0.1"

    def send_security_headers(self, content_type: str):
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; "
            "connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        )

    def send_json(self, status: int, body: dict, cookie: str = None):
        payload = json.dumps(body, ensure_ascii=False, default=json_default).encode("utf-8")
        self.send_response(status)
        self.send_security_headers("application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(payload)

    def validate_session(self, db, require_auth: bool = True):
        raw_cookie = self.headers.get("Cookie", "")
        cookies = SimpleCookie()
        try:
            cookies.load(raw_cookie)
        except Exception:
            if require_auth:
                raise APIError(401, "Sesiune invalidă. Te rugăm să te autentifici.", "AUTH_REQUIRED")
            return None, None, ""

        morsel = cookies.get(COOKIE_NAME)
        token = morsel.value if morsel else ""
        if not token:
            if require_auth:
                raise APIError(401, "Autentificare necesară în UCP.", "AUTH_REQUIRED")
            return None, None, ""

        now = time.time()
        ip = self.client_ip()
        ua = self.headers.get("User-Agent", "")
        al = self.headers.get("Accept-Language", "")
        client_fp = self.headers.get("X-UCP-Fingerprint", "")

        with LOCK:
            for k in list(SESSIONS.keys()):
                if SESSIONS[k]["expires"] < now:
                    del SESSIONS[k]
            sess = SESSIONS.get(token)

        if not sess:
            if require_auth:
                raise APIError(401, "Sesiunea a expirat. Autentifică-te din nou.", "SESSION_EXPIRED")
            return None, None, ""

        # ANTI-SESSION HIJACKING VERIFICATION
        expected_bind = compute_session_bind_hash(ip, ua, al, sess.get("fp", ""))
        fp_mismatch = bool(client_fp and sess.get("fp") and not hmac.compare_digest(client_fp, sess["fp"]))
        if not hmac.compare_digest(expected_bind, sess["bind_hash"]) or fp_mismatch:
            with LOCK:
                SESSIONS.pop(token, None)
            record_security_event(
                db,
                ip,
                sess.get("uname", "Unknown"),
                "Session Hijack Blocked: Cookie furat sau utilizat de pe alt dispozitiv/browser/IP!",
            )
            raise APIError(
                401,
                "Protecție Anti-Hijack: Sesiunea a fost invalidată deoarece amprenta dispozitivului sau IP-ul s-a schimbat!",
                "HIJACK_BLOCKED",
            )

        with LOCK:
            sess["last_seen"] = now

        user = query(db, "SELECT * FROM users WHERE id=%s", (sess["uid"],), one=True)
        if not user:
            with LOCK:
                SESSIONS.pop(token, None)
            raise APIError(401, "Contul nu mai există.", "AUTH_REQUIRED")

        restricted = query_safe(
            db,
            "SELECT ID, Reason FROM panel_restrict WHERE PlayerName=%s AND (Permanent=1 OR Time>%s) LIMIT 1",
            (user["name"], int(now)),
            one=True,
        )
        if restricted:
            with LOCK:
                SESSIONS.pop(token, None)
            raise APIError(403, f"Accesul acestui cont la UCP este restricționat ({restricted.get('Reason', 'Regulament')}).", "RESTRICTED")

        return user, sess, token

    def do_GET(self):
        self.dispatch(is_post=False)

    def do_POST(self):
        self.dispatch(is_post=True)

    def dispatch(self, is_post: bool):
        db = None
        try:
            parsed = urlsplit(self.path)
            path = parsed.path
            params = parse_qs(parsed.query)
            ip = self.client_ip()

            # WAF Inspection on URL path & query string
            waf_inspect_payload(path, "url_path")
            waf_inspect_payload(parsed.query, "url_query")

            # Serve static UCP files
            if not is_post and path in STATIC_FILES:
                fname, ctype = STATIC_FILES[path]
                body = (ROOT / fname).read_bytes()
                self.send_response(200)
                self.send_security_headers(ctype)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            # Serve bespoke static visual assets from Panel - UCP - LupMax/assets/
            if not is_post and path.startswith("/assets/"):
                asset_name = path[len("/assets/"):]
                if re.fullmatch(r"[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp|svg)", asset_name):
                    asset_file = (ROOT / "assets" / asset_name).resolve()
                    assets_root = (ROOT / "assets").resolve()
                    if str(asset_file).startswith(str(assets_root)) and asset_file.is_file():
                        ext = asset_file.suffix.lower()
                        ctype_map = {
                            ".png": "image/png",
                            ".jpg": "image/jpeg",
                            ".jpeg": "image/jpeg",
                            ".webp": "image/webp",
                            ".svg": "image/svg+xml",
                        }
                        body = asset_file.read_bytes()
                        self.send_response(200)
                        self.send_security_headers(ctype_map.get(ext, "application/octet-stream"))
                        self.send_header("Cache-Control", "public, max-age=3600")
                        self.send_header("Content-Length", str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                        return
                raise APIError(404, "Asset inexistent.")

            # Parse and validate JSON body for POST
            data = {}
            if is_post:
                host = self.headers.get("Host", "")
                origin = self.headers.get("Origin", "")
                if origin and origin != f"http://{host}" and origin != f"https://{host}":
                    raise APIError(403, "Protecție Anti-CSRF: Origine neautorizată.", "ORIGIN_MISMATCH")
                if not self.headers.get("Content-Type", "").startswith("application/json"):
                    raise APIError(415, "Cererea trebuie să fie application/json.")
                length = int(self.headers.get("Content-Length", "0") or 0)
                if not (0 < length <= 48000):
                    raise APIError(413, "Payload JSON invalid sau prea mare.")
                data = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(data, dict):
                    raise APIError(400, "Obiect JSON invalid.")
                waf_inspect_payload(data, "json_body")

                # Global POST anti-flood rate limit
                with LOCK:
                    now = time.time()
                    RATE_LIMITS[ip] = [t for t in RATE_LIMITS.get(ip, []) if now - t < 60]
                    if len(RATE_LIMITS[ip]) >= 45:
                        raise APIError(429, "Anti-Flood Shield: Prea multe cereri pe minut. Așteaptă câteva secunde.", "FLOOD_BLOCK")
                    RATE_LIMITS[ip].append(now)

            db = connect()

            # Health Check
            if not is_post and path == "/api/health":
                query(db, "SELECT 1")
                self.send_json(200, {"ok": True, "database": load_db_config()["database"]})
                return

            # LOGIN ENDPOINT
            if is_post and path == "/api/login":
                uname = require_text(data, "name", 2, 25)
                password = data.get("password", "")
                client_fp = self.headers.get("X-UCP-Fingerprint", "") or data.get("fingerprint", "")
                if not isinstance(password, str) or not (1 <= len(password) <= 128):
                    raise APIError(400, "Introdu parola contului.")

                with LOCK:
                    now = time.time()
                    LOGIN_ATTEMPTS[ip] = [t for t in LOGIN_ATTEMPTS.get(ip, []) if now - t < 300]
                    if len(LOGIN_ATTEMPTS[ip]) >= 8:
                        record_security_event(db, ip, uname, "Brute-Force blocat (8 încercări eșuate în 5 minute)")
                        raise APIError(429, "Anti-BruteForce: Prea multe încercări eșuate. Cont blocat temporar 5 minute.", "RATE_LIMIT")
                    LOGIN_ATTEMPTS[ip].append(now)

                user = query(db, "SELECT * FROM users WHERE name=%s", (uname,), one=True)
                dummy_hash = "$2b$12$KIX9z0R1qQ9b5M0W8uY5eO7aX4lV2nC3pD6fG8hJ1kL2mN3oP4qR6"
                valid = verify_password(password, user["password"] if user else dummy_hash) and (user is not None)
                if not valid:
                    record_security_event(db, ip, uname, "Tentativă de autentificare eșuată (parolă greșită)")
                    raise APIError(401, "Numele de cont sau parola este incorectă.")

                restricted = query_safe(
                    db,
                    "SELECT ID, Reason FROM panel_restrict WHERE PlayerName=%s AND (Permanent=1 OR Time>%s) LIMIT 1",
                    (user["name"], int(time.time())),
                    one=True,
                )
                if restricted:
                    raise APIError(403, f"Accesul acestui cont la UCP este restricționat: {restricted.get('Reason', '')}")

                ua = self.headers.get("User-Agent", "")
                al = self.headers.get("Accept-Language", "")
                bind_hash = compute_session_bind_hash(ip, ua, al, client_fp)
                sid = secrets.token_urlsafe(36)
                csrf = secrets.token_urlsafe(32)
                now = time.time()
                sess_obj = {
                    "uid": int(user["id"]),
                    "uname": user["name"],
                    "csrf": csrf,
                    "bind_hash": bind_hash,
                    "fp": client_fp[:64],
                    "ip": ip,
                    "ua": ua[:140],
                    "created": now,
                    "last_seen": now,
                    "expires": now + SESSION_TTL,
                }
                with LOCK:
                    SESSIONS[sid] = sess_obj
                    LOGIN_ATTEMPTS.pop(ip, None)

                audit_log(db, user, f"Autentificare în UCP (IP: {ip}, Anti-Hijack Bound)")
                db.commit()
                cookie_hdr = f"{COOKIE_NAME}={sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_TTL}"
                self.send_json(200, {"csrf": csrf, "bootstrap": build_bootstrap(db, user, sess_obj)}, cookie=cookie_hdr)
                return

            # Optional auth for public UCP views, mandatory auth for mutations & private views
            user, sess, token = self.validate_session(db, require_auth=is_post)

            if is_post:
                csrf_hdr = self.headers.get("X-CSRF-Token", "")
                if not sess or not hmac.compare_digest(csrf_hdr, sess["csrf"]):
                    record_security_event(db, ip, user["name"] if user else "Anon", "Token CSRF invalid sau lipsă la POST")
                    raise APIError(403, "Protecție Anti-CSRF: Tokenul de securitate nu corespunde sesiunii active.", "CSRF_INVALID")

                if path == "/api/logout":
                    with LOCK:
                        SESSIONS.pop(token, None)
                    audit_log(db, user, "Deconectare din UCP")
                    db.commit()
                    self.send_json(
                        200,
                        {"message": "Te-ai deconectat în siguranță. Sesiunea a fost distrusă pe server."},
                        cookie=f"{COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
                    )
                    return

                with MUTATION_LOCK:
                    db.rollback()
                    fresh_user = query(db, "SELECT * FROM users WHERE id=%s", (int(user["id"]),), one=True)
                    result = handle_post_mutation(db, fresh_user, path, data, sess, token)
                    db.commit()
                self.send_json(200, result)
                return

            # GET ENDPOINTS
            if path == "/api/bootstrap":
                self.send_json(200, build_bootstrap(db, user, sess))
                return

            if path == "/api/players":
                self.send_json(200, get_players_directory(db, params))
                return

            if path == "/api/players/search":
                q = (params.get("q", [""])[0] or "").strip()
                raw_lim = (params.get("limit", ["8"])[0] or "8").strip()
                lim = min(max(int(raw_lim) if raw_lim.isdigit() else 8, 5), 10)
                factions_map = {int(f["ID"]): f for f in query(db, "SELECT * FROM factions ORDER BY ID")}
                if q:
                    waf_inspect_payload(q, "search")
                    if q.isdigit():
                        sql = (
                            "SELECT * FROM users WHERE id=%s OR name LIKE %s "
                            "ORDER BY (id=%s) DESC, Status DESC, Level DESC, ConnectedTime DESC, id DESC LIMIT %s"
                        )
                        matches = query(db, sql, (int(q), f"%{q}%", int(q), lim))
                    else:
                        sql = (
                            "SELECT * FROM users WHERE name LIKE %s "
                            "ORDER BY (LOWER(name) = LOWER(%s)) DESC, (LOWER(name) LIKE LOWER(%s)) DESC, "
                            "Status DESC, Level DESC, ConnectedTime DESC, id DESC LIMIT %s"
                        )
                        matches = query(db, sql, (f"%{q}%", q, f"{q}%", lim))
                else:
                    matches = query(
                        db,
                        "SELECT * FROM users ORDER BY Status DESC, Level DESC, ConnectedTime DESC, id DESC LIMIT %s",
                        (lim,),
                    )
                self.send_json(200, {"results": [serialize_user_summary(u, factions_map) for u in matches]})
                return

            m_player = re.fullmatch(r"/api/player/([^/]+)", path)
            if m_player:
                ident = m_player.group(1).strip()
                waf_inspect_payload(ident, "player_ident")
                if ident.isdigit():
                    target = query(db, "SELECT * FROM users WHERE id=%s", (int(ident),), one=True)
                else:
                    target = query(db, "SELECT * FROM users WHERE name=%s", (ident,), one=True)
                    if not target:
                        target = query(
                            db,
                            "SELECT * FROM users WHERE name LIKE %s "
                            "ORDER BY (LOWER(name) LIKE LOWER(%s)) DESC, Status DESC, Level DESC, ConnectedTime DESC, id DESC LIMIT 1",
                            (f"%{ident}%", f"{ident}%"),
                            one=True,
                        )
                if not target:
                    raise APIError(404, f"Jucătorul '{ident}' nu a fost găsit.")
                self.send_json(200, serialize_full_player_profile(db, target, user))
                return

            m_faction = re.fullmatch(r"/api/faction/(\d+)", path)
            if m_faction:
                self.send_json(200, get_faction_detail(db, int(m_faction.group(1)), user))
                return

            if path == "/api/leader-applications":
                self.send_json(200, get_leader_applications_data(db, user))
                return

            if path == "/api/wheel":
                self.send_json(200, get_wheel_data(db, user))
                return

            if path == "/api/clans":
                cid = int(params.get("id", ["0"])[0] or 0)
                self.send_json(200, get_clans_data(db, cid))
                return

            if path == "/api/wars":
                self.send_json(200, get_wars_and_turfs(db))
                return

            if path == "/api/economy":
                self.send_json(200, get_economy_data(db, user))
                return

            if path == "/api/leaderboards":
                self.send_json(200, get_leaderboards(db))
                return

            if path == "/api/complaints":
                rows = query(
                    db,
                    "SELECT id, playername, createdby, time, status, reasoncomplaint, details, evidence, factionid "
                    "FROM complaints ORDER BY status ASC, id DESC LIMIT 120",
                )
                for r in rows:
                    r["CategoryName"] = COMPLAINT_CATEGORIES.get(int(r.get("reasoncomplaint", 0)), "General")
                    fid = int(r.get("factionid", 0))
                    r["FactionTag"] = FACTION_META.get(fid, {"tag": "CIVIL"})["tag"]
                self.send_json(200, {"complaints": rows})
                return

            m_comp = re.fullmatch(r"/api/complaint/(\d+)", path)
            if m_comp:
                cid = int(m_comp.group(1))
                c = query(db, "SELECT * FROM complaints WHERE id=%s", (cid,), one=True)
                if not c:
                    raise APIError(404, "Reclamația nu există.")
                c["CategoryName"] = COMPLAINT_CATEGORIES.get(int(c.get("reasoncomplaint", 0)), "General")
                replies = query(db, "SELECT id, user, text, time FROM reply_complaints WHERE idd=%s ORDER BY id ASC", (cid,))
                self.send_json(200, {"complaint": c, "replies": replies})
                return

            if path == "/api/tickets":
                if not user:
                    raise APIError(401, "Autentifică-te pentru a accesa tichetele de suport.")
                if is_staff(user):
                    rows = query(db, "SELECT * FROM tickets ORDER BY Status ASC, id DESC LIMIT 120")
                else:
                    rows = query(db, "SELECT * FROM tickets WHERE idd=%s ORDER BY Status ASC, id DESC LIMIT 80", (int(user["id"]),))
                for t in rows:
                    t["CategoryName"] = TICKET_CATEGORIES.get(int(t.get("type", 0)), "General")
                self.send_json(200, {"tickets": rows})
                return

            m_tick = re.fullmatch(r"/api/ticket/(\d+)", path)
            if m_tick:
                if not user:
                    raise APIError(401, "Autentificare necesară.")
                tid = int(m_tick.group(1))
                t = query(db, "SELECT * FROM tickets WHERE id=%s", (tid,), one=True)
                if not t:
                    raise APIError(404, "Tichetul nu există.")
                if not is_staff(user) and int(t.get("idd", 0)) != int(user["id"]):
                    raise APIError(403, "Acest tichet este privat și aparține altui jucător.")
                t["CategoryName"] = TICKET_CATEGORIES.get(int(t.get("type", 0)), "General")
                replies = query(db, "SELECT id, user, text, time FROM reply_tickets WHERE idd=%s ORDER BY id ASC", (tid,))
                self.send_json(200, {"ticket": t, "replies": replies})
                return

            if path == "/api/bans":
                now = int(time.time())
                bans = query(
                    db,
                    "SELECT ID, PlayerName, AdminName, Reason, Days, IPBan, Permanent, Time, BanTimeDate, Active "
                    "FROM bans WHERE Active=1 AND (Permanent=1 OR Time>%s) ORDER BY ID DESC LIMIT 150",
                    (now,),
                )
                for b in bans:
                    b["ExpiresInDays"] = -1 if int(b.get("Permanent", 0)) == 1 else max(0, round((int(b.get("Time", 0)) - now) / 86400, 1))
                unbans = query_safe(db, "SELECT id, text, tip, user, data, status, idd FROM unban_requests ORDER BY status ASC, id DESC LIMIT 100")
                self.send_json(200, {"bans": bans, "unban_requests": unbans})
                return

            m_unban = re.fullmatch(r"/api/unban/(\d+)", path)
            if m_unban:
                rid = int(m_unban.group(1))
                req = query_safe(db, "SELECT * FROM unban_requests WHERE id=%s", (rid,), one=True)
                if not req:
                    raise APIError(404, "Cererea de unban nu există.")
                replies = query_safe(db, "SELECT id, text, user, data, status FROM reply_requests WHERE idd=%s ORDER BY id ASC", (str(rid),))
                ban_row = query_safe(db, "SELECT * FROM bans WHERE PlayerName=%s ORDER BY ID DESC LIMIT 1", (req.get("user", ""),), one=True)
                self.send_json(200, {"request": req, "replies": replies, "ban": ban_row})
                return

            if path == "/api/shop":
                s_logs = query_safe(db, "SELECT id, Shop, playerid, time FROM shop_logs ORDER BY id DESC LIMIT 40")
                g_logs = query_safe(db, "SELECT id, text, PlayerID, sname, time FROM giftbox_logs ORDER BY id DESC LIMIT 40")
                for g in g_logs:
                    g["text"] = clean_samp_colors(g.get("text", ""))
                donations = []
                if user:
                    if is_admin(user, 6):
                        donations = query_safe(db, "SELECT * FROM donations ORDER BY donateStatus ASC, donateID DESC LIMIT 100")
                    else:
                        donations = query_safe(db, "SELECT * FROM donations WHERE donateName=%s ORDER BY donateID DESC LIMIT 30", (user["name"],))
                self.send_json(
                    200,
                    {
                        "vip_packages": VIP_PACKAGES,
                        "vip_benefits": VIP_BENEFITS,
                        "shop_items": SHOP_ITEMS,
                        "shop_logs": s_logs,
                        "giftbox_logs": g_logs,
                        "donations": donations,
                    },
                )
                return

            if path == "/api/account/security":
                if not user:
                    raise APIError(401, "Autentificare necesară.")
                uid = int(user["id"])
                my_sessions = []
                with LOCK:
                    for sid, s in SESSIONS.items():
                        if s["uid"] == uid:
                            my_sessions.append({
                                "current": sid == token,
                                "ip": s["ip"],
                                "ua": s["ua"],
                                "fingerprint": s["bind_hash"][:16],
                                "created": datetime.datetime.fromtimestamp(s["created"]).strftime("%Y-%m-%d %H:%M:%S"),
                                "last_seen": datetime.datetime.fromtimestamp(s["last_seen"]).strftime("%Y-%m-%d %H:%M:%S"),
                            })
                ip_logs = query_safe(db, "SELECT ID, ip, time FROM iplogs WHERE playerid=%s OR name=%s ORDER BY ID DESC LIMIT 30", (uid, user["name"]))
                p_logs = query_safe(db, "SELECT ID, action, time FROM playerlogs WHERE playerid=%s ORDER BY ID DESC LIMIT 40", (uid,))
                emails = query_safe(db, "SELECT ID, playerid, giverid, Message, EmailRead, LinkPanel, Time FROM emails WHERE playerid=%s ORDER BY ID DESC LIMIT 50", (uid,))
                for em in emails:
                    em["Message"] = clean_samp_colors(em.get("Message", ""))
                self.send_json(
                    200,
                    {
                        "email": user.get("Email", ""),
                        "has_pin": user.get("Pin", "0") not in ("", "0"),
                        "sessions": my_sessions,
                        "ip_logs": ip_logs,
                        "player_logs": p_logs,
                        "emails": emails,
                    },
                )
                return

            if path == "/api/admin/dashboard":
                if not is_staff(user):
                    raise APIError(403, "Acces rezervat echipei Staff (Admin / Helper).")
                log_type = (params.get("log_type", ["panellogs"])[0] or "panellogs").strip().lower()
                q_filter = (params.get("q", [""])[0] or "").strip()
                waf_inspect_payload(q_filter, "admin_log_q")

                log_queries = {
                    "panellogs": ("SELECT id, text, time FROM panellogs ORDER BY id DESC LIMIT 120", "text"),
                    "staff_logs": ("SELECT ID AS id, text, time FROM staff_logs ORDER BY ID DESC LIMIT 120", "text"),
                    "log_admin": ("SELECT id, log AS text, time FROM log_admin ORDER BY id DESC LIMIT 120", "text"),
                    "punishlogs": ("SELECT id, CONCAT(givername, ' -> ', playername, ' (act:', actionid, ', dur:', actiontime, '): ', reason) AS text, time FROM punishlogs ORDER BY id DESC LIMIT 120", "text"),
                    "kicklogs": ("SELECT id, CONCAT(givername, ' kicked ', playername, ': ', reason) AS text, time FROM kicklogs ORDER BY id DESC LIMIT 120", "text"),
                    "kill_logs": ("SELECT ID AS id, CONCAT(killername, ' killed ', playername, ' (weapon ', reason, ')') AS text, time FROM kill_logs ORDER BY ID DESC LIMIT 120", "text"),
                    "chat_logs": ("SELECT ID AS id, CONCAT(player, ': ', text) AS text, time FROM chat_logs ORDER BY ID DESC LIMIT 120", "text"),
                    "playerlogs": ("SELECT ID AS id, action AS text, time FROM playerlogs ORDER BY ID DESC LIMIT 120", "text"),
                    "iplogs": ("SELECT ID AS id, CONCAT(name, ' (SQL #', playerid, ') -> IP: ', ip) AS text, time FROM iplogs ORDER BY ID DESC LIMIT 120", "text"),
                    "helperlogs": ("SELECT id, CONCAT(sname, ': ', action) AS text, time FROM helperlogs ORDER BY id DESC LIMIT 120", "text"),
                    "shop_logs": ("SELECT id, CONCAT('User #', playerid, ': ', Shop) AS text, time FROM shop_logs ORDER BY id DESC LIMIT 120", "text"),
                    "giftbox_logs": ("SELECT id, CONCAT(sname, ': ', text) AS text, time FROM giftbox_logs ORDER BY id DESC LIMIT 120", "text"),
                    "su_logs": ("SELECT ID AS id, CONCAT(sumessage, ' (', reason, ')') AS text, time FROM su_logs ORDER BY ID DESC LIMIT 120", "text"),
                }
                sql_q, _ = log_queries.get(log_type, log_queries["panellogs"])
                logs = query_safe(db, sql_q)
                for l in logs:
                    l["text"] = clean_samp_colors(l.get("text", ""))
                if q_filter:
                    qf_low = q_filter.lower()
                    logs = [l for l in logs if qf_low in str(l.get("text", "")).lower()]

                pending_actions = query_safe(db, "SELECT * FROM panelactions ORDER BY id DESC LIMIT 50")
                for pa in pending_actions:
                    aid = int(pa.get("actionid", 0))
                    pa["action_name"] = PANEL_ACTIONS_MAP.get(aid, {"name": f"Action #{aid}"})["name"]
                restrictions = query_safe(db, "SELECT * FROM panel_restrict ORDER BY ID DESC LIMIT 50")
                whitelist = query_safe(db, "SELECT * FROM allow_ip_list ORDER BY ID DESC LIMIT 50")
                with LOCK:
                    sec_events = list(SECURITY_EVENTS[:30])

                self.send_json(
                    200,
                    {
                        "log_type": log_type,
                        "logs": logs,
                        "pending_actions": pending_actions,
                        "restrictions": restrictions,
                        "whitelist": whitelist,
                        "security_events": sec_events,
                    },
                )
                return

            raise APIError(404, "Resursa solicitată nu există în UCP.")

        except APIError as err:
            self.send_json(
                err.status,
                {"error": err.message, "code": err.code},
                cookie=f"{COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" if err.code == "HIJACK_BLOCKED" else None,
            )
        except pymysql.MySQLError as db_err:
            code = db_err.args[0] if db_err.args else 0
            print("[UCP] MySQL Error:", db_err, flush=True)
            self.send_json(503, {"error": f"Eroare MySQL ({code}). Verifică serviciul XAMPP MySQL.", "code": "DB_ERROR"})
        except Exception as exc:
            print("[UCP] Internal Error:", type(exc).__name__, exc, flush=True)
            self.send_json(500, {"error": "Eroare internă a serverului UCP.", "code": "INTERNAL_ERROR"})
        finally:
            if db:
                try:
                    db.rollback()
                    db.close()
                except Exception:
                    pass


def main():
    db = connect()
    ensure_schema_compatibility(db)
    db.close()
    cfg = load_db_config()
    port = int(os.environ.get("UCP_PORT", cfg.get("ucp_port", 8770)))
    print("=" * 72, flush=True)
    print(f" LUPMAX RPG — USER CONTROL PANEL (UCP) & ANTI-HIJACK SHIELD", flush=True)
    print(f" URL Acces UCP : http://127.0.0.1:{port}/", flush=True)
    print(f" Baza de date  : {cfg.get('database')} @ {cfg.get('host')}:{cfg.get('port')}", flush=True)
    print("=" * 72, flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), UCPRequestHandler).serve_forever()


if __name__ == "__main__":
    main()
