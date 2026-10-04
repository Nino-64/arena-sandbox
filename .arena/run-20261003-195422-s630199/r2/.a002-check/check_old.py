# Reproduit les deux contre-exemples de l'attaque 1 sur le code r1.
import importlib, os, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

def fresh(tag):
    d = os.path.join(HERE, "db_" + tag); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    os.environ["HUB_DB"] = os.path.join(d, "hub.db")
    import bus_old; return importlib.reload(bus_old)

T0 = 1_800_000_000.0
# (a) deux gardiens, une nuit eteinte
b = fresh("a")
for name in ("tresor", "vigie"): b.heartbeat(name, 60, now=T0)
b.watchdog_tick(now=T0 + 10)            # gardien FORGE
b.watchdog_tick(now=T0 + 20)            # gardien hub
t1 = T0 + 8 * 3600
print("(a) gardien 1 au reveil :", b.watchdog_tick(now=t1))
print("(a) gardien 2 au reveil :", b.watchdog_tick(now=t1 + 1))
# (b) veille de 150 s, un seul gardien
b = fresh("b")
for name in ("tresor", "vigie"): b.heartbeat(name, 60, now=T0)
b.watchdog_tick(now=T0 + 30)
print("(b) apres 150 s de veille :", b.watchdog_tick(now=T0 + 40 + 150))
