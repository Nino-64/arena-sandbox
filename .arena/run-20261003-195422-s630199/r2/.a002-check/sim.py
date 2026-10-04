# Simulation aléatoire du chien de garde : phases, gigue, veilles, redémarrages, modèles de minuterie.
import bisect, importlib, math, os, random, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

def fresh(tag):
    d = os.path.join(HERE, "dbs_" + tag); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    os.environ["HUB_DB"] = os.path.join(d, "hub.db")
    import bus_new; b = importlib.reload(bus_new)
    orig = b._connect
    def fast():
        c = orig(); c.thing.execute("PRAGMA synchronous=OFF"); return c
    b._connect = fast
    return b

def loguni(rng, lo, hi): return math.exp(rng.uniform(math.log(lo), math.log(hi)))

def run(seed, model, hours, awake_lo, awake_hi, sleep_lo=5, sleep_hi=12 * 3600, J=2.0, p_reboot=0.15):
    rng = random.Random(seed)
    b = fresh(f"{model}_{seed}")
    T0 = 1_800_000_000.0; end = T0 + hours * 3600
    # calendrier de veille : (début, réveil, redémarrage ?)
    sleeps, t = [], T0 + loguni(rng, awake_lo, awake_hi)
    while t < end:
        d = loguni(rng, sleep_lo, sleep_hi); sleeps.append((t, t + d, rng.random() < p_reboot))
        t += d + loguni(rng, awake_lo, awake_hi)
    starts = [s for s, _, _ in sleeps]
    def asleep(x):
        i = bisect.bisect_right(starts, x) - 1
        return i >= 0 and sleeps[i][0] <= x < sleeps[i][1]
    def wake_after(x):  # fin de la veille qui contient x
        i = bisect.bisect_right(starts, x) - 1; return sleeps[i][1]
    # segments de vie des process : coupés par les redémarrages
    segs, s0 = [], T0
    for s, w, rb in sleeps:
        if rb: segs.append((s0, s)); s0 = w
    segs.append((s0, end))
    # temps d'éveil <-> temps mural
    def awake_between(x, y):
        tot, cur = 0.0, x
        for s, w, _ in sleeps:
            if w <= cur: continue
            if s >= y: break
            tot += max(0.0, min(s, y) - cur); cur = max(cur, w)
        return tot + max(0.0, y - cur)
    def wall_from_awake(x, a):  # instant mural après a secondes d'éveil depuis x (x éveillé)
        cur = x
        i = bisect.bisect_right(starts, cur)
        while True:
            nxt = sleeps[i][0] if i < len(sleeps) else float("inf")
            if cur + a < nxt: return cur + a
            a -= nxt - cur; cur = sleeps[i][1]; i += 1
    aligned = rng.random() < 0.5
    base_phase = rng.uniform(0, 60)
    td = rng.uniform(T0 + 3600, end - 7200)          # mort de l'agent 'dead'
    while asleep(td): td += 60
    events = []  # (t, tiebreak, kind, name)
    jobs = [("beat", n) for n in ("a1", "a2", "a3", "dead", "forge")] + [("tick", "forge"), ("loop", "hub")]
    for (ss, se) in segs:
        for kind, name in jobs:
            phase = (base_phase + rng.uniform(0, 0.5)) if aligned else rng.uniform(0, 60)
            st = ss + rng.uniform(0, 20)               # démarrage du process
            if kind in ("beat", "loop"): events.append((st, rng.random(), kind, name))  # signal au démarrage
            if model == "transparent":                 # minuteries en temps d'éveil (Linux, Windows)
                a, k = phase, 0
                while True:
                    a_k = (phase + 60 * k + rng.uniform(0, J)) if kind != "loop" else a
                    x = wall_from_awake(st, a_k)
                    if x >= se: break
                    events.append((x, rng.random(), kind, name)); k += 1
                    if kind == "loop": a += 60 + rng.uniform(0, 0.05)
            else:                                      # minuteries en temps mural (macOS)
                catch = (kind in ("beat", "loop")) and model == "wall"
                if model == "wall-skip-all": catch = (kind == "loop")
                k, last_caught = 0, None
                while True:
                    x = st + phase + 60 * k + rng.uniform(0, J); k += 1
                    if x >= se: break
                    if asleep(x):
                        if catch:
                            w = wake_after(x)
                            if w != last_caught and w < se:
                                events.append((w + rng.uniform(0, 2), rng.random(), kind, name)); last_caught = w
                        continue
                    events.append((x, rng.random(), kind, name))
    events.sort()
    false_alerts, dead_alerts, last_dead_beat = [], [], None
    for x, _, kind, name in events:
        if kind == "beat":
            if name == "dead" and x > td: continue
            b.heartbeat(name, 60, now=x)
            if name == "dead": last_dead_beat = x
        elif kind == "tick":
            for who, lvl in b.watchdog_tick(name, now=x):
                (dead_alerts if who == "dead" and x > td else false_alerts).append((x, who, lvl))
        else:  # boucle du hub : signal de vie puis passage de garde
            b.heartbeat("hub", 60, now=x)
            for who, lvl in b.watchdog_tick("hub", now=x + 0.001):
                (dead_alerts if who == "dead" and x > td else false_alerts).append((x, who, lvl))
    first = [a for a in dead_alerts if a[2] == "alerte"]
    delay = awake_between(last_dead_beat, first[0][0]) if first else None
    awake_left = awake_between(td, end)
    missed = (not first) and awake_left > 400
    n_alerte = sum(1 for a in dead_alerts if a[2] == "alerte")
    return false_alerts, delay, missed, n_alerte, len(sleeps)

if __name__ == "__main__":
    profile = sys.argv[1]
    if profile == "realiste":   awake_lo, awake_hi, hours, runs = 120, 6 * 3600, 72, 12
    else:                       awake_lo, awake_hi, hours, runs = 5, 600, 24, 12
    for model in ("transparent", "wall", "wall-skip-all"):
        fa_tot, delays, missed, dup, nsl = 0, [], 0, 0, 0
        for seed in range(runs):
            fa, d, m, n_al, ns = run(seed, model, hours, awake_lo, awake_hi)
            fa_tot += len(fa); missed += m; dup += (n_al > 1); nsl += ns
            if d is not None: delays.append(d)
            if fa and fa_tot == len(fa): print("   exemple de fausse alerte :", model, seed, fa[:3])
        print(f"{profile:10s} {model:14s} veilles={nsl:5d} fausses_alertes={fa_tot:3d} "
              f"morts_non_vus={missed} alertes_en_double={dup} "
              f"délai_max_détection={max(delays):.0f}s d'éveil" if delays else "")
