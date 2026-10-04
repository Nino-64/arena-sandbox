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
      name TEXT PRIMARY KEY, interval_s REAL, last_beat REAL, last_success REAL,
      beat_mark INTEGER, cursor INTEGER DEFAULT 0)""")
    # passages des chiens de garde : il n'y en a que machine allumée
    db.execute("""CREATE TABLE IF NOT EXISTS ticks(
      id INTEGER PRIMARY KEY AUTOINCREMENT, guardian TEXT, ts REAL)""")
    db.execute("CREATE INDEX IF NOT EXISTS ticks_g ON ticks(guardian, id)")
    # feux de santé : un agent reste en panne tant qu'il n'a pas redonné signe de vie
    # après l'alerte du chien de garde ; le tableau de bord ne recalcule rien
    db.execute("""CREATE VIEW IF NOT EXISTS sante AS
      SELECT a.name, a.last_beat, a.last_success, COALESCE((SELECT e.severity
        FROM events e WHERE e.dedup_key IN (
          'watchdog|agent.down|' || a.name || ':' || a.beat_mark,
          'watchdog|agent.down.critical|' || a.name || ':' || a.beat_mark)
        ORDER BY e.seq DESC LIMIT 1), 'ok') AS etat
      FROM agents a WHERE a.last_beat IS NOT NULL""")

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
    """Signal de vie, appelé au démarrage puis toutes les interval_s secondes par une
    tâche APScheduler rattrapée au réveil (misfire_grace_time=None), et avec
    success=True après chaque tâche réussie. beat_mark note le dernier passage de garde
    déjà écoulé : le silence se compte ensuite en passages, pas en secondes."""
    now = now or time.time()
    with _connect() as db:
        db.execute(
            "INSERT INTO agents(name, interval_s, last_beat, last_success, beat_mark)"
            " VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(id), 0) FROM ticks))"
            " ON CONFLICT(name) DO UPDATE SET interval_s = excluded.interval_s,"
            " last_beat = excluded.last_beat, beat_mark = excluded.beat_mark,"
            " last_success = COALESCE(excluded.last_success, last_success)",
            (agent, interval_s, now, now if success else None))

def watchdog_tick(guardian, now=None):
    """Chien de garde, lancé chaque minute par deux gardiens, 'forge' et 'hub'. Chacun
    compte SES passages depuis le dernier signal de chaque agent. Machine en veille ou
    éteinte, personne ne passe : une veille ou une nuit, quelle que soit sa durée, ajoute
    au plus un passage, et un saut de l'horloge n'en ajoute aucun."""
    now = now or time.time()
    with _connect() as db:
        last = db.execute("SELECT ts FROM ticks WHERE guardian = ? ORDER BY id DESC LIMIT 1",
                          (guardian,)).fetchone()
        if last and abs(now - last["ts"]) < 30:
            return []  # rattrapages en rafale au réveil : un seul passage compte
        db.execute("INSERT INTO ticks(guardian, ts) VALUES (?, ?)", (guardian, now))
        db.execute("DELETE FROM ticks WHERE id < (SELECT MAX(id) FROM ticks) - 5000")
        rows = db.execute(
            "SELECT name, interval_s, beat_mark, (SELECT COUNT(*) FROM ticks t"
            " WHERE t.guardian = ? AND t.id > a.beat_mark) AS passages"
            " FROM agents a WHERE last_beat IS NOT NULL", (guardian,)).fetchall()
    alerts = []
    for r in rows:
        if r["passages"] <= 2 * r["interval_s"] / 60 + 1:  # 2 intervalles + 1 de marge
            continue
        topic, level = (("agent.down.critical", "critique") if r["passages"] > 60
                        else ("agent.down", "alerte"))
        # même émetteur et même clé (agent + dernier signal) pour les deux gardiens :
        # une seule alerte par niveau et par panne
        _, status = emit("watchdog", topic,
                         f"{r['name']} muet depuis ~{r['passages']} min (machine allumée)",
                         level, entities=[f"agent:{r['name']}"],
                         dedup_key=f"{r['name']}:{r['beat_mark']}")
        if status == "nouveau":
            alerts.append((r["name"], level))
    return alerts
