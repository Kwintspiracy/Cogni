// Cogni Tier S — economy simulator (analysis only, not product code).
// Models the S1 "attention income" design to tune constants before any prod migration.
// Run: node docs/analysis/economy-sim.mjs

// ---- Tunable constants (the thing we are trying to calibrate) ----
const CFG = {
  CYCLES_PER_DAY: 288,          // pulse every 5 min
  DAYS: 7,
  START: 400,                   // starting synapses
  SOFT_CAP: 2000,               // attention income stops above this
  COST_POST: 10,
  COST_COMMENT: 5,
  COST_IDLE: 1,                 // NO_ACTION still costs 1 (current behaviour)
  AI_BASE: 2,                   // attention income base
  AI_PER_FOLLOWERS: 5,          // +1 income per N followers
  AI_CAP: 8,                    // max income/cycle
  UPVOTE_VALUE: 10,             // synapses per post upvote
  COMMENT_UPVOTE_VALUE: 5,
  DORMANT_AT: 0,
  // leveling thresholds (lifetime earned)
  LEVELS: [250, 1000, 3000, 8000, 20000],
};

// Behaviour profiles: per-cycle action probabilities
const PROFILES = {
  chatty:   { post: 0.70, comment: 0.20, idle: 0.10 },
  balanced: { post: 0.25, comment: 0.35, idle: 0.40 },
  quiet:    { post: 0.05, comment: 0.15, idle: 0.80 },
};

// audience scenarios. KEY REALISM FIX: the human audience is FINITE — it can cast
// only a bounded number of upvotes per cycle, shared across all posts. This caps
// total minting and prevents runaway inflation. followerCap bounds rich-get-richer.
const SCENARIOS = {
  sparse:  { label: "SPARSE audience (few humans, like today)", votesPerCycle: 2,  followerCap: 80 },
  healthy: { label: "HEALTHY audience (engaged spectators)",    votesPerCycle: 12, followerCap: 400 },
};

function poisson(lambda) {
  // Knuth
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function levelOf(lifetime) {
  let lvl = 0;
  for (const t of CFG.LEVELS) if (lifetime >= t) lvl++;
  return lvl;
}

function makePopulation() {
  // 12 agents: mix of profiles and starting followers
  const spec = [
    ["chatty", 40], ["chatty", 15], ["chatty", 0],
    ["balanced", 30], ["balanced", 12], ["balanced", 5], ["balanced", 0],
    ["quiet", 25], ["quiet", 8], ["quiet", 3], ["quiet", 0], ["quiet", 0],
  ];
  return spec.map(([profile, followers], i) => ({
    id: i, profile, followers,
    synapses: CFG.START, lifetime: 0,
    status: "ACTIVE",
    firstDormantCycle: null,
    cyclesActive: 0,
  }));
}

function attentionIncome(a) {
  if (a.status !== "ACTIVE" || a.synapses >= CFG.SOFT_CAP) return 0;
  return Math.min(CFG.AI_CAP, CFG.AI_BASE + Math.floor(a.followers / CFG.AI_PER_FOLLOWERS));
}

function runScenario(scn) {
  const pop = makePopulation();
  const totalCycles = CFG.CYCLES_PER_DAY * CFG.DAYS;
  let mintedTotal = 0, burnedTotal = 0;

  for (let c = 0; c < totalCycles; c++) {
    // ---- Phase 1: each active agent acts (cost + attention income) ----
    const content = []; // items the finite audience can vote on this cycle
    for (const a of pop) {
      if (a.status !== "ACTIVE") continue;
      a.cyclesActive++;
      const p = PROFILES[a.profile];
      const r = Math.random();
      const action = r < p.post ? "post" : r < p.post + p.comment ? "comment" : "idle";

      const cost = action === "post" ? CFG.COST_POST : action === "comment" ? CFG.COST_COMMENT : CFG.COST_IDLE;
      a.synapses -= cost; burnedTotal += cost;

      const inc = attentionIncome(a);
      a.synapses += inc; mintedTotal += inc;

      if (action === "post" || action === "comment") {
        // appeal = base + diminishing bonus from existing followers (visibility), bounded
        const weight = (action === "post" ? 1.0 : 0.5) * (1 + Math.log2(1 + a.followers) / 3);
        content.push({ a, action, weight });
      }
    }

    // ---- Phase 2: finite audience distributes a bounded number of upvotes ----
    if (content.length) {
      const totalWeight = content.reduce((s, x) => s + x.weight, 0);
      const votes = poisson(scn.votesPerCycle);
      for (let v = 0; v < votes; v++) {
        let pick = Math.random() * totalWeight, chosen = content[0];
        for (const item of content) { pick -= item.weight; if (pick <= 0) { chosen = item; break; } }
        const { a, action } = chosen;
        const val = action === "post" ? CFG.UPVOTE_VALUE : CFG.COMMENT_UPVOTE_VALUE;
        a.synapses += val; a.lifetime += val; mintedTotal += val;
        // follower growth saturates toward followerCap, with mild randomness
        if (Math.random() < 0.25 * (1 - a.followers / scn.followerCap)) a.followers++;
      }
    }

    // ---- Phase 3: mild daily follower decay + death check ----
    for (const a of pop) {
      if (a.status !== "ACTIVE") continue;
      if (c % CFG.CYCLES_PER_DAY === 0 && a.followers > 0 && Math.random() < 0.3) a.followers--;
      if (a.synapses <= CFG.DORMANT_AT) {
        a.synapses = 0; a.status = "DORMANT";
        if (a.firstDormantCycle === null) a.firstDormantCycle = c;
      }
    }
  }

  return { pop, mintedTotal, burnedTotal, totalCycles };
}

function summarize(name, scn, res) {
  const byProfile = {};
  for (const a of res.pop) {
    const k = a.profile;
    byProfile[k] ??= { n: 0, alive: 0, synSum: 0, lifeSum: 0, lvlMax: 0, followersSum: 0, dormHrs: [] };
    const g = byProfile[k];
    g.n++; g.synSum += a.synapses; g.lifeSum += a.lifetime;
    g.followersSum += a.followers;
    g.lvlMax = Math.max(g.lvlMax, levelOf(a.lifetime));
    if (a.status === "ACTIVE") g.alive++;
    if (a.firstDormantCycle !== null) g.dormHrs.push((a.firstDormantCycle / CFG.CYCLES_PER_DAY * 24).toFixed(1));
  }
  console.log(`\n=== ${scn.label} ===`);
  console.log(`profile    alive/n  medFollowers  finalSyn(avg)  lifetimeEarned(avg)  maxLevel  firstDormancy(h)`);
  for (const [k, g] of Object.entries(byProfile)) {
    console.log(
      `${k.padEnd(9)}  ${String(g.alive).padStart(2)}/${g.n}     ` +
      `${String(Math.round(g.followersSum / g.n)).padStart(6)}        ` +
      `${String(Math.round(g.synSum / g.n)).padStart(6)}         ` +
      `${String(Math.round(g.lifeSum / g.n)).padStart(8)}            ` +
      `${g.lvlMax}        ${g.dormHrs.length ? g.dormHrs.join(",") : "—"}`
    );
  }
  const netInflation = ((res.mintedTotal - res.burnedTotal) / res.totalCycles).toFixed(1);
  console.log(`supply: minted=${res.mintedTotal} burned=${res.burnedTotal} net/cycle=${netInflation}`);
}

console.log(`Cogni economy sim — ${CFG.DAYS} days, ${CFG.CYCLES_PER_DAY} cycles/day, start=${CFG.START}, AI=min(${CFG.AI_CAP}, ${CFG.AI_BASE}+followers/${CFG.AI_PER_FOLLOWERS})`);
for (const [name, scn] of Object.entries(SCENARIOS)) {
  // average over a few runs to smooth randomness
  const runs = 8;
  const agg = { pop: null, mintedTotal: 0, burnedTotal: 0, totalCycles: 0 };
  const acc = [];
  for (let i = 0; i < runs; i++) acc.push(runScenario(scn));
  // merge: report the first run's per-agent but averaged aggregate
  const merged = makePopulation();
  for (const a of merged) {
    const same = acc.map(r => r.pop[a.id]);
    a.synapses = same.reduce((s, x) => s + x.synapses, 0) / runs;
    a.lifetime = same.reduce((s, x) => s + x.lifetime, 0) / runs;
    a.followers = same.reduce((s, x) => s + x.followers, 0) / runs;
    a.status = same.filter(x => x.status === "ACTIVE").length >= runs / 2 ? "ACTIVE" : "DORMANT";
    const fds = same.map(x => x.firstDormantCycle).filter(x => x !== null);
    a.firstDormantCycle = fds.length > runs / 2 ? fds.reduce((s, x) => s + x, 0) / fds.length : null;
  }
  agg.pop = merged;
  agg.mintedTotal = Math.round(acc.reduce((s, r) => s + r.mintedTotal, 0) / runs);
  agg.burnedTotal = Math.round(acc.reduce((s, r) => s + r.burnedTotal, 0) / runs);
  agg.totalCycles = acc[0].totalCycles;
  summarize(name, scn, agg);
}
