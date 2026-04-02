"use client";

import React from "react";

const DOMAIN = "learn.reboot01.com";

type Transaction = {
  id?: number | null;
  type?: string | null;
  amount: number;
  createdAt: string;
  path?: string | null;
  object?: {
    name?: string | null;
    type?: string | null;
  } | null;
};

type Skill = {
  type: string;
  amount: number;
};

type ProjectXpItem = {
  project: string;
  xp: number;
};

type UserQueryData = {
  user: Array<{ id: number; login: string; auditRatio?: number | null }>;
};

type LatestXpGainQueryData = {
  transaction: Transaction[];
};

type TotalXpAggregateQueryData = {
  transaction_aggregate: {
    aggregate: {
      sum: {
        amount: number | null;
      } | null;
    };
  };
};

type XpTimelineQueryData = {
  transaction: Array<Pick<Transaction, "amount" | "createdAt" | "path" | "object">>;
};

type SkillsQueryData = {
  transaction: Array<{ type: string; amount: number }>;
};

type ObjectByIdQueryData = {
  object: Array<{ id: number; name: string; type: string }>;
};

async function signin(identifier: string, password: string) {
  const cleanIdentifier = (identifier || "").trim();
  if (!cleanIdentifier || !password) {
    throw new Error("Missing username/email or password.");
  }

  const basicToken = btoa(`${cleanIdentifier}:${password}`);

  let res: Response;
  try {
    res = await fetch(`https://${DOMAIN}/api/auth/signin`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicToken}`,
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error("Network error contacting signin endpoint.");
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid credentials.");
    }
    throw new Error(
      `Signin failed (${res.status} ${res.statusText})` +
        (bodyText ? `: ${bodyText}` : "")
    );
  }

  const contentType = res.headers.get("content-type") || "";
  let data: unknown;

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  let token: string | undefined;
  if (typeof data === "string") {
    token = data;
  } else if (data && typeof data === "object") {
    const record = data as Record<string, string>;
    token = record.jwt || record.token || record.access_token;
  }

  if (!token) {
    throw new Error(
      "Could not find JWT in response. Raw response: " +
        JSON.stringify(data)
    );
  }

  return token;
}

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: unknown;
};

async function graphqlQuery<TData extends Record<string, unknown>>(
  jwt: string,
  query: string,
  variables: Record<string, unknown> = {}
) {
  const res = await fetch(`https://${DOMAIN}/api/graphql-engine/v1/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as GraphQLResponse<TData>;

  if (json.errors) {
    console.error("GraphQL errors:", json.errors);
    throw new Error("GraphQL query error.");
  }

  if (!json.data) {
    throw new Error("GraphQL response missing data.");
  }

  return json.data;
}

function formatWithK(value: number) {
  const abs = Math.abs(value);
  if (abs < 1000) return `${Math.round(value)}`;
  const scaled = value / 1000;
  return `${scaled.toFixed(1)}K`;
}

function XpTimelineGraph({
  transactions,
}: {
  transactions: Transaction[];
}) {
  if (!transactions || transactions.length === 0) {
    return (
      <div id="graph-xp-by-project" className="graph-container">
        <p>No XP data available.</p>
      </div>
    );
  }

  const parsed = transactions
    .map((t) => {
      const ts = Date.parse(t.createdAt);
      return {
        amount: Number(t.amount) || 0,
        ts: Number.isFinite(ts) ? ts : null,
      };
    })
    .filter((t): t is { amount: number; ts: number } => t.ts !== null)
    .sort((a, b) => a.ts - b.ts);

  if (parsed.length === 0) {
    return (
      <div id="graph-xp-by-project" className="graph-container">
        <p>No XP timestamps available.</p>
      </div>
    );
  }

  const points = parsed.reduce<Array<{ ts: number; y: number }>>((acc, t) => {
    const gain = Math.max(0, t.amount);
    const prevY = acc.length ? acc[acc.length - 1].y : 0;
    acc.push({ ts: t.ts, y: prevY + gain });
    return acc;
  }, []);

  const width = 400;
  const height = 220;
  const padding = 40;

  const minT = points[0].ts;
  const maxT = points[points.length - 1].ts;
  const rangeT = Math.max(1, maxT - minT);

  const maxY = points.reduce((max, p) => Math.max(max, p.y), 0) || 1;
  const scaleX = (width - 2 * padding) / rangeT;
  const scaleY = (height - 2 * padding) / maxY;
  const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];

  const polyPoints = points
    .map((p) => {
      const x = padding + (p.ts - minT) * scaleX;
      const y = height - padding - p.y * scaleY;
      return `${x},${y}`;
    })
    .join(" ");

  const tickTimes = [
    minT,
    minT + rangeT * 0.25,
    minT + rangeT * 0.5,
    minT + rangeT * 0.75,
    maxT,
  ];
  const formatTick = (ts: number) => {
    try {
      return new Date(ts).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  };

  return (
    <div id="graph-xp-by-project" className="graph-container">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="rgba(0,255,156,0.9)"
          strokeWidth="1.5"
        />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="rgba(0,255,156,0.5)"
        />

        {yTicks.map((v, idx) => {
          const y = height - padding - v * scaleY;
          return (
            <g key={`xp-y-${idx}`}>
              <line
                x1={padding - 4}
                y1={y}
                x2={padding}
                y2={y}
                stroke="rgba(0,255,156,0.9)"
              />
              <text
                x={padding - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="rgba(0,255,156,0.9)"
              >
                {formatWithK(v)}
              </text>
            </g>
          );
        })}
        <polyline points={polyPoints} fill="none" stroke="blue" strokeWidth="2" />
        {points.map((p, idx) => {
          const x = padding + (p.ts - minT) * scaleX;
          const y = height - padding - p.y * scaleY;
          return <circle key={idx} cx={x} cy={y} r={3} fill="blue" />;
        })}

        {tickTimes.map((ts, idx) => {
          const x = padding + (ts - minT) * scaleX;
          const y = height - padding + 14;
          const label = formatTick(ts);
          return (
            <text
              key={`xptick-${idx}`}
              x={x}
              y={y}
              textAnchor={
                idx === 0 ? "start" : idx === tickTimes.length - 1 ? "end" : "middle"
              }
              fontSize="7"
              fill="rgba(229,254,244,0.55)"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function XpByProjectHorizontalBarChart({
  items,
}: {
  items: ProjectXpItem[];
}) {
  if (!items || items.length === 0) {
    return (
      <div id="graph-xp-by-module-project" className="graph-container">
        <p>No bh_module project XP data available.</p>
      </div>
    );
  }

  const sortedItems = [...items].sort((a, b) => b.xp - a.xp);
  const maxXp = Math.max(1, ...sortedItems.map((i) => i.xp));

  // SVG chart sizing (kept simple + scrollable inside the container)
  const width = 560;
  const rowHeight = 26;
  const paddingTop = 18;
  const paddingBottom = 18;
  const labelWidth = 220;
  const valueWidth = 70;
  const barGap = 10;
  const barStartX = labelWidth;
  const barMaxWidth = width - labelWidth - valueWidth - barGap;
  const height = paddingTop + sortedItems.length * rowHeight + paddingBottom;

  return (
    <div
      id="graph-xp-by-module-project"
      className="graph-container"
      style={{ minHeight: "320px", height: "330px", alignItems: "stretch" }}
    >
      <div style={{ width: "100%", height: "100%", overflowY: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: `${height}px`, display: "block" }}
          role="img"
          aria-label="XP by project (horizontal bar chart)"
        >
          <defs>
            <linearGradient id="xpBarGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-strong)" />
            </linearGradient>
          </defs>

          {sortedItems.map((item, idx) => {
            const y = paddingTop + idx * rowHeight;
            const barWidth = Math.max(2, Math.round((item.xp / maxXp) * barMaxWidth));
            const label = String(item.project || "unknown");
            const value = formatWithK(item.xp);

            return (
              <g key={item.project}>
                <text
                  x={0}
                  y={y + 16}
                  fontSize="11"
                  fill="var(--text-main)"
                  textAnchor="start"
                >
                  {label}
                </text>

                <rect
                  x={barStartX}
                  y={y + 5}
                  width={barMaxWidth}
                  height={14}
                  rx={7}
                  fill="rgba(0, 255, 156, 0.12)"
                  stroke="rgba(0, 255, 156, 0.18)"
                />
                <rect
                  x={barStartX}
                  y={y + 5}
                  width={barWidth}
                  height={14}
                  rx={7}
                  fill="url(#xpBarGradient)"
                />

                <text
                  x={barStartX + barMaxWidth + barGap}
                  y={y + 16}
                  fontSize="11"
                  fill="var(--text-muted)"
                  textAnchor="start"
                >
                  {value}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: (token: string) => void }) {
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!identifier || !password) return;

    try {
      setLoading(true);
      const token = await signin(identifier.trim(), password);
      onLogin(token);
    } catch (err: unknown) {
      console.error(err);
      let message = "Login failed. Please try again.";
      if (err instanceof Error) message = err.message;
      else if (typeof err === "string") message = err;
      else if (err && typeof err === "object") {
        const maybeMessage = (err as { message?: unknown }).message;
        if (typeof maybeMessage === "string") message = maybeMessage;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="login-view">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">&gt;</div>
          <div className="brand-text">
            <h1>REBOOT01 // PROFILE</h1>
            <p>GraphQL hacking console • Access restricted</p>
          </div>
        </div>
        <div className="status-chip">
          <span className="status-dot" />
          STATUS: AWAITING AUTH
        </div>
      </header>

      <div className="login-main">
        <div className="login-hero">
          <h2 className="login-hero-title">
            AUTH<span>()</span> &amp; QUERY<span>()</span>
          </h2>
          <p className="login-hero-sub">
            Use your Reboot01 <strong>username/email</strong> &amp;{" "}
            <strong>password</strong> to retrieve a JWT, then the console will
            fire GraphQL queries to <span> learn.reboot01.com</span>.
          </p>

          <div className="login-terminal">
            <div className="term-line">
              <span>&gt; booting environment...</span>
            </div>
            <div className="term-line">
              <span>&gt; target:</span> https://learn.reboot01.com/api/graphql-engine/v1/graphql
            </div>
            <div className="term-line">
              <span>&gt; proto:</span> JWT Bearer &amp; GraphQL
            </div>
            <div className="term-line">
              <span>&gt; waiting for credentials</span>
              <span className="cursor" />
            </div>
          </div>
        </div>

        <div className="login-form-card">
          <h2>LOGIN CONSOLE</h2>
          <p className="hint">
            Input <strong>username or email</strong> and <strong>password</strong> to request a token.
          </p>

          <form id="login-form" onSubmit={handleSubmit}>
            <label htmlFor="login-identifier">USERNAME / EMAIL</label>
            <input
              type="text"
              id="login-identifier"
              autoComplete="username"
              placeholder="username or email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <label htmlFor="login-password">PASSWORD</label>
            <input
              type="password"
              id="login-password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? "AUTHENTICATING..." : "INITIATE LOGIN"}
            </button>
          </form>
          {error && (
            <p id="login-error" className="error">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ProfileView({ jwt, onLogout }: { jwt: string; onLogout: () => void }) {
  const [user, setUser] = React.useState<{
    id: number;
    login: string;
    auditRatio?: number | null;
  } | null>(null);
  const [totalXp, setTotalXp] = React.useState(0);
  const [xpTransactions, setXpTransactions] = React.useState<Transaction[]>([]);
  const [xpByProject, setXpByProject] = React.useState<ProjectXpItem[]>([]);
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [lastXpGain, setLastXpGain] = React.useState<Transaction | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        setError("");

        // QUERY 1 (basic / non-nested): Get the authenticated user's basic info.
        // Purpose: show identification on the profile + read auditRatio for display.
        const userData = await graphqlQuery<UserQueryData>(
          jwt,
          `{
            user {
              id
              login
              auditRatio
            }
          }`
        );

        if (cancelled) return;
        const me = userData.user && userData.user[0];
        setUser(me || null);
        if (!me?.id) {
          throw new Error("Could not resolve authenticated user id.");
        }

        // QUERY 2 (nested + variables/arguments): Get the latest XP transaction for THIS user.
        // Purpose: show the most recent XP gain (project name, date, amount).
        // Notes: uses GraphQL variables ($userId) + filtering (where) + sorting + limit.
        const lastXpGainData = await graphqlQuery<LatestXpGainQueryData>(
          jwt,
          `query ($userId: Int!) {
            transaction(
              where: {
                userId: { _eq: $userId }
                type: { _eq: "xp" }
                _or: [
                  { path: { _ilike: "%/bh_module/%" } }
                  { path: { _ilike: "%/bh-module/%" } }
                ]
                _and: [
                  { path: { _nilike: "%piscine%" } }
                  { path: { _nilike: "%piscene%" } }
                ]
              }
              order_by: { createdAt: desc }
              limit: 1
            ) {
              id
              amount
              createdAt
              path
              object {
                name
                type
              }
            }
          }`,
          { userId: me.id }
        );

        if (cancelled) return;
        setLastXpGain((lastXpGainData.transaction && lastXpGainData.transaction[0]) || null);

        // QUERY 3 (aggregate query + variables): Compute TOTAL XP for THIS user.
        // Purpose: show one number (total XP) using transaction_aggregate -> sum(amount).
        const xpData = await graphqlQuery<TotalXpAggregateQueryData>(
          jwt,
          `query ($userId: Int!) {
            transaction_aggregate(
              where: {
                userId: { _eq: $userId }
                type: { _eq: "xp" }
                _or: [
                  { path: { _ilike: "%/bh_module/%" } }
                  { path: { _ilike: "%/bh-module/%" } }
                ]
                _and: [
                  { path: { _nilike: "%piscine%" } }
                  { path: { _nilike: "%piscene%" } }
                ]
              }
            ) {
              aggregate {
                sum {
                  amount
                }
              }
            }
          }`,
          { userId: me.id }
        );

        if (cancelled) return;
        const total =
          (xpData.transaction_aggregate.aggregate.sum &&
            xpData.transaction_aggregate.aggregate.sum.amount) || 0;
        setTotalXp(total);

        // QUERY 4 (list query + variables): Fetch XP transactions over time for a graph.
        // Purpose: build an SVG timeline graph (xp vs time) + group XP by project path.
        // Notes: ordered ascending so the graph progresses left-to-right.
        const xpTimelineData = await graphqlQuery<XpTimelineQueryData>(
          jwt,
          `query ($userId: Int!) {
            transaction(
              where: {
                userId: { _eq: $userId }
                type: { _eq: "xp" }
                _or: [
                  { path: { _ilike: "%/bh_module/%" } }
                  { path: { _ilike: "%/bh-module/%" } }
                ]
                _and: [
                  { path: { _nilike: "%piscine%" } }
                  { path: { _nilike: "%piscene%" } }
                ]
              }
              order_by: { createdAt: asc }
              limit: 200
            ) {
              amount
              createdAt
              path
              object {
                name
                type
              }
            }
          }`,
          { userId: me.id }
        );

        if (cancelled) return;
        const xpRows = xpTimelineData.transaction || [];
        setXpTransactions(xpRows);

        const byProject = new Map<string, number>();
        for (const row of xpRows) {
          // Only count real projects (exclude checkpoints/other object types)
          if (row.object?.type !== "project") continue;

          const path = typeof row.path === "string" ? row.path : "";
          const projectName =
            (row.object?.name && String(row.object.name).trim()) ||
            path.split("/").filter(Boolean).slice(-1)[0] ||
            "unknown";
          const amount = Math.max(0, Number(row.amount) || 0);
          byProject.set(projectName, (byProject.get(projectName) || 0) + amount);
        }
        setXpByProject(
          Array.from(byProject.entries()).map(([project, xp]) => ({ project, xp }))
        );

        try {
          // QUERY 5 (list query + variables + distinct_on): Fetch top skills.
          // Purpose: show "skill_*" transactions, keeping the best (max amount) per skill type.
          // Notes: distinct_on + order_by chooses the highest amount for each skill type.
          const skillsData = await graphqlQuery<SkillsQueryData>(
            jwt,
            `query ($userId: Int!) {
              transaction(
                distinct_on: type
                where: { userId: { _eq: $userId }, type: { _like: "skill_%" } }
                order_by: [{ type: asc }, { amount: desc }]
                limit: 200
              ) {
                type
                amount
              }
            }`,
            { userId: me.id }
          );

          if (!cancelled) {
            const rows = skillsData.transaction || [];
            const normalized = rows
              .map((r) => ({
                type: String(r.type || ""),
                amount: Number(r.amount) || 0,
              }))
              .filter((r: Skill) => r.type.startsWith("skill_"))
              .sort((a: Skill, b: Skill) => b.amount - a.amount);

              setSkills(normalized.slice(0, 10));
          }
        } catch (innerErr) {
          console.error("Error loading skills:", innerErr);
          if (!cancelled) setSkills([]);
        }

        try {
          // QUERY 6 (with variables/arguments): Example "object by id" query.
          // Purpose: demonstrate argument-based filtering (where id = $id).
          const objectData = await graphqlQuery<ObjectByIdQueryData>(
            jwt,
            `query ($id: Int!) {
              object(where: { id: { _eq: $id } }) {
                id
                name
                type
              }
            }`,
            { id: 1 }
          );
          console.log("Example object(by id) result:", objectData.object);
        } catch (innerErr) {
          console.error("Error loading object example:", innerErr);
        }
      } catch (err: unknown) {
        console.error("Error loading profile:", err);
        if (!cancelled) {
          let message = "Unknown error while loading profile.";
          if (err instanceof Error) message = err.message;
          else if (typeof err === "string") message = err;
          else if (err && typeof err === "object") {
            const maybeMessage = (err as { message?: unknown }).message;
            if (typeof maybeMessage === "string") message = maybeMessage;
          }
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (jwt) {
      loadProfile();
    }

    return () => {
      cancelled = true;
    };
  }, [jwt]);

  const userLogin = user ? user.login : "loading_user...";
  const userId = user ? user.id : "…";
  const currentAuditRatio = Number(user?.auditRatio) || 0;
  const topSkillAmount = skills.reduce((m, s) => Math.max(m, s.amount), 0) || 1;
  const formatSkillName = (type: string) =>
    String(type || "")
      .replace(/^skill_/, "")
      .replace(/_/g, " ")
      .toUpperCase();
  const lastXpPath = lastXpGain && lastXpGain.path ? lastXpGain.path : "";
  const lastPassedName =
    (lastXpGain?.object?.name && String(lastXpGain.object.name).trim()) ||
    (lastXpPath ? lastXpPath.split("/").filter(Boolean).slice(-1)[0] : "") ||
    "—";
  const lastXpAmount =
    lastXpGain && typeof lastXpGain.amount !== "undefined" ? lastXpGain.amount : "—";
  const lastXpDate = lastXpGain && lastXpGain.createdAt ? lastXpGain.createdAt.slice(0, 10) : "—";
  const passedProjects = xpByProject.filter((p) => p.project !== "unknown" && p.xp > 0);
  const totalProjectsPassed = passedProjects.length;
  const topProject = passedProjects.reduce<ProjectXpItem | null>(
    (best, item) => (!best || item.xp > best.xp ? item : best),
    null
  );

  return (
    <section id="profile-view">
      <header>
        <div className="profile-title-block">
          <h1 id="user-login">{userLogin}</h1>
          <p id="user-subtitle">Reboot01 Bahrain • My GraphQL journey</p>
        </div>
        <button id="logout-btn" onClick={onLogout}>
          LOGOUT
        </button>
      </header>

      {error && (
        <section
          id="profile-error"
          className="card"
          style={{ border: "1px solid #ff5555", color: "#ff5555" }}
        >
          <strong>Profile load error:</strong> <span>{error}</span>
        </section>
      )}

      <section className="info-sections">
        <div className="card">
          <h2>BASIC USER DATA</h2>
          <p>
            <strong>ID:</strong> <span id="user-id">{userId}</span>
          </p>
          <p>
            <strong>LOGIN:</strong> <span id="user-login-info">{userLogin}</span>
          </p>
        </div>

        <div className="card">
          <h2>Current XP and AuditRatio</h2>
          <p>
            <strong>XP:</strong> <span id="total-xp">{Math.round(totalXp).toLocaleString()}</span>
          </p>
          <p>
            <strong>AUDIT RATIO:</strong>{" "}
            <span>{currentAuditRatio > 0 ? currentAuditRatio.toFixed(1) : "—"}</span>
          </p>
        </div>

        <div className="card">
          <h2>LAST PROJECT PASSED</h2>
          <p>
            <strong>PROJECT:</strong> <span>{lastPassedName}</span>
          </p>
          <p>
            <strong>XP:</strong>{" "}
            <span>{lastXpAmount === "—" ? "—" : formatWithK(Number(lastXpAmount) || 0)}</span>
          </p>
          <p>
            <strong>XP DATE:</strong> <span>{lastXpDate}</span>
          </p>
        </div>

        <div className="card">
          <h2>PROJECT SUMMARY</h2>
          <p>
            <strong>TOTAL PROJECTS PASSED:</strong> <span>{totalProjectsPassed}</span>
          </p>
          <p>
            <strong>HIGHEST XP PROJECT:</strong>{" "}
            <span>{topProject ? `${topProject.project} (${formatWithK(topProject.xp)})` : "—"}</span>
          </p>
        </div>
      </section>

      <div className="card skills-card">
        <h2>SKILLS (TOP 10)</h2>
        {skills.length === 0 ? (
          <p className="hint">No skill transactions found.</p>
        ) : (
          <div className="skills-scroll">
            {skills.map((s) => (
              <div key={s.type} style={{ margin: "6px 0" }}>
                <p style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <span>{formatSkillName(s.type)}</span>
                  <span style={{ color: "var(--text-muted)" }}>{Math.round(s.amount)}</span>
                </p>
                <div
                  style={{
                    height: "6px",
                    borderRadius: "999px",
                    background: "rgba(0, 255, 156, 0.12)",
                    border: "1px solid rgba(0, 255, 156, 0.18)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(2, Math.round((s.amount / topSkillAmount) * 100))}%`,
                      background: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <section id="stats-section">
        <div id="stats-section-header">
          <div>
            <h2>STATISTICS</h2>
            <small>Live view of your Reboot01 journey via GraphQL data.</small>
          </div>
        </div>

        <div className="graph-grid">
          <div>
            <div className="graph-label" style={{ color: "#00ff9c", marginBottom: "8px" }}>
              Cumulative XP over time
            </div>
            <XpTimelineGraph transactions={xpTransactions} />
          </div>

          <div>
            <div className="graph-label" style={{ color: "#00ff9c", marginBottom: "8px" }}>
              XP gained by project
            </div>
            <XpByProjectHorizontalBarChart items={xpByProject} />
          </div>
        </div>
      </section>

      {loading && !error && (
        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
          Loading profile data...
        </p>
      )}
    </section>
  );
}

export default function App() {
  const [jwt, setJwt] = React.useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("jwt") : null
  );

  const handleLogin = (token: string) => {
    localStorage.setItem("jwt", token);
    setJwt(token);
  };

  const handleLogout = () => {
    localStorage.removeItem("jwt");
    setJwt(null);
  };

  const isAuthenticated = Boolean(jwt);

  return (
    <main id="app" className={isAuthenticated ? "app--profile" : "app--login"}>
      {isAuthenticated ? (
        <ProfileView jwt={jwt as string} onLogout={handleLogout} />
      ) : (
        <LoginView onLogin={handleLogin} />
      )}
    </main>
  );
}
