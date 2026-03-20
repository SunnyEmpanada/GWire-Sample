import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson } from "./api";

type Customer = {
  systemId: string;
  displayName: string;
  primaryEmail: string;
  primaryPhone: string;
  address: {
    city: string;
    stateProvCd: string;
    postalCode: string;
  };
  accountNumber: string;
};

type Policy = {
  systemId: string;
  policyNumber: string;
  lineCd: string;
  status: string;
  effectiveDt: string;
  expirationDt: string;
  customerSystemId: string;
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

function claimPillClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "OPEN") return "pill pill--open";
  if (s === "PENDING") return "pill pill--pending";
  if (s === "CLOSED") return "pill pill--closed";
  if (s === "DENIED") return "pill pill--denied";
  return "pill pill--line";
}

export function App() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [claimDetailId, setClaimDetailId] = useState<string | null>(null);
  const [claimDetail, setClaimDetail] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [view, setView] = useState<MainView>("customers");

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
          setCustomers(cRes.customers);
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

  const selected = useMemo(
    () => customers.find((c) => c.systemId === selectedId) ?? null,
    [customers, selectedId]
  );

  const customerPolicies = useMemo(() => {
    if (!selectedId) return [];
    return policies.filter((p) => p.customerSystemId === selectedId);
  }, [policies, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setClaims([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getJson<{ claims: ClaimRow[] }>(
          `/customers/${encodeURIComponent(selectedId)}/claims`
        );
        if (!cancelled) setClaims(res.claims);
      } catch {
        if (!cancelled) setClaims([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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
        c.accountNumber.toLowerCase().includes(q)
    );
  }, [customers, policies, query]);

  const openClaims = useMemo(
    () => claims.filter((c) => c.status === "OPEN" || c.status === "PENDING").length,
    [claims]
  );

  const pageTitle = useMemo(() => {
    if (view === "summary") return "Portfolio summary";
    if (selected) return selected.displayName;
    return "Customers";
  }, [view, selected]);

  const selectCustomer = (id: string) => {
    setView("customers");
    setSelectedId(id);
    setClaimDetailId(null);
    setClaimDetail(null);
  };

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">GWire</span>
          <span className="tagline">InsuranceNow API mockup</span>
        </div>
        <div className="topbar-search">
          <svg
            className="search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            className="search"
            type="search"
            placeholder="Go to — search name, email, phone, policy #, city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search customers"
          />
        </div>
      </header>

      <div className="shell">
        <aside className="sidebar">
          <nav className="side-nav" aria-label="Primary">
            <button
              type="button"
              className={view === "summary" ? "nav-item active" : "nav-item"}
              onClick={() => setView("summary")}
            >
              Summary
            </button>
            <button
              type="button"
              className={view === "customers" ? "nav-item active" : "nav-item"}
              onClick={() => setView("customers")}
            >
              Customers
            </button>
          </nav>
          <div className="sidebar-section-title">Customers</div>
          <div className="sidebar-scroll">
            {loading && <p className="muted" style={{ padding: "0 0.5rem" }}>Loading…</p>}
            <ul className="list">
              {filtered.map((c) => (
                <li key={c.systemId}>
                  <button
                    type="button"
                    className={c.systemId === selectedId ? "row active" : "row"}
                    onClick={() => selectCustomer(c.systemId)}
                  >
                    <span className="name">{c.displayName}</span>
                    <span className="meta">{c.address.city}, CA</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="content">
          {err && <div className="banner error">{err}</div>}

          <h1 className="page-title">{pageTitle}</h1>

          {view === "summary" && (
            <div className="summary-screen">
              {statsErr && <div className="banner error">{statsErr}</div>}
              {!stats && !statsErr && loading && (
                <p className="muted">Loading portfolio stats…</p>
              )}
              {stats && (
                <>
                  <div className="grid summary-grid">
                    <section className="panel">
                      <h2>Claims by status</h2>
                      <p className="muted small" style={{ marginTop: 0 }}>
                        Open includes OPEN and PENDING claims.
                      </p>
                      <div className="stat-row">
                        <div className="stat-block">
                          <div className="stat-value">{stats.claimCounts.open}</div>
                          <div className="stat-label">Open</div>
                        </div>
                        <div className="stat-block">
                          <div className="stat-value">{stats.claimCounts.closed}</div>
                          <div className="stat-label">Closed</div>
                        </div>
                        <div className="stat-block">
                          <div className="stat-value">{stats.claimCounts.denied}</div>
                          <div className="stat-label">Denied</div>
                        </div>
                      </div>
                    </section>
                    <section className="panel">
                      <h2>Amounts</h2>
                      <dl className="dl summary-dl">
                        <dt>Total paid (all claims)</dt>
                        <dd>${stats.totalPaidAllClaims.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                        <dt>Total on open claims</dt>
                        <dd>
                          $
                          {stats.totalOpenClaimsAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          <span className="muted small">(paid + reserve, OPEN / PENDING)</span>
                        </dd>
                      </dl>
                    </section>
                  </div>
                  <section className="panel">
                    <h2>Top 5 cities by customers</h2>
                    <ol className="top-cities">
                      {stats.topCitiesByCustomers.map((row) => (
                        <li key={row.city}>
                          <span className="top-cities-name">{row.city}</span>
                          <span className="top-cities-count">{row.customerCount} customers</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                </>
              )}
            </div>
          )}

          {view === "customers" && (
            <>
              {selected && (
                <div className="grid" style={{ marginBottom: "1rem" }}>
                  <section className="panel">
                    <h2>Overview</h2>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                        gap: "0.75rem",
                        textAlign: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 300 }}>{customerPolicies.length}</div>
                        <div className="muted small">Policies</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 300 }}>{claims.length}</div>
                        <div className="muted small">Claims</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 300 }}>{openClaims}</div>
                        <div className="muted small">Open</div>
                        <div style={{ marginTop: "0.35rem" }}>
                          <span
                            className="pill"
                            style={{
                              background: openClaims > 0 ? "var(--status-warn-bg)" : "var(--status-ok-bg)",
                              color: openClaims > 0 ? "#a04000" : "#1e6091",
                            }}
                          >
                            {openClaims} open
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              <div className="grid">
                <section className="panel detail">
                  {!selected && (
                    <p className="muted">Select a customer to view policies and claims.</p>
                  )}
                  {selected && (
                    <>
                      <h2>Account</h2>
                      <dl className="dl">
                        <dt>ID</dt>
                        <dd>{selected.systemId}</dd>
                        <dt>Email</dt>
                        <dd>{selected.primaryEmail}</dd>
                        <dt>Phone</dt>
                        <dd>{selected.primaryPhone}</dd>
                        <dt>Account</dt>
                        <dd>{selected.accountNumber}</dd>
                      </dl>

                      <h3>Policies</h3>
                      <ul className="cards">
                        {customerPolicies.map((p) => (
                          <li key={p.systemId} className="card">
                            <div className="card-title">{p.policyNumber}</div>
                            <div className="card-body">
                              <span className="pill pill--line">{p.lineCd}</span>
                              <span>{p.status}</span>
                            </div>
                            <div className="muted small">
                              {p.effectiveDt} → {p.expirationDt}
                            </div>
                          </li>
                        ))}
                      </ul>

                      <h3>Claims</h3>
                      {claims.length === 0 && (
                        <p className="muted">No claims on file for this customer.</p>
                      )}
                      <ul className="claims">
                        {claims.map((cl) => (
                          <li key={cl.systemId}>
                            <button
                              type="button"
                              className={cl.systemId === claimDetailId ? "claim open" : "claim"}
                              onClick={() => void loadClaimDetail(cl.systemId)}
                            >
                              <span className="claim-num">{cl.claimNumber}</span>
                              <span className={claimPillClass(cl.status)}>{cl.status}</span>
                              <span className="muted">{cl.lossType}</span>
                            </button>
                          </li>
                        ))}
                      </ul>

                      {claimDetail && claimDetailId && (
                        <div className="claim-detail">
                          <h4>Claim detail</h4>
                          <dl className="dl">
                            <dt>Number</dt>
                            <dd>{claimDetail.claimNumber}</dd>
                            <dt>Status</dt>
                            <dd>{claimDetail.status}</dd>
                            <dt>Description</dt>
                            <dd>{claimDetail.lossDescription}</dd>
                            <dt>Paid</dt>
                            <dd>${claimDetail.paidAmount.toFixed(2)}</dd>
                            <dt>Reserve</dt>
                            <dd>${claimDetail.reserveAmount.toFixed(2)}</dd>
                          </dl>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
