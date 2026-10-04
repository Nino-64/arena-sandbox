# noyau/bus.py — journal, bus entre agents et signaux de vie : un fichier SQLite, zéro serveur
import json, os, sqlite3, time, uuid
from contextlib import closing

DB_PATH = os.path.expanduser(os.environ.get("HUB_DB", "~/hub/hub.db"))  # même base pour tous

def _connect():
    # une connexion par appel : sûr depuis plusieurs threads et plusieurs process
    db = sqlite3.connect(DB_PATH, isolation_level=None, timeout=10)
    db.row_factory = sqlite3.Row
    return closing(db)

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
with _connect() as db:
    db.execute("PRAGMA journal_mode=WAL")  # lectures possibles pendant les écritures
    db.execute("""CREATE TABLE IF NOT EXISTS events(
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, ts REAL, agent TEXT,
      topic TEXT, severity TEXT, title TEXT, entities TEXT, payload TEXT,
      dedup_key TEXT UNIQUE, correlation_id TEXT, hops INTEGER)""")
    db.execute("""CREATE TABLE IF NOT EXISTS agents(
      name TEXT PRIMARY KEY, interval_s REAL, last_beat REAL,
      last_success REAL, cursor INTEGER DEFAULT 0)""")

def emit(agent, topic, title, severity="info", entities=(), payload=None,
         dedup_key=None, correlation_id=None, hops=0):
    """Publie un événement. Renvoie (id, statut) : 'nouveau', 'doublon' ou 'boucle'."""
    if hops > 3:  # coupe-circuit anti-boucle : la coupure est tracée, jamais silencieuse
        emit(agent, "bus.loop.cut", f"Boucle coupée : {topic}", "erreur",
             payload={"topic": topic}, correlation_id=correlation_id,
             dedup_key=f"{correlation_id}:{topic}")
        return None, "boucle"
    # clé propre à l'agent et au sujet : deux agents ne peuvent pas se télescoper
    key = None if dedup_key is None else f"{agent}|{topic}|{dedup_key}"
    eid = uuid.uuid4().hex
    with _connect() as db:
        cur = db.execute(
            "INSERT OR IGNORE INTO events(id, ts, agent, topic, severity, title,"
            " entities, payload, dedup_key, correlation_id, hops)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (eid, time.time(), agent, topic, severity, title,
             json.dumps(list(entities)), json.dumps(payload or {}, ensure_ascii=False),
             key, correlation_id or eid, hops))
        if cur.rowcount:
            return eid, "nouveau"
        old = db.execute("SELECT id FROM events WHERE dedup_key = ?", (key,)).fetchone()
        return old["id"], "doublon"  # l'événement d'origine, déjà au journal

def read(agent, *patterns):
    """Abonnement : les événements que cet agent n'a pas encore traités, dans l'ordre.
    Motifs au format LIKE : 'mail.casier.item', 'crm.deal.%', '%.error'."""
    where = " OR ".join("topic LIKE ?" for _ in patterns)
    with _connect() as db:
        row = db.execute("SELECT cursor FROM agents WHERE name = ?", (agent,)).fetchone()
        return db.execute(f"SELECT * FROM events WHERE ({where}) AND seq > ? ORDER BY seq",
                          (*patterns, row["cursor"] if row else 0)).fetchall()

def ack(agent, seq):
    """Après traitement : un agent redémarré reprend exactement où il s'était arrêté."""
    with _connect() as db:
        db.execute("INSERT INTO agents(name, cursor) VALUES (?, ?) ON CONFLICT(name)"
                   " DO UPDATE SET cursor = MAX(cursor, excluded.cursor)", (agent, seq))

def heartbeat(agent, interval_s=60, success=False, now=None):
    """Signal de vie : chaque agent l'appelle toutes les interval_s secondes
    (tâche APScheduler), et avec success=True après chaque tâche réussie."""
    now = now or time.time()
    with _connect() as db:
        db.execute(
            "INSERT INTO agents(name, interval_s, last_beat, last_success) VALUES (?,?,?,?)"
            " ON CONFLICT(name) DO UPDATE SET interval_s = excluded.interval_s,"
            " last_beat = excluded.last_beat,"
            " last_success = COALESCE(excluded.last_success, last_success)",
            (agent, interval_s, now, now if success else None))

def watchdog_tick(now=None):
    """Chien de garde, lancé chaque minute par FORGE et par le hub. Même émetteur et
    même clé : une seule alerte par panne, même avec deux gardiens."""
    now = now or time.time()
    with _connect() as db:
        prev = db.execute("SELECT last_beat FROM agents WHERE name = 'watchdog'").fetchone()
        silent = db.execute("SELECT name, last_beat FROM agents WHERE name != 'watchdog'"
                            " AND ? - last_beat > 2 * interval_s", (now,)).fetchall()
    heartbeat("watchdog", 60, now=now)
    if prev and now - prev["last_beat"] > 180:
        return []  # trou de plus de 3 min : la machine sortait de veille, un cycle de grâce
    alerts = []
    for name, last_beat in silent:
        late = now - last_beat
        topic, level = ("agent.down.critical", "critique") if late > 3600 else ("agent.down", "alerte")
        _, status = emit("watchdog", topic, f"{name} muet depuis {late / 60:.0f} min", level,
                         entities=[f"agent:{name}"], dedup_key=f"{name}:{last_beat:.0f}")
        if status == "nouveau":
            alerts.append((name, level))
    return alerts
