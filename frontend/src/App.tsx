import { useEffect, useState } from 'react'
import { C1Chat, ThemeProvider } from '@thesysai/genui-sdk'
import '@crayonai/react-ui/styles/index.css'
import './App.css'

type UniverseCompany = {
  ticker: string
  name: string
}

type HistoryPoint = {
  date: string
  close: number
  volume: number | null
}

type NewsItem = {
  title: string | null
  publisher: string | null
  link: string | null
  publishedAt: string | null
  summary: string | null
  thumbnail: string | null
}

type CompanySnapshot = {
  ticker: string
  name: string
  sector: string | null
  industry: string | null
  price: number | null
  previousClose: number | null
  dayChange: number | null
  dayChangePercent: number | null
  marketCap: number | null
  volume: number | null
  peRatio: number | null
  forwardPE: number | null
  dividendYield: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  recommendation: string | null
  summary: string | null
  history: HistoryPoint[]
  sixMonthReturn: number | null
  news: NewsItem[]
}

type MarketSnapshot = {
  ticker: string
  name: string
  price: number | null
  dayChange: number | null
  dayChangePercent: number | null
}

type DashboardResponse = {
  updatedAt: string
  companyUniverse: UniverseCompany[]
  selectedTickers: string[]
  companies: CompanySnapshot[]
  market: MarketSnapshot[]
  insights: {
    averageSixMonthReturn: number | null
    highestMarketCap: CompanySnapshot | null
    topMovers: CompanySnapshot[]
    refreshHint: string
    analysisWindow: {
      from: string
      to: string
    }
  }
}

const defaultTickers = ['AAPL', 'MSFT', 'NVDA', 'AMZN']

function formatCurrency(value: number | null) {
  if (value === null) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}

function formatCompactCurrency(value: number | null) {
  if (value === null) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCompactNumber(value: number | null) {
  if (value === null) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number | null, digits = 2) {
  if (value === null) {
    return 'N/A'
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function recommendationLabel(value: string | null) {
  if (!value) {
    return 'No rating'
  }

  return value.replaceAll('_', ' ')
}

function linePath(points: HistoryPoint[], width: number, height: number) {
  if (points.length === 0) {
    return ''
  }

  const values = points.map((point) => point.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width
      const y = height - ((point.close - min) / range) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function areaPath(points: HistoryPoint[], width: number, height: number) {
  if (points.length === 0) {
    return ''
  }

  const line = linePath(points, width, height)
  return `${line} L ${width} ${height} L 0 ${height} Z`
}

function App() {
  const [selectedTickers, setSelectedTickers] = useState<string[]>(defaultTickers)
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchDashboard = async () => {
      try {
        const params = new URLSearchParams({ tickers: selectedTickers.join(',') })
        const response = await fetch(`/api/dashboard?${params.toString()}`)

        if (!response.ok) {
          throw new Error(`Dashboard request failed with ${response.status}`)
        }

        const payload: DashboardResponse = await response.json()

        if (!cancelled) {
          setDashboard(payload)
          setError(null)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchDashboard()
    const intervalId = window.setInterval(fetchDashboard, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [selectedTickers])

  const companyUniverse = dashboard?.companyUniverse ?? []
  const companies = dashboard?.companies ?? []
  const focusCompany = companies[0] ?? null

  return (
    <ThemeProvider mode="dark">
      <div className="dashboard-shell">
        <main className="dashboard-main">
          <section className="hero-panel">
            <div>
              <p className="eyebrow">AI-guided portfolio research</p>
              <h1>Choose companies with context, not just hype.</h1>
              <p className="hero-copy">
                Compare market leaders, scan live performance, and then ask the assistant for a deeper thesis on valuation, news, and timing.
              </p>
            </div>
            <div className="hero-meta">
              <span className="status-dot" />
              <span>{dashboard ? dashboard.insights.refreshHint : 'Loading live market snapshot...'}</span>
            </div>
          </section>

          <section className="market-strip">
            {(dashboard?.market ?? []).map((marketItem) => (
              <article key={marketItem.ticker} className="market-card">
                <div>
                  <p>{marketItem.name}</p>
                  <strong>{marketItem.ticker}</strong>
                </div>
                <div className="market-card-values">
                  <span>{formatCurrency(marketItem.price)}</span>
                  <span className={marketItem.dayChangePercent !== null && marketItem.dayChangePercent >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(marketItem.dayChangePercent)}
                  </span>
                </div>
              </article>
            ))}
          </section>

          <section className="content-grid">
            <div className="left-column">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Investment candidates</p>
                    <h2>Select up to four companies</h2>
                  </div>
                  <span className="muted-text">Your picks drive the charts and AI context.</span>
                </div>
                <div className="company-selector">
                  {companyUniverse.map((company) => {
                    const active = selectedTickers.includes(company.ticker)
                    return (
                      <button
                        key={company.ticker}
                        className={`company-chip ${active ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedTickers((current) => {
                            if (current.includes(company.ticker)) {
                              return current.length === 1 ? current : current.filter((ticker) => ticker !== company.ticker)
                            }

                            if (current.length >= 4) {
                              return [...current.slice(1), company.ticker]
                            }

                            return [...current, company.ticker]
                          })
                        }}
                        type="button"
                      >
                        <span>{company.ticker}</span>
                        <small>{company.name}</small>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Live comparison</p>
                    <h2>6-month price performance</h2>
                  </div>
                  <span className="muted-text">
                    Window: {dashboard?.insights.analysisWindow.from ?? '...'} to {dashboard?.insights.analysisWindow.to ?? '...'}
                  </span>
                </div>
                <div className="chart-board">
                  <div className="chart-surface">
                    <svg viewBox="0 0 720 260" className="comparison-chart" role="img" aria-label="Six month stock comparison chart">
                      <defs>
                        <linearGradient id="chart-grid" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
                          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                        </linearGradient>
                      </defs>
                      <rect x="0" y="0" width="720" height="260" rx="18" fill="url(#chart-grid)" />
                      {[52, 104, 156, 208].map((y) => (
                        <line key={y} x1="24" y1={y} x2="696" y2={y} className="chart-gridline" />
                      ))}
                      {companies.map((company, index) => (
                        <path
                          key={company.ticker}
                          d={linePath(company.history, 648, 180)}
                          transform="translate(36 28)"
                          fill="none"
                          stroke={`var(--series-${(index % 4) + 1})`}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                      ))}
                    </svg>
                  </div>
                  <div className="chart-legend">
                    {companies.map((company, index) => (
                      <div key={company.ticker} className="legend-item">
                        <span className="legend-swatch" style={{ background: `var(--series-${(index % 4) + 1})` }} />
                        <div>
                          <strong>{company.ticker}</strong>
                          <p>{formatPercent(company.sixMonthReturn)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="stats-grid">
                <article className="panel compact-panel">
                  <p className="section-kicker">Portfolio pulse</p>
                  <h3>{formatPercent(dashboard?.insights.averageSixMonthReturn ?? null)}</h3>
                  <p className="muted-text">Average 6-month return across your selected companies.</p>
                </article>
                <article className="panel compact-panel">
                  <p className="section-kicker">Largest company</p>
                  <h3>{dashboard?.insights.highestMarketCap?.ticker ?? 'N/A'}</h3>
                  <p className="muted-text">
                    {formatCompactCurrency(dashboard?.insights.highestMarketCap?.marketCap ?? null)} market cap
                  </p>
                </article>
                <article className="panel compact-panel">
                  <p className="section-kicker">Fastest mover</p>
                  <h3>{dashboard?.insights.topMovers[0]?.ticker ?? 'N/A'}</h3>
                  <p className="muted-text">{formatPercent(dashboard?.insights.topMovers[0]?.dayChangePercent ?? null)} today</p>
                </article>
              </section>

              {focusCompany && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Focus company</p>
                      <h2>
                        {focusCompany.name} <span className="inline-ticker">{focusCompany.ticker}</span>
                      </h2>
                    </div>
                    <span className={focusCompany.dayChangePercent !== null && focusCompany.dayChangePercent >= 0 ? 'pill positive-pill' : 'pill negative-pill'}>
                      {formatPercent(focusCompany.dayChangePercent)}
                    </span>
                  </div>
                  <div className="focus-grid">
                    <div className="focus-copy">
                      <p className="focus-price">{formatCurrency(focusCompany.price)}</p>
                      <p className="muted-text">{focusCompany.sector ?? 'Sector unavailable'}</p>
                      <p className="focus-summary">
                        {focusCompany.summary ?? 'Ask the assistant for a deeper investment summary and risk breakdown for this company.'}
                      </p>
                    </div>
                    <div className="mini-stats">
                      <div>
                        <span>P/E</span>
                        <strong>{focusCompany.peRatio?.toFixed(2) ?? 'N/A'}</strong>
                      </div>
                      <div>
                        <span>Forward P/E</span>
                        <strong>{focusCompany.forwardPE?.toFixed(2) ?? 'N/A'}</strong>
                      </div>
                      <div>
                        <span>Dividend Yield</span>
                        <strong>{focusCompany.dividendYield !== null ? `${(focusCompany.dividendYield * 100).toFixed(2)}%` : 'N/A'}</strong>
                      </div>
                      <div>
                        <span>Volume</span>
                        <strong>{formatCompactNumber(focusCompany.volume)}</strong>
                      </div>
                      <div>
                        <span>52W Range</span>
                        <strong>
                          {formatCurrency(focusCompany.fiftyTwoWeekLow)} - {formatCurrency(focusCompany.fiftyTwoWeekHigh)}
                        </strong>
                      </div>
                      <div>
                        <span>Street View</span>
                        <strong>{recommendationLabel(focusCompany.recommendation)}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="sparkline-card">
                    <div className="sparkline-header">
                      <span>Recent trend</span>
                      <span>{formatPercent(focusCompany.sixMonthReturn)}</span>
                    </div>
                    <svg viewBox="0 0 640 180" className="sparkline-chart" role="img" aria-label={`${focusCompany.ticker} trend chart`}>
                      <path d={areaPath(focusCompany.history, 640, 150)} transform="translate(0 10)" className="sparkline-area" />
                      <path d={linePath(focusCompany.history, 640, 150)} transform="translate(0 10)" className="sparkline-line" />
                    </svg>
                  </div>
                </section>
              )}

              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Why it matters</p>
                    <h2>News feed for your first pick</h2>
                  </div>
                  <span className="muted-text">Useful for checking narrative momentum before investing.</span>
                </div>
                <div className="news-list">
                  {(focusCompany?.news ?? []).map((story) => (
                    <a
                      key={`${story.link}-${story.title}`}
                      className="news-card"
                      href={story.link ?? '#'}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <div>
                        <p>{story.publisher ?? 'News source'}</p>
                        <h3>{story.title ?? 'Untitled story'}</h3>
                        <span>{story.publishedAt ? formatTimestamp(story.publishedAt) : 'Recent'}</span>
                      </div>
                    </a>
                  ))}
                  {!loading && !focusCompany?.news.length && <p className="muted-text">No recent headlines were returned for this company.</p>}
                </div>
              </section>
            </div>

            <aside className="right-column">
              <section className="panel assistant-panel">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">AI assistant</p>
                    <h2>Ask for an investing thesis</h2>
                  </div>
                  <span className="muted-text">Prompt ideas: compare risk, rank by valuation, summarize catalysts.</span>
                </div>
                <div className="assistant-prompt-list">
                  {selectedTickers.map((ticker) => (
                    <button
                      key={ticker}
                      className="prompt-chip"
                      type="button"
                    >
                      Analyze {ticker}
                    </button>
                  ))}
                </div>
                <div className="chat-frame">
                  <C1Chat apiUrl="/api/chat" />
                </div>
              </section>
            </aside>
          </section>

          {loading && <div className="app-overlay">Loading dashboard...</div>}
          {error && <div className="app-overlay error-overlay">{error}</div>}
        </main>
      </div>
    </ThemeProvider>
  )
}

export default App
