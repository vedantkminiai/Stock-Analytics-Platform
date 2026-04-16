from datetime import datetime, timedelta
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel

import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from langchain.agents import create_agent
from langchain.messages import HumanMessage, SystemMessage
from langchain.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver

import yfinance as yf

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COMPANY_UNIVERSE = {
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "AMZN": "Amazon",
    "GOOGL": "Alphabet",
    "META": "Meta",
    "TSLA": "Tesla",
    "JPM": "JPMorgan Chase",
}

MARKET_BENCHMARKS = {
    "SPY": "S&P 500",
    "QQQ": "Nasdaq 100",
    "DIA": "Dow Jones",
    "IWM": "Russell 2000",
}

# Using gpt-5 but taking from thesis api
model = ChatOpenAI(
    model="c1/openai/gpt-5/v-20250930",
    base_url="https://api.thesys.dev/v1/embed/",
)

checkpointer = InMemorySaver()


@tool("get_stock_price", description="A function that returns the current stock price based on a ticker")
def get_stock_price(ticker: str):
    print("get stock_price tool is being used")
    stock = yf.Ticker(ticker)
    return stock.history()["Close"].iloc[-1]


@tool(
    "get_historical_stock_price",
    description="A function that returns the current stock price over time based on a ticker symbol and a start and end date",
)
def get_historical_stock_price(ticker: str, start_date: str, end_date: str):
    print("get_historical_stock_price tool is being used")
    stock = yf.Ticker(ticker)
    return stock.history(start=start_date, end=end_date).to_dict()


@tool("get_balance_sheet", description="A function that returns the balance sheet based on a ticker symbol")
def get_balance_sheet(ticker: str, year: int):
    print("get_balance_sheet tool is being used")
    stock = yf.Ticker(ticker)
    return stock.balance_sheet


@tool("get_stock_news", description="A function that returns news based on a ticker symbol")
def get_stock_news(ticker: str):
    print("get_stock_news tool is being used")
    stock = yf.Ticker(ticker)
    return stock.news


agent = create_agent(
    model=model,
    checkpointer=checkpointer,
    tools=[get_stock_price, get_historical_stock_price, get_balance_sheet, get_stock_news],
)


class PromptObject(BaseModel):
    content: str
    id: str
    role: str


class RequestObject(BaseModel):
    prompt: PromptObject
    threadId: str
    responseId: str


def _extract_text_content(content: Any) -> str:
    if content is None:
        return ""

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_parts = []
        for item in content:
            text = _extract_text_content(item)
            if text:
                text_parts.append(text)
        return "".join(text_parts)

    if isinstance(content, dict):
        if content.get("type") == "text":
            return str(content.get("text", ""))
        return ""

    return ""


def _safe_float(value: Any):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any):
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _format_history(history, limit: int = 30):
    if history.empty:
        return []

    points = []
    for index, row in history.tail(limit).iterrows():
        close = _safe_float(row.get("Close"))
        if close is None:
            continue
        points.append(
            {
                "date": index.strftime("%Y-%m-%d"),
                "close": round(close, 2),
                "volume": _safe_int(row.get("Volume")),
            }
        )
    return points


def _normalize_news_item(item: dict[str, Any]):
    content = item.get("content") or {}
    publish_time = content.get("pubDate") or item.get("providerPublishTime")
    published_at = None

    if isinstance(publish_time, str):
        published_at = publish_time
    elif publish_time:
        try:
            published_at = datetime.fromtimestamp(publish_time).isoformat()
        except (TypeError, ValueError, OSError):
            published_at = None

    thumbnail = None
    thumbnails = content.get("thumbnail") or {}
    if isinstance(thumbnails, dict):
        resolutions = thumbnails.get("resolutions") or []
        if resolutions:
            thumbnail = resolutions[0].get("url")

    canonical_url = content.get("canonicalUrl") or {}

    return {
        "title": content.get("title") or item.get("title"),
        "publisher": content.get("provider", {}).get("displayName") or item.get("publisher"),
        "link": canonical_url.get("url") or item.get("link"),
        "publishedAt": published_at,
        "summary": content.get("summary"),
        "thumbnail": thumbnail,
    }


def _build_company_snapshot(ticker: str):
    stock = yf.Ticker(ticker)
    info = stock.fast_info or {}
    details = stock.info or {}
    history = stock.history(period="6mo", interval="1d", auto_adjust=False)

    current_price = _safe_float(info.get("lastPrice") or details.get("currentPrice"))
    previous_close = _safe_float(info.get("previousClose") or details.get("previousClose"))
    day_change = None
    day_change_percent = None
    if current_price is not None and previous_close not in (None, 0):
        day_change = round(current_price - previous_close, 2)
        day_change_percent = round((day_change / previous_close) * 100, 2)

    history_points = _format_history(history, limit=45)
    six_month_return = None
    if len(history_points) >= 2 and history_points[0]["close"] != 0:
        first_close = history_points[0]["close"]
        last_close = history_points[-1]["close"]
        six_month_return = round(((last_close - first_close) / first_close) * 100, 2)

    news_items = stock.news[:3] if stock.news else []

    return {
        "ticker": ticker,
        "name": details.get("shortName") or COMPANY_UNIVERSE.get(ticker) or ticker,
        "sector": details.get("sector"),
        "industry": details.get("industry"),
        "price": current_price,
        "previousClose": previous_close,
        "dayChange": day_change,
        "dayChangePercent": day_change_percent,
        "marketCap": _safe_int(info.get("marketCap") or details.get("marketCap")),
        "volume": _safe_int(info.get("lastVolume") or info.get("regularMarketVolume") or details.get("volume")),
        "peRatio": _safe_float(details.get("trailingPE")),
        "forwardPE": _safe_float(details.get("forwardPE")),
        "dividendYield": _safe_float(details.get("dividendYield")),
        "fiftyTwoWeekHigh": _safe_float(info.get("yearHigh") or details.get("fiftyTwoWeekHigh")),
        "fiftyTwoWeekLow": _safe_float(info.get("yearLow") or details.get("fiftyTwoWeekLow")),
        "recommendation": details.get("recommendationKey"),
        "summary": details.get("longBusinessSummary"),
        "history": history_points,
        "sixMonthReturn": six_month_return,
        "news": [_normalize_news_item(item) for item in news_items],
    }


@app.get("/api/dashboard")
async def get_dashboard(tickers: str = Query(default="AAPL,MSFT,NVDA,AMZN")):
    selected = []
    seen = set()
    for ticker in [item.strip().upper() for item in tickers.split(",") if item.strip()]:
        if ticker in COMPANY_UNIVERSE and ticker not in seen:
            selected.append(ticker)
            seen.add(ticker)

    if not selected:
        selected = ["AAPL", "MSFT", "NVDA", "AMZN"]

    companies = [_build_company_snapshot(ticker) for ticker in selected]

    benchmark_symbols = list(MARKET_BENCHMARKS.keys())
    benchmark_history = yf.download(
        tickers=benchmark_symbols,
        period="5d",
        interval="1d",
        auto_adjust=False,
        progress=False,
        group_by="ticker",
    )

    market = []
    for ticker in benchmark_symbols:
        series = benchmark_history[ticker] if ticker in benchmark_history else None
        if series is None or series.empty:
            continue

        closes = series["Close"].dropna().tail(2)
        current = _safe_float(closes.iloc[-1]) if len(closes) >= 1 else None
        previous = _safe_float(closes.iloc[-2]) if len(closes) >= 2 else None
        delta = None
        delta_percent = None
        if current is not None and previous not in (None, 0):
            delta = round(current - previous, 2)
            delta_percent = round((delta / previous) * 100, 2)

        market.append(
            {
                "ticker": ticker,
                "name": MARKET_BENCHMARKS[ticker],
                "price": current,
                "dayChange": delta,
                "dayChangePercent": delta_percent,
            }
        )

    now = datetime.utcnow()
    valid_returns = [company["sixMonthReturn"] for company in companies if company["sixMonthReturn"] is not None]
    average_six_month_return = round(sum(valid_returns) / len(valid_returns), 2) if valid_returns else None
    top_movers = sorted(
        [company for company in companies if company["dayChangePercent"] is not None],
        key=lambda company: abs(company["dayChangePercent"]),
        reverse=True,
    )[:3]

    return {
        "updatedAt": now.isoformat() + "Z",
        "companyUniverse": [{"ticker": ticker, "name": name} for ticker, name in COMPANY_UNIVERSE.items()],
        "selectedTickers": selected,
        "companies": companies,
        "market": market,
        "insights": {
            "averageSixMonthReturn": average_six_month_return,
            "highestMarketCap": max(companies, key=lambda company: company["marketCap"] or 0, default=None),
            "topMovers": top_movers,
            "refreshHint": f"Live snapshot generated from Yahoo Finance at {now.strftime('%H:%M UTC')}",
            "analysisWindow": {
                "from": (now - timedelta(days=180)).strftime("%Y-%m-%d"),
                "to": now.strftime("%Y-%m-%d"),
            },
        },
    }


@app.post("/api/chat")
async def chat(request: RequestObject):
    config = {"configurable": {"thread_id": request.threadId}}

    def generate():
        for token, _ in agent.stream(
            {
                "messages": [
                    SystemMessage(
                        "You are a stock analysis assistant. You have the ability to get real-time stock prices, historical stock prices (given a date range), news and balance sheets data for a given ticker symbol."
                    ),
                    HumanMessage(request.prompt.content),
                ]
            },
            stream_mode="messages",
            config=config,
        ):
            text = _extract_text_content(getattr(token, "content", None))
            if text:
                yield text

    return StreamingResponse(
        generate(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connected": "keep-alive",
        },
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8888)
