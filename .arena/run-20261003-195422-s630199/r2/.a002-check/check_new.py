# Tests déterministes du nouveau noyau (bus_new.py).
import importlib, os, sys, shutil, multiprocessing as mp
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
T0 = 1_800_000_000.0
AGENTS = ("tresor", "vigie", "filon")
results = []

def fresh(tag):
    d = os.path.join(HERE, "dbn_" + tag); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    os.environ["HUB_DB"] = os.path.join(d, "hub.db")
    import bus_new; return importlib.reload(bus_new)

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("OK  " if cond else "FAIL"), name, detail)

def down_events(b, who=None):
    with b._connect() as db:
        rows = db.execute("SELECT topic, title, entities FROM events WHERE topic LIKE 'agent.down%'"
                          " ORDER BY seq").fetchall()
    return [dict(r) for r in rows if who is None or f'"agent:{who}"' in r["entities"]]

def etat(b):
    with b._connect() as db:
        return {r["name"]: r["etat"] for r in db.execute("SELECT name, etat FROM sante")}

def normal_minutes(b, t, minutes, agents=AGENTS, guardians=("forge", "hub"), dead=()):
    """Fonctionnement normal : chaque minute, les agents battent puis les gardiens passent."""
    alerts = []
    for k in range(minutes):
        base = t + 60 * k
        for i, a in enumerate(agents):
            if a not in dead: b.heartbeat(a, 60, now=base + 1 + i)
        if "forge" in guardians and "forge" not in dead: b.heartbeat("forge", 60, now=base + 5)
        if "hub" in guardians and "hub" not in dead: b.heartbeat("hub", 60, now=base + 6)
        for j, g in enumerate(guardians):
            if g not in dead: alerts += b.watchdog_tick(g, now=base + 10 + 20 * j)
    return alerts, t + 60 * minutes

# 1. Contre-exemple (a) de l'attaque : deux gardiens, nuit éteinte, ils passent avant les agents
b = fresh("a")
al, t = normal_minutes(b, T0, 10)
t1 = t + 8 * 3600
al += b.watchdog_tick("forge", now=t1)
al += b.watchdog_tick("hub", now=t1 + 1)          # le 2e gardien voit la même chose
al2, t = normal_minutes(b, t1 + 2, 10)            # les agents redémarrent et battent
check("(a) nuit éteinte, deux gardiens passent avant les agents : 0 alerte", not al and not al2, al + al2)

# 2. Contre-exemple (b) : veille de 150 s, un seul gardien
b = fresh("b")
al, t = normal_minutes(b, T0, 10, guardians=("hub",))
al += b.watchdog_tick("hub", now=t + 150)         # le gardien passe avant les agents au réveil
al2, _ = normal_minutes(b, t + 151, 10, guardians=("hub",))
check("(b) veille de 150 s, un seul gardien : 0 alerte", not al and not al2, al + al2)

# 3. Agent mort, deux gardiens : une seule alerte, au 4e passage au plus, puis critique
b = fresh("c")
al, t = normal_minutes(b, T0, 5)
al3, t = normal_minutes(b, t, 4, dead=("vigie",))
ev = down_events(b, "vigie")
check("agent tué : alerte au 4e passage au plus (< 4 min)", any(a == ("vigie", "alerte") for a in al3), al3)
check("agent tué, deux gardiens : une seule alerte au journal", len(ev) == 1, ev)
check("vue sante : vigie en alerte, les autres ok", etat(b) == {**{a: "ok" for a in AGENTS}, "forge": "ok", "hub": "ok", "vigie": "alerte"}, etat(b))
al4, t = normal_minutes(b, t, 60, dead=("vigie",))
ev = down_events(b, "vigie")
check("> 60 passages : une alerte critique, une seule", [e["topic"] for e in ev] == ["agent.down", "agent.down.critical"], [e["topic"] for e in ev])
check("vue sante : vigie critique", etat(b)["vigie"] == "critique", etat(b))
al5, t = normal_minutes(b, t, 3)                  # vigie redémarre
check("agent revenu : feu ok, aucune nouvelle alerte", etat(b)["vigie"] == "ok" and not al5, (etat(b), al5))
check("aucune alerte pour les agents sains", all("vigie" in e["entities"] for e in down_events(b)), down_events(b))

# 4. Agent mort pendant la veille : signalé au réveil en 4 passages au plus
b = fresh("d")
al, t = normal_minutes(b, T0, 5)
t1 = t + 3 * 3600
al6, t = normal_minutes(b, t1, 4, dead=("filon",))
check("agent mort pendant la veille : alerte dans les 4 min qui suivent le réveil", ("filon", "alerte") in al6 and len(down_events(b)) == 1, (al6, down_events(b)))

# 5. Rafale de rattrapages au réveil : un seul passage compte
b = fresh("e")
al, t = normal_minutes(b, T0, 5)
burst = []
for k in range(20):
    burst += b.watchdog_tick("forge", now=t + 600 + k * 0.5)
with b._connect() as db:
    n = db.execute("SELECT COUNT(*) FROM ticks WHERE guardian='forge' AND ts >= ?", (t + 600,)).fetchone()[0]
check("20 rattrapages en rafale : 1 passage compté, 0 alerte", n == 1 and not burst, (n, burst))

# 6. Horloge reculée de 10 min, puis avancée d'une heure
b = fresh("f")
al, t = normal_minutes(b, T0, 10)
al7, t2 = normal_minutes(b, t - 600, 15)
al8, _ = normal_minutes(b, t2 + 3600, 15)
check("horloge reculée de 10 min puis avancée d'1 h : 0 alerte", not al7 and not al8, al7 + al8)

# 7. Les gardiens se surveillent l'un l'autre
b = fresh("g")
al, t = normal_minutes(b, T0, 5)
al9, t = normal_minutes(b, t, 5, dead=("forge",))
check("FORGE tombe : le hub le signale", ("forge", "alerte") in al9, al9)
b = fresh("h")
al, t = normal_minutes(b, T0, 5)
al10, t = normal_minutes(b, t, 5, dead=("hub",))
check("la boucle du hub tombe : FORGE la signale", ("hub", "alerte") in al10, al10)

# 8. Bus : doublons, collisions, boucles, curseurs (inchangés), 8 process concurrents
b = fresh("i")
e1 = b.emit("filon", "crm.deal.stage_changed", "x", dedup_key="k1")
e2 = b.emit("filon", "crm.deal.stage_changed", "x", dedup_key="k1")
check("doublon : même clé → 1 événement, id d'origine renvoyé", e1[1] == "nouveau" and e2 == (e1[0], "doublon"), (e1, e2))
e3 = b.emit("tresor", "crm.deal.stage_changed", "x", dedup_key="k1")
check("collision : même clé chez deux agents → 2 événements", e3[1] == "nouveau", e3)
e4 = b.emit("filon", "a.b.c", "x", hops=4, correlation_id="c1")
with b._connect() as db:
    cut = db.execute("SELECT COUNT(*) FROM events WHERE topic='bus.loop.cut'").fetchone()[0]
check("boucle : hops > 3 → coupée et tracée", e4 == (None, "boucle") and cut == 1, (e4, cut))
rows = b.read("vigie", "crm.deal.%"); b.ack("vigie", rows[-1]["seq"])
check("curseur : rien de relu après ack", len(rows) == 2 and not b.read("vigie", "crm.deal.%"), len(rows))

def worker(path, q):
    os.environ["HUB_DB"] = path
    import bus_new; b = importlib.reload(bus_new)
    q.put(b.emit("forge", "dev.incident.new", "x", dedup_key="same")[1])

if __name__ == "__main__":
    q = mp.Queue(); ps = [mp.Process(target=worker, args=(os.environ["HUB_DB"], q)) for _ in range(8)]
    [p.start() for p in ps]; [p.join() for p in ps]
    st = sorted(q.get() for _ in ps)
    check("8 process, même clé → 1 seul 'nouveau'", st.count("nouveau") == 1 and st.count("doublon") == 7, st)
    print(f"\n{sum(ok for _, ok in results)}/{len(results)} tests OK")
