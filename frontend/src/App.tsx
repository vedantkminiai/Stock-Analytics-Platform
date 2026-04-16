import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './App.css'

type AppPage = 'Dashboard' | 'Explore' | 'Watchlist' | 'Portfolio' | 'AI Assistant' | 'Settings'

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

type PortfolioHolding = {
  ticker: string
  shares: number
  averageCost: number
}

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
}

type CustomChatProps = {
  seedPrompt: string
  selectedTickers: string[]
  quickPrompts: string[]
}

const navigationItems: AppPage[] = ['Dashboard', 'Explore', 'Watchlist', 'Portfolio', 'AI Assistant', 'Settings']
const defaultTickers = ['AAPL', 'MSFT', 'NVDA', 'AMZN']
const initialPortfolio: PortfolioHolding[] = [
  { ticker: 'AAPL', shares: 12, averageCost: 188.15 },
  { ticker: 'MSFT', shares: 8, averageCost: 401.3 },
  { ticker: 'NVDA', shares: 15, averageCost: 109.8 },
  { ticker: 'AMZN', shares: 10, averageCost: 173.9 },
]

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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

function formatPercent(value: number | null, digits = 2) {
  if (value === null) {
    return 'N/A'
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
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

function dashboardPrompt(tickers: string[]) {
  if (tickers.length === 0) {
    return 'Ask the assistant to compare quality, valuation, and risk across today’s market leaders.'
  }

  return `Compare ${tickers.join(', ')} and tell me which looks most attractive for a long-term investment, with risks and catalysts.`
}

function CustomChatAssistant({ seedPrompt, selectedTickers, quickPrompts }: CustomChatProps) {
  const [inputValue, setInputValue] = useState(seedPrompt)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: 'assistant',
      content: `I can analyze ${selectedTickers.join(', ')} or any stock you’re researching. Ask for a thesis, compare names, or stress-test a portfolio idea.`,
    },
  ])
  const [isStreaming, setIsStreaming] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const threadIdRef = useRef(createId())
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setInputValue(seedPrompt)
  }, [seedPrompt])

  useEffect(() => {
    if (messages.length === 1 && messages[0]?.role === 'assistant') {
      setMessages([
        {
          id: createId(),
          role: 'assistant',
          content: `I can analyze ${selectedTickers.join(', ')} or any stock you’re researching. Ask for a thesis, compare names, or stress-test a portfolio idea.`,
        },
      ])
      return
    }

    setMessages((current) => {
      const firstAssistant = current[0]
      if (!firstAssistant || firstAssistant.role !== 'assistant') {
        return current
      }

      return [
        {
          ...firstAssistant,
          content: `I can analyze ${selectedTickers.join(', ')} or any stock you’re researching. Ask for a thesis, compare names, or stress-test a portfolio idea.`,
        },
        ...current.slice(1),
      ]
    })
  }, [selectedTickers])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isStreaming])

  const sendMessage = async (prompt: string) => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isStreaming) {
      return
    }

    const userMessage: ChatMessage = { id: createId(), role: 'user', content: trimmedPrompt }
    const assistantMessageId = createId()
    setMessages((current) => [...current, userMessage, { id: assistantMessageId, role: 'assistant', content: '' }])
    setInputValue('')
    setChatError(null)
    setIsStreaming(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: {
            content: trimmedPrompt,
            id: createId(),
            role: 'user',
          },
          threadId: threadIdRef.current,
          responseId: createId(),
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed with ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        assistantReply += decoder.decode(value, { stream: true })
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== assistantMessageId) {
              return message
            }

            return {
              ...message,
              content: assistantReply,
            }
          }),
        )
      }

      if (!assistantReply.trim()) {
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== assistantMessageId) {
              return message
            }

            return {
              ...message,
              content: 'No response was returned from the assistant. Try asking again with a more specific stock or timeframe.',
            }
          }),
        )
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to reach the assistant'
      setChatError(message)
      setMessages((current) =>
        current.map((chatMessage) => {
          if (chatMessage.id !== assistantMessageId) {
            return chatMessage
          }

          return {
            ...chatMessage,
            content: 'The assistant could not complete that request. Check the backend and try again.',
          }
        }),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await sendMessage(inputValue)
  }

  const handleComposerKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      await sendMessage(inputValue)
    }
  }

  return (
    <div className="custom-chat-shell">
      <div className="custom-chat-header">
        <div>
          <p className="section-kicker">Dynamic assistant</p>
          <h3>Research conversation</h3>
        </div>
        <span className={`chat-status ${isStreaming ? 'live-chat-status' : ''}`}>{isStreaming ? 'Thinking' : 'Ready'}</span>
      </div>

      <div className="assistant-prompt-list vertical-prompt-list">
        {quickPrompts.map((prompt) => (
          <button key={prompt} className="prompt-card" onClick={() => setInputValue(prompt)} type="button">
            {prompt}
          </button>
        ))}
      </div>

      <div className="custom-chat-context">
        <span>Context</span>
        <strong>{selectedTickers.join(', ')}</strong>
      </div>

      <div ref={scrollRef} className="chat-transcript">
        {messages.map((message) => (
          <article key={message.id} className={`chat-bubble ${message.role === 'user' ? 'user-bubble' : 'assistant-bubble'}`}>
            <div className="bubble-meta">
              <span>{message.role === 'user' ? 'You' : 'StockAI'}</span>
            </div>
            <p>{message.content || (isStreaming && message.role === 'assistant' ? 'Analyzing...' : '')}</p>
          </article>
        ))}
      </div>

      {chatError && <div className="chat-error-banner">{chatError}</div>}

      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask about valuation, catalysts, risks, or portfolio trade-offs"
          rows={4}
        />
        <div className="chat-composer-actions">
          <button className="mini-action" onClick={() => setInputValue(seedPrompt)} type="button">
            Reset prompt
          </button>
          <button className="primary-button" disabled={isStreaming || !inputValue.trim()} type="submit">
            {isStreaming ? 'Streaming...' : 'Send message'}
          </button>
        </div>
      </form>
    </div>
  )
}

function App() {
  const [activePage, setActivePage] = useState<AppPage>('Dashboard')
  const [selectedTickers, setSelectedTickers] = useState<string[]>(defaultTickers)
  const [watchlist, setWatchlist] = useState<string[]>(defaultTickers)
  const [searchQuery, setSearchQuery] = useState('')
  const [assistantSeed, setAssistantSeed] = useState(dashboardPrompt(defaultTickers))
  const [darkMode, setDarkMode] = useState(true)
  const [currency, setCurrency] = useState('USD')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
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
          setLoading(false)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard')
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
  const market = dashboard?.market ?? []

  const filteredUniverse = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return companyUniverse
    }

    return companyUniverse.filter((company) => company.ticker.toLowerCase().includes(query) || company.name.toLowerCase().includes(query))
  }, [companyUniverse, searchQuery])

  const watchlistCompanies = useMemo(() => {
    return watchlist
      .map((ticker) => companies.find((company) => company.ticker === ticker))
      .filter((company): company is CompanySnapshot => Boolean(company))
  }, [watchlist, companies])

  const portfolioRows = useMemo(() => {
    return initialPortfolio.map((holding) => {
      const marketData = companies.find((company) => company.ticker === holding.ticker)
      const currentPrice = marketData?.price ?? null
      const marketValue = currentPrice === null ? null : currentPrice * holding.shares
      const costBasis = holding.averageCost * holding.shares
      const profitLoss = marketValue === null ? null : marketValue - costBasis

      return {
        ...holding,
        companyName: marketData?.name ?? holding.ticker,
        currentPrice,
        marketValue,
        costBasis,
        profitLoss,
      }
    })
  }, [companies])

  const totalPortfolioValue = portfolioRows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0)
  const totalCostBasis = portfolioRows.reduce((sum, row) => sum + row.costBasis, 0)
  const totalProfitLoss = totalPortfolioValue - totalCostBasis
  const simulatorTarget = companies[0]
  const simulatedShares = simulatorTarget?.price ? Math.floor(5000 / simulatorTarget.price) : 0

  const assistantQuickPrompts = [
    dashboardPrompt(selectedTickers),
    'Rank my watchlist by risk-adjusted upside and explain your reasoning.',
    'Compare valuation and growth quality across the stocks on this screen.',
    'Which company looks strongest for a 5-year holding period and why?',
  ]

  const renderDashboardPage = () => {
    const focusCompany = companies[0] ?? null

    return (
      <div className="page-stack">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Quick market overview</p>
            <h1>Scan the market first, then decide where to go deeper.</h1>
            <p className="hero-copy">
              Today’s dashboard surfaces live benchmarks, top movers, your watchlist preview, and an AI-generated starting point before you dive into details.
            </p>
          </div>
          <div className="hero-meta">
            <span className="status-dot" />
            <span>{dashboard ? dashboard.insights.refreshHint : 'Loading live market snapshot...'}</span>
          </div>
        </section>

        <section className="market-strip">
          {market.map((marketItem) => (
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

        <section className="three-column-grid">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">AI insight</p>
                <h2>Top movers today</h2>
              </div>
            </div>
            <div className="stack-list">
              {(dashboard?.insights.topMovers ?? []).map((company) => (
                <div key={company.ticker} className="list-row">
                  <div>
                    <strong>{company.ticker}</strong>
                    <p>{company.name}</p>
                  </div>
                  <span className={company.dayChangePercent !== null && company.dayChangePercent >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(company.dayChangePercent)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Watchlist preview</p>
                <h2>Saved names at a glance</h2>
              </div>
            </div>
            <div className="stack-list">
              {watchlistCompanies.slice(0, 4).map((company) => (
                <div key={company.ticker} className="list-row">
                  <div>
                    <strong>{company.ticker}</strong>
                    <p>{company.name}</p>
                  </div>
                  <span>{formatCurrency(company.price)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel compact-summary">
            <p className="section-kicker">Portfolio pulse</p>
            <h2>{formatCompactCurrency(totalPortfolioValue)}</h2>
            <p className="muted-text">Simulated total value across your tracked holdings.</p>
            <div className="metric-inline">
              <span>Total return</span>
              <strong className={totalProfitLoss >= 0 ? 'positive' : 'negative'}>{formatCurrency(totalProfitLoss)}</strong>
            </div>
          </section>
        </section>

        <section className="content-grid">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Mini charts</p>
                <h2>6-month comparison</h2>
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

          {focusCompany && (
            <section className="panel side-insight-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Focus stock</p>
                  <h2>{focusCompany.ticker}</h2>
                </div>
                <span className={focusCompany.dayChangePercent !== null && focusCompany.dayChangePercent >= 0 ? 'pill positive-pill' : 'pill negative-pill'}>
                  {formatPercent(focusCompany.dayChangePercent)}
                </span>
              </div>
              <p className="focus-price">{formatCurrency(focusCompany.price)}</p>
              <p className="muted-text">{focusCompany.name}</p>
              <div className="mini-stats single-column">
                <div>
                  <span>P/E</span>
                  <strong>{focusCompany.peRatio?.toFixed(2) ?? 'N/A'}</strong>
                </div>
                <div>
                  <span>Market Cap</span>
                  <strong>{formatCompactCurrency(focusCompany.marketCap)}</strong>
                </div>
                <div>
                  <span>Street View</span>
                  <strong>{recommendationLabel(focusCompany.recommendation)}</strong>
                </div>
              </div>
            </section>
          )}
        </section>
      </div>
    )
  }

  const renderExplorePage = () => {
    return (
      <div className="page-stack">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Discover stocks</p>
              <h2>Explore without starting in chat</h2>
            </div>
            <span className="muted-text">Search, filter, and scan what looks active right now.</span>
          </div>
          <div className="toolbar-row">
            <input
              className="search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by ticker or company name"
              type="search"
            />
            <div className="chip-row">
              {['All Sectors', 'Technology', 'Consumer', 'Financials'].map((sector) => (
                <button key={sector} className="prompt-chip" type="button">
                  {sector}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="two-column-grid">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Trending stocks</p>
                <h2>Names drawing attention</h2>
              </div>
            </div>
            <div className="explore-grid">
              {filteredUniverse.map((company) => {
                const liveData = companies.find((item) => item.ticker === company.ticker)
                const inWatchlist = watchlist.includes(company.ticker)

                return (
                  <article key={company.ticker} className="explore-card">
                    <div className="explore-card-header">
                      <div>
                        <strong>{company.ticker}</strong>
                        <p>{company.name}</p>
                      </div>
                      <button
                        className={`mini-action ${inWatchlist ? 'active-mini-action' : ''}`}
                        onClick={() => {
                          setWatchlist((current) =>
                            current.includes(company.ticker)
                              ? current.filter((ticker) => ticker !== company.ticker)
                              : [...current, company.ticker],
                          )
                        }}
                        type="button"
                      >
                        {inWatchlist ? 'Saved' : 'Save'}
                      </button>
                    </div>
                    <p className="explore-price">{formatCurrency(liveData?.price ?? null)}</p>
                    <span className={(liveData?.dayChangePercent ?? 0) >= 0 ? 'positive' : 'negative'}>
                      {formatPercent(liveData?.dayChangePercent ?? null)}
                    </span>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Heatmap visualization</p>
                <h2>Momentum snapshot</h2>
              </div>
            </div>
            <div className="heatmap-grid">
              {companies.map((company) => {
                const positive = (company.dayChangePercent ?? 0) >= 0
                return (
                  <button
                    key={company.ticker}
                    className={`heatmap-tile ${positive ? 'heatmap-positive' : 'heatmap-negative'}`}
                    onClick={() => {
                      setSelectedTickers((current) => {
                        if (current.includes(company.ticker)) {
                          return current
                        }
                        if (current.length >= 4) {
                          return [...current.slice(1), company.ticker]
                        }
                        return [...current, company.ticker]
                      })
                    }}
                    type="button"
                  >
                    <strong>{company.ticker}</strong>
                    <span>{formatPercent(company.dayChangePercent)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </section>
      </div>
    )
  }

  const renderWatchlistPage = () => {
    return (
      <div className="page-stack">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Track selected stocks</p>
              <h2>Your watchlist</h2>
            </div>
            <span className="muted-text">Monitor live prices and jump straight into comparisons or AI analysis.</span>
          </div>
          <div className="table-card">
            <div className="table-header">
              <span>Stock</span>
              <span>Price</span>
              <span>Daily Move</span>
              <span>Actions</span>
            </div>
            {watchlistCompanies.map((company) => (
              <div key={company.ticker} className="table-row">
                <div>
                  <strong>{company.ticker}</strong>
                  <p>{company.name}</p>
                </div>
                <span>{formatCurrency(company.price)}</span>
                <span className={company.dayChangePercent !== null && company.dayChangePercent >= 0 ? 'positive' : 'negative'}>
                  {formatPercent(company.dayChangePercent)}
                </span>
                <div className="action-group">
                  <button
                    className="mini-action"
                    onClick={() => setSelectedTickers([company.ticker, ...selectedTickers.filter((ticker) => ticker !== company.ticker)].slice(0, 4))}
                    type="button"
                  >
                    View details
                  </button>
                  <button className="mini-action" onClick={() => setActivePage('Explore')} type="button">
                    Compare
                  </button>
                  <button
                    className="mini-action"
                    onClick={() => {
                      setAssistantSeed(`Give me a concise investment view on ${company.ticker}, including valuation, recent momentum, and key risks.`)
                      setActivePage('AI Assistant')
                    }}
                    type="button"
                  >
                    Ask AI
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const renderPortfolioPage = () => {
    return (
      <div className="page-stack">
        <section className="stats-grid">
          <article className="panel compact-panel">
            <p className="section-kicker">Holdings value</p>
            <h3>{formatCompactCurrency(totalPortfolioValue)}</h3>
            <p className="muted-text">Current simulated portfolio market value.</p>
          </article>
          <article className="panel compact-panel">
            <p className="section-kicker">Profit / loss</p>
            <h3 className={totalProfitLoss >= 0 ? 'positive' : 'negative'}>{formatCurrency(totalProfitLoss)}</h3>
            <p className="muted-text">Based on your current holdings assumptions.</p>
          </article>
          <article className="panel compact-panel">
            <p className="section-kicker">What-if simulator</p>
            <h3>{simulatedShares}</h3>
            <p className="muted-text">
              Shares of {simulatorTarget?.ticker ?? 'N/A'} purchasable with a {formatCurrency(5000)} investment today.
            </p>
          </article>
        </section>

        <section className="content-grid">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Holdings</p>
                <h2>Portfolio tracker</h2>
              </div>
            </div>
            <div className="table-card">
              <div className="table-header portfolio-grid">
                <span>Holding</span>
                <span>Shares</span>
                <span>Avg Cost</span>
                <span>Market Value</span>
                <span>P/L</span>
              </div>
              {portfolioRows.map((row) => (
                <div key={row.ticker} className="table-row portfolio-grid">
                  <div>
                    <strong>{row.ticker}</strong>
                    <p>{row.companyName}</p>
                  </div>
                  <span>{row.shares}</span>
                  <span>{formatCurrency(row.averageCost)}</span>
                  <span>{formatCurrency(row.marketValue)}</span>
                  <span className={(row.profitLoss ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCurrency(row.profitLoss)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel side-insight-panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Allocation breakdown</p>
                <h2>Portfolio mix</h2>
              </div>
            </div>
            <div className="allocation-list">
              {portfolioRows.map((row, index) => {
                const allocation = totalPortfolioValue ? (((row.marketValue ?? 0) / totalPortfolioValue) * 100) : 0
                return (
                  <div key={row.ticker} className="allocation-row">
                    <div className="allocation-label">
                      <span className="legend-swatch" style={{ background: `var(--series-${(index % 4) + 1})` }} />
                      <strong>{row.ticker}</strong>
                    </div>
                    <div className="allocation-bar-shell">
                      <div className="allocation-bar" style={{ width: `${allocation}%`, background: `var(--series-${(index % 4) + 1})` }} />
                    </div>
                    <span>{allocation.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </section>
        </section>
      </div>
    )
  }

  const renderAssistantPage = () => {
    return (
      <div className="page-stack">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Deep analysis</p>
              <h2>AI Assistant</h2>
            </div>
            <span className="muted-text">A custom chat surface tuned to the rest of the product.</span>
          </div>
          <div className="assistant-layout">
            <div className="assistant-side-panel">
              <p className="muted-text">Suggested prompts</p>
              <div className="assistant-prompt-list vertical-prompt-list">
                {assistantQuickPrompts.map((prompt) => (
                  <button key={prompt} className="prompt-card" onClick={() => setAssistantSeed(prompt)} type="button">
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="mini-stats single-column">
                <div>
                  <span>Current context</span>
                  <strong>{selectedTickers.join(', ')}</strong>
                </div>
                <div>
                  <span>Best use</span>
                  <strong>Ask for risk, catalysts, valuation, or a direct pick between stocks.</strong>
                </div>
              </div>
            </div>
            <CustomChatAssistant quickPrompts={assistantQuickPrompts} seedPrompt={assistantSeed} selectedTickers={selectedTickers} />
          </div>
        </section>
      </div>
    )
  }

  const renderSettingsPage = () => {
    return (
      <div className="page-stack">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Preferences</p>
              <h2>Settings</h2>
            </div>
          </div>
          <div className="settings-grid">
            <div className="setting-card">
              <div>
                <strong>Theme</strong>
                <p>Choose how the workspace should look.</p>
              </div>
              <button className="mini-action active-mini-action" onClick={() => setDarkMode((current) => !current)} type="button">
                {darkMode ? 'Dark mode' : 'Light mode'}
              </button>
            </div>
            <div className="setting-card">
              <div>
                <strong>Currency</strong>
                <p>Used for market values and portfolio summaries.</p>
              </div>
              <select className="settings-select" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="setting-card">
              <div>
                <strong>Notifications</strong>
                <p>Toggle watchlist alerts and AI insight summaries.</p>
              </div>
              <button className="mini-action" onClick={() => setNotificationsEnabled((current) => !current)} type="button">
                {notificationsEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <div className="setting-card">
              <div>
                <strong>API configuration</strong>
                <p>Backend routing currently uses the local `/api` proxy.</p>
              </div>
              <span className="muted-text">Configured</span>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const renderPage = () => {
    switch (activePage) {
      case 'Dashboard':
        return renderDashboardPage()
      case 'Explore':
        return renderExplorePage()
      case 'Watchlist':
        return renderWatchlistPage()
      case 'Portfolio':
        return renderPortfolioPage()
      case 'AI Assistant':
        return renderAssistantPage()
      case 'Settings':
        return renderSettingsPage()
    }
  }

  return (
    <div className={`app-shell ${darkMode ? 'theme-dark' : 'theme-dark'}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">SA</span>
          <div>
            <strong>StockAI</strong>
            <p>Research workspace</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <button key={item} className={`nav-item ${activePage === item ? 'active-nav-item' : ''}`} onClick={() => setActivePage(item)} type="button">
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="section-kicker">Selected universe</p>
          <div className="chip-row">
            {selectedTickers.map((ticker) => (
              <span key={ticker} className="sidebar-chip">
                {ticker}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-search">
            <input
              className="search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search stocks, sectors, or news"
              type="search"
            />
          </div>
          <div className="topbar-actions">
            <button className="topbar-pill" onClick={() => setActivePage('Watchlist')} type="button">
              Notifications
            </button>
            <button className="profile-pill" type="button">
              VK
            </button>
          </div>
        </header>

        <section className="page-content">{renderPage()}</section>

        {loading && <div className="app-overlay">Loading workspace...</div>}
        {error && <div className="app-overlay error-overlay">{error}</div>}
      </main>
    </div>
  )
}

export default App
