import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getJson } from "./api";

type Customer = {
  systemId: string;
  displayName: string;
  primaryEmail: string;
  primaryPhone: string;
  address: {
    addressLine1: string;
    city: string;
    county: string;
    stateProvCd: string;
    postalCode: string;
    countryCd: string;
  };
  accountNumber: string;
  /** OPEN + PENDING claims (from list API) */
  openClaimCount?: number;
};

type Policy = {
  systemId: string;
  policyNumber: string;
  lineCd: string;
  status: string;
  effectiveDt: string;
  expirationDt: string;
  customerSystemId: string;
  /**
   * GWire extension (not part of InsuranceNow). Per-category risk ranking from
   * an external ranker. All four keys are always present; `null` means no rank
   * yet (in review).
   */
  riskRanks?: {
    theft: string | null;
    fire: string | null;
    flood: string | null;
    earthquake: string | null;
  };
};

type ClaimRow = {
  systemId: string;
  claimNumber: string;
  status: string;
  lossDt: string;
  lossType: string;
  policySystemId: string;
};

type ClaimDetail = {
  systemId: string;
  claimNumber: string;
  status: string;
  lossDescription: string;
  paidAmount: number;
  reserveAmount: number;
};

type PortfolioStats = {
  claimCounts: { open: number; closed: number; denied: number };
  totalPaidAllClaims: number;
  totalOpenClaimsAmount: number;
  topCitiesByCustomers: { city: string; customerCount: number }[];
};

type MainView = "summary" | "customers";

function routeFromPath(pathname: string): {
  view: MainView;
  customerSegment: string | null;
  invalidPath: boolean;
} {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segments.length > 1) {
    return { view: "customers", customerSegment: null, invalidPath: true };
  }
  if (segments.length === 0) {
    return { view: "summary", customerSegment: null, invalidPath: false };
  }
  if (segments[0] === "summary") {
    return { view: "summary", customerSegment: null, invalidPath: false };
  }
  return { view: "customers", customerSegment: segments[0], invalidPath: false };
}

function claimPillClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "OPEN") return "pill pill--open";
  if (s === "PENDING") return "pill pill--pending";
  if (s === "CLOSED") return "pill pill--closed";
  if (s === "DENIED") return "pill pill--denied";
  return "pill pill--line";
}

function riskPillClass(display: string): string {
  switch (display) {
    case "LOW":
      return "pill pill--risk-low";
    case "MEDIUM":
      return "pill pill--risk-medium";
    case "HIGH":
      return "pill pill--risk-high";
    default:
      return "pill pill--risk-review";
  }
}

/** Keys match `Policy.riskRanks`. */
type RiskCategoryKey = "theft" | "fire" | "flood" | "earthquake";

type RiskRankValue = "LOW" | "MEDIUM" | "HIGH";

const RISK_OVERVIEW_ROWS: { key: RiskCategoryKey; label: string }[] = [
  { key: "theft", label: "Theft" },
  { key: "fire", label: "Fire" },
  { key: "flood", label: "Flood" },
  { key: "earthquake", label: "Earthquake" },
];

/** Highest severity wins when multiple policies differ. */
function worstRankAcrossPolicies(policies: Policy[], category: RiskCategoryKey): RiskRankValue | null {
  const order: Record<RiskRankValue, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  let best: RiskRankValue | null = null;
  for (const p of policies) {
    const v = p.riskRanks?.[category];
    if (v === "LOW" || v === "MEDIUM" || v === "HIGH") {
      if (!best || order[v] > order[best]) best = v;
    }
  }
  return best;
}

const RISK_CATEGORY_PILL_PREFIX: Record<RiskCategoryKey, string> = {
  theft: "THEFT RISK",
  fire: "FIRE RISK",
  flood: "FLOOD RISK",
  earthquake: "EARTHQUAKE RISK",
};

function riskPillLabel(category: RiskCategoryKey, display: string): string {
  const prefix = RISK_CATEGORY_PILL_PREFIX[category];
  return display === "IN_REVIEW" ? `${prefix}: In Review` : `${prefix}: ${display}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Panel({
  title,
  eyebrow,
  children,
  className = "",
  actions,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`in-panel ${className}`.trim()}>
      <div className="in-panel-header">
        <div>
          {eyebrow && <div className="panel-eyebrow">{eyebrow}</div>}
          <h2>{title}</h2>
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      <div className="in-panel-body">{children}</div>
    </section>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`metric-tile ${tone ? `metric-tile--${tone}` : ""}`.trim()}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function RiskMetricTile({ label, rank }: { label: string; rank: RiskRankValue | null }) {
  const rankTone =
    rank === "LOW" ? "risk-low" : rank === "MEDIUM" ? "risk-medium" : rank === "HIGH" ? "risk-high" : "risk-na";
  const value = rank ?? "N/A";
  return (
    <div className={`metric-tile metric-tile--risk metric-tile--${rankTone}`.trim()}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function TopBar({
  view,
  onHome,
  onSummary,
}: {
  view: MainView;
  onHome: () => void;
  onSummary: () => void;
}) {
  const navItems = [
    { label: "Home", active: view === "summary", onClick: onSummary },
    { label: "Quote/Policy" },
    { label: "Billing" },
    { label: "Claims" },
    { label: "Payables" },
    { label: "Commission" },
    { label: "Cabinets" },
    { label: "Operations" },
    { label: "Support" },
  ];

  return (
    <header className="app-header">
      <div className="brand">
        <button type="button" className="brand-mark" onClick={onHome} aria-label="Home - portfolio summary">
          <img className="brand-icon" src="/assets/icon.png" alt="" aria-hidden="true" />
          <span className="brand-guidewire">GUIDEWIRE</span>
          <span className="brand-product">InsuranceNow</span>
        </button>
      </div>
      <nav className="product-nav" aria-label="Product">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={item.active ? "product-nav-item active" : "product-nav-item"}
            onClick={item.onClick}
            disabled={!item.onClick}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="user-dot" aria-label="Current user" />
    </header>
  );
}

function LeftNav({
  view,
  query,
  onQueryChange,
  customers,
  customerSegment,
  loading,
  sidebarScrollRef,
  onScroll,
  onSummary,
  onSelectCustomer,
}: {
  view: MainView;
  query: string;
  onQueryChange: (value: string) => void;
  customers: Customer[];
  customerSegment: string | null;
  loading: boolean;
  sidebarScrollRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onSummary: () => void;
  onSelectCustomer: (id: string) => void;
}) {
  return (
    <aside className="left-rail">
      <div className="rail-search">
        <input
          className="search"
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search customers"
        />
        <span className="rail-search-button" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <div className="advanced-search">
        Advanced Search: <span>Policy</span> <span>Claims</span>
      </div>

      <nav className="side-nav" aria-label="Primary">
        <button
          type="button"
          className={view === "summary" ? "nav-item active" : "nav-item"}
          onClick={onSummary}
        >
          Dashboard
        </button>
      </nav>

      <div className="sidebar-section-title">Customers</div>
      <div ref={sidebarScrollRef} className="sidebar-scroll" onScroll={onScroll}>
        {loading && <p className="muted rail-loading">Loading...</p>}
        <ul className="list">
          {customers.map((c) => (
            <li key={c.systemId}>
              <button
                type="button"
                className={view === "customers" && c.systemId === customerSegment ? "row active" : "row"}
                onClick={() => onSelectCustomer(c.systemId)}
              >
                <span className="row-text">
                  <span className="name">{c.displayName}</span>
                  <span className="meta">
                    {c.address.city}, {c.address.county}
                  </span>
                </span>
                {(c.openClaimCount ?? 0) > 0 && (
                  <span className="row-open-pill row-open-pill--has" aria-label={`${c.openClaimCount} open claims`}>
                    {c.openClaimCount}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function RightActionRail() {
  const actions = ["Summary", "New Quote", "Make Payment", "Report Loss", "New Note", "Timeline"];

  return (
    <aside className="right-action-rail" aria-label="Quick actions">
      {actions.map((action) => (
        <button key={action} type="button" className="rail-action" disabled>
          <span className="rail-action-icon" aria-hidden>
            {action.slice(0, 1)}
          </span>
          <span>{action}</span>
        </button>
      ))}
    </aside>
  );
}

function EntityHeader({
  selected,
  customerPolicies,
  openClaims,
}: {
  selected: Customer;
  customerPolicies: Policy[];
  openClaims: number;
}) {
  const primaryPolicy = customerPolicies[0];

  return (
    <section className="entity-header">
      <div className="entity-header-title">
        <span className="entity-badge">ACCOUNT</span>
        <div>
          <div className="entity-name">{selected.displayName}</div>
          <div className="entity-subtitle">{selected.accountNumber}</div>
        </div>
      </div>
      <dl className="entity-meta">
        <div>
          <dt>Customer ID</dt>
          <dd>{selected.systemId}</dd>
        </div>
        <div>
          <dt>Primary Policy</dt>
          <dd>{primaryPolicy?.policyNumber ?? "None"}</dd>
        </div>
        <div>
          <dt>Policy Count</dt>
          <dd>{customerPolicies.length}</dd>
        </div>
        <div>
          <dt>Open Claims</dt>
          <dd>{openClaims > 0 ? <span className="pill pill--open">{openClaims} open</span> : "None"}</dd>
        </div>
      </dl>
      <div className="entity-actions">
        <button type="button" className="toolbar-button" disabled>
          View Notes
        </button>
        <button type="button" className="toolbar-button" disabled>
          More
        </button>
      </div>
    </section>
  );
}

function SummaryPage({
  stats,
  loading,
  statsErr,
}: {
  stats: PortfolioStats | null;
  loading: boolean;
  statsErr: string | null;
}) {
  return (
    <div className="page-stack summary-screen">
      <div className="workspace-title">
        <span>Business Intelligence</span>
        <h1>Experience Summary</h1>
      </div>
      {statsErr && <div className="banner error">{statsErr}</div>}
      {!stats && !statsErr && loading && <p className="muted">Loading portfolio stats...</p>}
      {stats && (
        <>
          <div className="summary-grid">
            <Panel title="Claims by status" eyebrow="Portfolio">
              <p className="muted small panel-note">Open includes OPEN and PENDING claims.</p>
              <div className="metric-row">
                <MetricTile label="Open" value={stats.claimCounts.open} tone="open" />
                <MetricTile label="Closed" value={stats.claimCounts.closed} tone="closed" />
                <MetricTile label="Denied" value={stats.claimCounts.denied} tone="denied" />
              </div>
            </Panel>
            <Panel title="Amounts" eyebrow="Claim Financials">
              <dl className="dense-dl">
                <div>
                  <dt>Total paid (all claims)</dt>
                  <dd>${formatCurrency(stats.totalPaidAllClaims)}</dd>
                </div>
                <div>
                  <dt>Total on open claims</dt>
                  <dd>
                    ${formatCurrency(stats.totalOpenClaimsAmount)}
                    <span className="muted small"> paid + reserve</span>
                  </dd>
                </div>
              </dl>
            </Panel>
          </div>
          <Panel title="Top 5 cities by customers" eyebrow="Distribution" className="cities-panel">
            <ol className="top-cities">
              {stats.topCitiesByCustomers.map((row) => (
                <li key={row.city}>
                  <span className="top-cities-name">{row.city}</span>
                  <span className="top-cities-count">{row.customerCount} customers</span>
                </li>
              ))}
            </ol>
          </Panel>
        </>
      )}
    </div>
  );
}

function CustomerPage({
  selected,
  unknownCustomer,
  customerSegment,
  customerPolicies,
  claims,
  openClaims,
  claimDetailId,
  claimDetail,
  onLoadClaimDetail,
  onHome,
}: {
  selected: Customer | null;
  unknownCustomer: boolean;
  customerSegment: string | null;
  customerPolicies: Policy[];
  claims: ClaimRow[];
  openClaims: number;
  claimDetailId: string | null;
  claimDetail: ClaimDetail | null;
  onLoadClaimDetail: (id: string) => void;
  onHome: () => void;
}) {
  if (unknownCustomer && customerSegment) {
    return (
      <div className="banner error">
        No customer with ID <strong>{customerSegment}</strong>. Choose someone from the list or go{" "}
        <button type="button" className="linkish" onClick={onHome}>
          home
        </button>
        .
      </div>
    );
  }

  if (!selected) {
    return (
      <Panel title="Customers" eyebrow="Account Search">
        <p className="muted">Select a customer to view policies and claims.</p>
      </Panel>
    );
  }

  return (
    <div className="page-stack">
      <EntityHeader selected={selected} customerPolicies={customerPolicies} openClaims={openClaims} />

      <div className="customer-grid">
        <Panel title="Account Information" className="account-panel">
          <dl className="info-grid">
            <div>
              <dt>Email</dt>
              <dd>{selected.primaryEmail}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{selected.primaryPhone}</dd>
            </div>
            <div>
              <dt>Billing Address</dt>
              <dd>
                {selected.address.addressLine1}
                <br />
                {selected.address.city}, {selected.address.stateProvCd} {selected.address.postalCode}
              </dd>
            </div>
            <div>
              <dt>County</dt>
              <dd>{selected.address.county}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Portfolio Overview" className="overview-panel">
          <div className="metric-row metric-row--compact">
            <MetricTile label="Policies" value={customerPolicies.length} />
            <MetricTile label="Claims" value={claims.length} />
            <MetricTile label="Open" value={openClaims} tone="open" />
          </div>
          <div className="portfolio-risk-block">
            <h3 className="portfolio-risk-heading">Risk</h3>
            <p className="muted small portfolio-risk-note">
              Across all policies; N/A when the category is still in review (no rank assigned).
            </p>
            <div className="metric-row metric-row--risk">
              {RISK_OVERVIEW_ROWS.map(({ key, label }) => (
                <RiskMetricTile key={key} label={label} rank={worstRankAcrossPolicies(customerPolicies, key)} />
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Policies" eyebrow="Policy File">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Policy #</th>
                <th>Line</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Term</th>
              </tr>
            </thead>
            <tbody>
              {customerPolicies.map((p) => {
                const theftDisplay = p.lineCd === "HOME" ? p.riskRanks?.theft ?? "IN_REVIEW" : null;
                return (
                  <tr key={p.systemId}>
                    <td className="link-cell">{p.policyNumber}</td>
                    <td>
                      <span className="pill pill--policy-line">{p.lineCd}</span>
                    </td>
                    <td>{p.status}</td>
                    <td>
                      {theftDisplay ? (
                        <span className={riskPillClass(theftDisplay)}>
                          {riskPillLabel("theft", theftDisplay)}
                        </span>
                      ) : (
                        <span className="muted">N/A</span>
                      )}
                    </td>
                    <td>
                      {p.effectiveDt} - {p.expirationDt}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Claims" eyebrow="Loss History">
        {claims.length === 0 && <p className="muted">No claims on file for this customer.</p>}
        {claims.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Claim #</th>
                  <th>Status</th>
                  <th>Loss Type</th>
                  <th>Loss Date</th>
                  <th>Policy</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((cl) => (
                  <tr key={cl.systemId} className={cl.systemId === claimDetailId ? "selected-row" : ""}>
                    <td>
                      <button type="button" className="table-action-link" onClick={() => onLoadClaimDetail(cl.systemId)}>
                        {cl.claimNumber}
                      </button>
                    </td>
                    <td>
                      <span className={claimPillClass(cl.status)}>{cl.status}</span>
                    </td>
                    <td>{cl.lossType}</td>
                    <td>{cl.lossDt}</td>
                    <td>{cl.policySystemId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {claimDetail && claimDetailId && (
          <div className="claim-detail">
            <h4>Claim detail</h4>
            <dl className="info-grid info-grid--claim">
              <div>
                <dt>Number</dt>
                <dd>{claimDetail.claimNumber}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{claimDetail.status}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{claimDetail.lossDescription}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>${claimDetail.paidAmount.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Reserve</dt>
                <dd>${claimDetail.reserveAmount.toFixed(2)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Portal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { view, customerSegment, invalidPath } = useMemo(
    () => routeFromPath(location.pathname),
    [location.pathname]
  );

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [query, setQuery] = useState("");
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [claimDetailId, setClaimDetailId] = useState<string | null>(null);
  const [claimDetail, setClaimDetail] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsErr, setStatsErr] = useState<string | null>(null);

  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSidebarScroll = useCallback(() => {
    const el = sidebarScrollRef.current;
    if (!el) return;
    el.classList.add("sidebar-scroll--scrolling");
    if (sidebarScrollIdleRef.current !== null) clearTimeout(sidebarScrollIdleRef.current);
    sidebarScrollIdleRef.current = window.setTimeout(() => {
      el.classList.remove("sidebar-scroll--scrolling");
      sidebarScrollIdleRef.current = null;
    }, 650);
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarScrollIdleRef.current !== null) clearTimeout(sidebarScrollIdleRef.current);
    };
  }, []);

  useEffect(() => {
    if (invalidPath) navigate("/summary", { replace: true });
  }, [invalidPath, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setStatsErr(null);
        const [cRes, pRes] = await Promise.all([
          getJson<{ customers: Customer[] }>("/customers?page_size=100"),
          getJson<{ policies: Policy[] }>("/policies"),
        ]);
        if (!cancelled) {
          setCustomers(
            cRes.customers.map((c) => ({
              ...c,
              openClaimCount: Math.max(0, Math.floor(Number(c.openClaimCount ?? 0))),
            }))
          );
          setPolicies(pRes.policies);
        }
        try {
          const sRes = await getJson<PortfolioStats>("/stats/summary");
          if (!cancelled) setStats(sRes);
        } catch {
          if (!cancelled) setStatsErr("Could not load portfolio summary.");
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => {
    if (!customerSegment) return null;
    return customers.find((c) => c.systemId === customerSegment) ?? null;
  }, [customers, customerSegment]);

  const unknownCustomer = Boolean(
    customerSegment && !loading && customers.length > 0 && !selected
  );

  const customerPolicies = useMemo(() => {
    if (!customerSegment) return [];
    return policies.filter((p) => p.customerSystemId === customerSegment);
  }, [policies, customerSegment]);

  useEffect(() => {
    if (!customerSegment) {
      setClaims([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getJson<{ claims: ClaimRow[] }>(
          `/customers/${encodeURIComponent(customerSegment)}/claims`
        );
        if (!cancelled) setClaims(res.claims);
      } catch {
        if (!cancelled) setClaims([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerSegment]);

  const loadClaimDetail = useCallback(async (claimSystemId: string) => {
    setClaimDetailId(claimSystemId);
    try {
      const d = await getJson<ClaimDetail>(
        `/claims/${encodeURIComponent(claimSystemId)}/consumerSummary`
      );
      setClaimDetail(d);
    } catch {
      setClaimDetail(null);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    const policyCustomerIds = new Set(
      policies
        .filter((p) => p.policyNumber.toLowerCase().includes(q))
        .map((p) => p.customerSystemId)
    );
    return customers.filter(
      (c) =>
        policyCustomerIds.has(c.systemId) ||
        c.displayName.toLowerCase().includes(q) ||
        c.primaryEmail.toLowerCase().includes(q) ||
        c.primaryPhone.includes(q) ||
        c.address.city.toLowerCase().includes(q) ||
        c.address.county.toLowerCase().includes(q) ||
        c.accountNumber.toLowerCase().includes(q)
    );
  }, [customers, policies, query]);

  const openClaims = useMemo(
    () => claims.filter((c) => c.status === "OPEN" || c.status === "PENDING").length,
    [claims]
  );

  const selectCustomer = (id: string) => {
    navigate(`/${encodeURIComponent(id)}`);
    setClaimDetailId(null);
    setClaimDetail(null);
  };

  return (
    <div className="app-shell">
      <TopBar
        view={view}
        onHome={() => {
          navigate("/summary");
          setClaimDetailId(null);
          setClaimDetail(null);
        }}
        onSummary={() => {
          navigate("/summary");
          setClaimDetailId(null);
          setClaimDetail(null);
        }}
      />

      <div className="main-shell">
        <LeftNav
          view={view}
          query={query}
          onQueryChange={setQuery}
          customers={filtered}
          customerSegment={customerSegment}
          loading={loading}
          sidebarScrollRef={sidebarScrollRef}
          onScroll={handleSidebarScroll}
          onSummary={() => {
            navigate("/summary");
            setClaimDetailId(null);
            setClaimDetail(null);
          }}
          onSelectCustomer={selectCustomer}
        />

        <main className="content">
          {err && <div className="banner error">{err}</div>}
          {view === "summary" ? (
            <SummaryPage stats={stats} loading={loading} statsErr={statsErr} />
          ) : (
            <CustomerPage
              selected={selected}
              unknownCustomer={unknownCustomer}
              customerSegment={customerSegment}
              customerPolicies={customerPolicies}
              claims={claims}
              openClaims={openClaims}
              claimDetailId={claimDetailId}
              claimDetail={claimDetail}
              onLoadClaimDetail={loadClaimDetail}
              onHome={() => navigate("/summary")}
            />
          )}
        </main>

      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/summary" replace />} />
      <Route path="*" element={<Portal />} />
    </Routes>
  );
}
