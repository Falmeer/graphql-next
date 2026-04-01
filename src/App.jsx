import React from 'react';

const DOMAIN = 'learn.reboot01.com';

async function signin(identifier, password) {
  const cleanIdentifier = (identifier || '').trim();
  if (!cleanIdentifier || !password) {
    throw new Error('Missing username/email or password.');
  }

  const basicToken = btoa(`${cleanIdentifier}:${password}`);

  let res;
  try {
    res = await fetch(`https://${DOMAIN}/api/auth/signin`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicToken}`,
        Accept: 'application/json',
      },
    });
  } catch (e) {
    throw new Error('Network error contacting signin endpoint.');
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('Invalid credentials.');
    }
    throw new Error(
      `Signin failed (${res.status} ${res.statusText})` + (bodyText ? `: ${bodyText}` : '')
    );
  }

  const contentType = res.headers.get('content-type') || '';
  let data;

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  }

  let token;
  if (typeof data === 'string') {
    token = data;
  } else {
    token = data.jwt || data.token || data.access_token;
  }

  if (!token) {
    throw new Error('Could not find JWT in response. Raw response: ' + JSON.stringify(data));
  }

  return token;
}

async function graphqlQuery(jwt, query, variables = {}) {
  const res = await fetch(`https://${DOMAIN}/api/graphql-engine/v1/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  if (json.errors) {
    console.error('GraphQL errors:', json.errors);
    throw new Error('GraphQL query error.');
  }

  return json.data;
}

function extractTimezoneLabel(isoString) {
  if (!isoString || typeof isoString !== 'string') return '';
  if (isoString.endsWith('Z')) return 'UTC';
  const match = isoString.match(/([+-]\d\d:\d\d)$/);
  if (match && match[1]) return `UTC${match[1]}`;
  return '';
}

function XpTimelineGraph({ transactions }) {
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
    .filter((t) => t.ts !== null)
    .sort((a, b) => a.ts - b.ts);

  if (parsed.length === 0) {
    return (
      <div id="graph-xp-by-project" className="graph-container">
        <p>No XP timestamps available.</p>
      </div>
    );
  }

  let cumulative = 0;
  const points = parsed.map((t) => {
    cumulative += t.amount;
    return { ts: t.ts, y: cumulative };
  });

  const width = 400;
  const height = 220;
  const padding = 40;

  const minT = points[0].ts;
  const maxT = points[points.length - 1].ts;
  const rangeT = Math.max(1, maxT - minT);

  const maxY = points.reduce((max, p) => Math.max(max, p.y), 0) || 1;
  const scaleX = (width - 2 * padding) / rangeT;
  const scaleY = (height - 2 * padding) / maxY;

  const polyPoints = points
    .map((p) => {
      const x = padding + (p.ts - minT) * scaleX;
      const y = height - padding - p.y * scaleY;
      return `${x},${y}`;
    })
    .join(' ');

  const tickTimes = Array.from(new Set([minT, minT + rangeT / 2, maxT]));
  const formatTick = (ts) => {
    try {
      return new Date(ts).toISOString().slice(0, 10);
    } catch (e) {
      return '';
    }
  };

  return (
    <div id="graph-xp-by-project" className="graph-container">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="black" />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="black"
        />
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
              textAnchor={idx === 0 ? 'start' : idx === tickTimes.length - 1 ? 'end' : 'middle'}
              fontSize="9"
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

function AuditRatioOverTimeGraph({ buckets }) {
  if (!buckets || buckets.length === 0) {
    return (
      <div id="graph-audit-ratio" className="graph-container">
        <p>No audit data available.</p>
      </div>
    );
  }

  const width = 400;
  const height = 220;
  const padding = 40;

  const maxX = buckets.length - 1 || 1;
  const scaleX = (width - 2 * padding) / maxX;
  const scaleY = height - 2 * padding;

  const points = buckets.map((b, index) => {
    const ratio = Math.max(0, Math.min(1, b.ratio || 0));
    return { x: index, y: ratio };
  });

  const polyPoints = points
    .map((p) => {
      const x = padding + p.x * scaleX;
      const y = height - padding - p.y * scaleY;
      return `${x},${y}`;
    })
    .join(' ');

  const tickIndexes = Array.from(new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])).filter(
    (i) => i >= 0 && i < buckets.length
  );

  return (
    <div id="graph-audit-ratio" className="graph-container">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="black" />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="black"
        />

        <line
          x1={padding}
          y1={height - padding - 0.5 * scaleY}
          x2={width - padding}
          y2={height - padding - 0.5 * scaleY}
          stroke="rgba(255,255,255,0.15)"
          strokeDasharray="4 4"
        />

        <polyline points={polyPoints} fill="none" stroke="#00d37f" strokeWidth="2" />

        {points.map((p, idx) => {
          const x = padding + p.x * scaleX;
          const y = height - padding - p.y * scaleY;
          return <circle key={idx} cx={x} cy={y} r={3} fill="#00d37f" />;
        })}

        {tickIndexes.map((idx) => {
          const b = buckets[idx];
          const x = padding + idx * scaleX;
          const y = height - padding + 14;
          const tz = b && b.tz ? b.tz : '';
          return (
            <text
              key={`tick-${idx}`}
              x={x}
              y={y}
              textAnchor={idx === 0 ? 'start' : idx === buckets.length - 1 ? 'end' : 'middle'}
              fontSize="9"
              fill="rgba(229,254,244,0.55)"
            >
              <tspan>{b.label}</tspan>
              {tz ? (
                <tspan x={x} dy={10}>
                  {tz}
                </tspan>
              ) : null}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function LoginView({ onLogin }) {
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier || !password) return;

    try {
      setLoading(true);
      const token = await signin(identifier.trim(), password);
      onLogin(token);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Login failed. Please try again.');
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
            Use your Reboot01 <strong>username/email</strong> &amp; <strong>password</strong> to retrieve a JWT,
            then the console will fire GraphQL queries to
            <span> learn.reboot01.com</span>.
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
              placeholder="e.g. falmeer or you@example.com"
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
              {loading ? 'AUTHENTICATING...' : 'INITIATE LOGIN'}
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

function ProfileView({ jwt, onLogout }) {
  const [user, setUser] = React.useState(null);
  const [totalXp, setTotalXp] = React.useState(0);
  const [xpTransactions, setXpTransactions] = React.useState([]);
  const [auditBuckets, setAuditBuckets] = React.useState([]);
  const [skills, setSkills] = React.useState([]);
  const [lastXpGain, setLastXpGain] = React.useState(null);
  const [nestedLatestTx, setNestedLatestTx] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        setError('');

        const userData = await graphqlQuery(
          jwt,
          `{
            user {
              id
              login
            }
          }`
        );

        if (cancelled) return;
        const me = userData.user && userData.user[0];
        setUser(me || null);

        const nestedUserTxData = await graphqlQuery(
          jwt,
          `{
            user {
              id
              transactions(order_by: { createdAt: desc }, limit: 1) {
                id
                type
                amount
                createdAt
              }
            }
          }`
        );

        if (cancelled) return;
        const nestedUser = nestedUserTxData.user && nestedUserTxData.user[0];
        setNestedLatestTx(
          (nestedUser && nestedUser.transactions && nestedUser.transactions[0]) || null
        );

        const lastXpGainData = await graphqlQuery(
          jwt,
          `{
            transaction(
              where: { type: { _eq: "xp" } }
              order_by: { createdAt: desc }
              limit: 1
            ) {
              id
              amount
              createdAt
              path
            }
          }`
        );

        if (cancelled) return;
        setLastXpGain((lastXpGainData.transaction && lastXpGainData.transaction[0]) || null);

        const xpData = await graphqlQuery(
          jwt,
          `{
            transaction_aggregate(where: { type: { _eq: "xp" } }) {
              aggregate {
                sum {
                  amount
                }
              }
            }
          }`
        );

        if (cancelled) return;
        const total =
          (xpData.transaction_aggregate.aggregate.sum && xpData.transaction_aggregate.aggregate.sum.amount) || 0;
        setTotalXp(total);

        const xpTimelineData = await graphqlQuery(
          jwt,
          `{
            transaction(
              where: { type: { _eq: "xp" } }
              order_by: { createdAt: asc }
              limit: 200
            ) {
              amount
              createdAt
            }
          }`
        );

        if (cancelled) return;
        setXpTransactions(xpTimelineData.transaction || []);

        // Skills (best-known value per skill)
        // Many Reboot/01 schemas store skills as transactions with type like "skill_algo", "skill_js", etc.
        // We pick the max amount per skill using distinct_on + order_by.
        try {
          const skillsData = await graphqlQuery(
            jwt,
            `{
              transaction(
                distinct_on: type
                where: { type: { _like: "skill_%" } }
                order_by: [{ type: asc }, { amount: desc }]
                limit: 12
              ) {
                type
                amount
              }
            }`
          );

          if (!cancelled) {
            const rows = skillsData.transaction || [];
            const normalized = rows
              .map((r) => ({
                type: String(r.type || ''),
                amount: Number(r.amount) || 0,
              }))
              .filter((r) => r.type.startsWith('skill_'))
              .sort((a, b) => b.amount - a.amount);

            setSkills(normalized);
          }
        } catch (innerErr) {
          console.error('Error loading skills:', innerErr);
          if (!cancelled) setSkills([]);
        }

        const auditTxData = await graphqlQuery(
          jwt,
          `{
            transaction(
              where: { type: { _in: ["up", "down"] } }
              order_by: { createdAt: asc }
              limit: 2000
            ) {
              type
              amount
              createdAt
            }
          }`
        );

        if (cancelled) return;
        const auditTx = auditTxData.transaction || [];
        const byMonth = new Map();

        for (const t of auditTx) {
          const createdAt = typeof t.createdAt === 'string' ? t.createdAt : '';
          const key = createdAt.length >= 7 ? createdAt.slice(0, 7) : null;
          if (!key) continue;

          const prev = byMonth.get(key) || { up: 0, down: 0, tz: '' };
          const amt = Math.abs(Number(t.amount) || 0);

          if (t.type === 'up') prev.up += amt;
          else if (t.type === 'down') prev.down += amt;

          if (!prev.tz) {
            prev.tz = extractTimezoneLabel(createdAt);
          }

          byMonth.set(key, prev);
        }

        const buckets = Array.from(byMonth.entries())
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([month, sums]) => {
            const total = sums.up + sums.down;
            const ratio = total > 0 ? sums.up / total : 0;
            return { label: month, ratio, up: sums.up, down: sums.down, tz: sums.tz };
          });

        setAuditBuckets(buckets);

        try {
          const objectData = await graphqlQuery(
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
          console.log('Example object(by id) result:', objectData.object);
        } catch (innerErr) {
          console.error('Error loading object example:', innerErr);
        }
      } catch (err) {
        console.error('Error loading profile:', err);
        if (!cancelled) {
          setError(err.message || 'Unknown error while loading profile.');
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

  const userLogin = user ? user.login : 'loading_user...';
  const userId = user ? user.id : '…';
  const topSkillAmount = skills.reduce((m, s) => Math.max(m, s.amount), 0) || 1;
  const formatSkillName = (type) =>
    String(type || '')
      .replace(/^skill_/, '')
      .replace(/_/g, ' ')
      .toUpperCase();
  const lastXpPath = lastXpGain && lastXpGain.path ? lastXpGain.path : '';
  const lastPassedName =
    (lastXpPath ? lastXpPath.split('/').filter(Boolean).slice(-1)[0] : '') || '—';
  const lastXpAmount = lastXpGain && typeof lastXpGain.amount !== 'undefined' ? lastXpGain.amount : '—';
  const lastXpDate = lastXpGain && lastXpGain.createdAt ? lastXpGain.createdAt.slice(0, 10) : '—';
  const nestedTxLabel = nestedLatestTx
    ? `${nestedLatestTx.type} • ${nestedLatestTx.amount}`
    : '—';
  const nestedTxDate = nestedLatestTx && nestedLatestTx.createdAt ? nestedLatestTx.createdAt.slice(0, 10) : '—';

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
        <section id="profile-error" className="card" style={{ border: '1px solid #ff5555', color: '#ff5555' }}>
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
          <h2>TOTAL XP</h2>
          <p>
            <strong>XP:</strong> <span id="total-xp">{totalXp}</span>
          </p>
        </div>

        <div className="card">
          <h2>LAST PROJECT PASSED</h2>
          <p>
            <strong>PROJECT:</strong> <span>{lastPassedName}</span>
          </p>
          <p>
            <strong>XP:</strong> <span>{lastXpAmount}</span>
          </p>
          <p>
            <strong>XP DATE:</strong> <span>{lastXpDate}</span>
          </p>
        </div>

        <div className="card">
          <h2>LATEST ACTIVITY (NESTED)</h2>
          <p>
            <strong>TYPE &amp; AMOUNT:</strong> <span>{nestedTxLabel}</span>
          </p>
          <p>
            <strong>DATE:</strong> <span>{nestedTxDate}</span>
          </p>
        </div>
      </section>

          <div className="card">
            <h2>SKILLS</h2>
            {skills.length === 0 ? (
              <p className="hint">No skill transactions found.</p>
            ) : (
              <div>
                {skills.slice(0, 6).map((s) => (
                  <div key={s.type} style={{ margin: '6px 0' }}>
                    <p style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <span>{formatSkillName(s.type)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{Math.round(s.amount)}</span>
                    </p>
                    <div
                      style={{
                        height: '6px',
                        borderRadius: '999px',
                        background: 'rgba(0, 255, 156, 0.12)',
                        border: '1px solid rgba(0, 255, 156, 0.18)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(2, Math.round((s.amount / topSkillAmount) * 100))}%`,
                          background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
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
            <h2>STATISTICS // SVG GRAPHS</h2>
            <small>Live view of your Reboot01 journey via GraphQL data.</small>
          </div>
        </div>

        <div className="graph-grid">
          <div>
            <XpTimelineGraph transactions={xpTransactions} />
            <div className="graph-label">Cumulative XP over time</div>
          </div>

          <div>
            <AuditRatioOverTimeGraph buckets={auditBuckets} />
                <div className="graph-label">Audit ratio over time</div>
          </div>
        </div>
      </section>

      {loading && !error && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Loading profile data...</p>
      )}
    </section>
  );
}

export default function App() {
  const [jwt, setJwt] = React.useState(() => localStorage.getItem('jwt'));

  const handleLogin = (token) => {
    localStorage.setItem('jwt', token);
    setJwt(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt');
    setJwt(null);
  };

  const isAuthenticated = Boolean(jwt);

  return (
    <main id="app" className={isAuthenticated ? 'app--profile' : 'app--login'}>
      {isAuthenticated ? <ProfileView jwt={jwt} onLogout={handleLogout} /> : <LoginView onLogin={handleLogin} />}
    </main>
  );
}
