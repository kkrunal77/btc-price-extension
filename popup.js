document.addEventListener("DOMContentLoaded", () => {
  const gridContainer = document.getElementById("dashboard-grid");
  const syncTimeEl = document.getElementById("sync-time");
  const refreshAllBtn = document.getElementById("refresh-all");

  const MARKETS = [
    { ticker: "BTC-USD", name: "Bitcoin", symbol: "BTC", pair: "BTC/USD" },
    { ticker: "GC=F", name: "Gold", symbol: "XAU", pair: "XAU/USD" },
    { ticker: "^NSEI", name: "Nifty 50", symbol: "NIFTY", pair: "NIFTY" },
    { ticker: "SI=F", name: "Silver", symbol: "XAG", pair: "XAG/USD" }
  ];

  // Store references to charts to update them instead of rebuilding
  const chartInstances = {};

  const formatPrice = (price) => {
    if (isNaN(price) || price === null) return "---";
    const decimals = price > 10000 ? 2 : 2;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(price);
  };

  const createCardDOM = (asset) => {
    const card = document.createElement("div");
    card.className = "market-card";
    card.id = `card-${asset.symbol}`;
    
    card.innerHTML = `
      <div class="card-header">
        <div class="asset-info">
          <span class="asset-name">${asset.name.toUpperCase()} <span class="ticker-label">(${asset.pair})</span></span>
          <div class="price-row">
            <span class="asset-price" id="price-${asset.symbol}">Price: ---</span>
            <span class="asset-change" id="change-${asset.symbol}">--%</span>
          </div>
        </div>
        <span class="chart-interval-label">1H Chart</span>
      </div>
      <div class="mini-chart" id="chart-${asset.symbol}"></div>
    `;
    
    return card;
  };

  // Initialize UI cards
  MARKETS.forEach(asset => {
    gridContainer.appendChild(createCardDOM(asset));
  });

  const fetchAssetData = async (asset) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.ticker)}?interval=15m&range=5d`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.chart.error) {
         throw new Error(data.chart.error.description || "API Error");
      }

      const result = data.chart.result[0];
      const meta = result.meta;
      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];
      
      if (!timestamps || !quote) {
        throw new Error("No data returned");
      }

      const o = quote.open;
      const h = quote.high;
      const l = quote.low;
      const c = quote.close;
      
      const candles = [];
      let lastValidClose = 0;
      let lastT = 0;
      
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        if (o[i] !== null && h[i] !== null && l[i] !== null && c[i] !== null && t > lastT) {
          candles.push({
            time: t,
            open: o[i],
            high: h[i],
            low: l[i],
            close: c[i]
          });
          lastValidClose = c[i];
          lastT = t;
        }
      }
      
      // Calculate active metrics
      const currentPrice = meta.regularMarketPrice || lastValidClose;
      const prevClose = meta.chartPreviousClose || candles[0]?.close || 1;
      const changePercent = ((currentPrice - prevClose) / prevClose) * 100;
      
      updateCardUI(asset, currentPrice, changePercent, candles);
    } catch (e) {
      console.error(`Failed loading ${asset.ticker}`, e);
      const errorMsg = e.message.includes('fetch') ? 'Network/CORS Error' : 'Data Parse Error';
      const priceEl = document.getElementById(`price-${asset.symbol}`);
      priceEl.textContent = errorMsg;
      priceEl.style.fontSize = "0.7rem";
      priceEl.style.color = "#ff5252";
    }
  };

  const updateCardUI = (asset, currentPrice, changePercent, candles) => {
    const priceEl = document.getElementById(`price-${asset.symbol}`);
    const changeEl = document.getElementById(`change-${asset.symbol}`);
    
    // Animate if price is updated
    const oldPriceRaw = priceEl.dataset.rawPrice;
    if (oldPriceRaw && parseFloat(oldPriceRaw) !== currentPrice) {
      priceEl.classList.remove("price-pulse-up", "price-pulse-down");
      void priceEl.offsetWidth; // trigger reflow
      priceEl.classList.add(currentPrice > parseFloat(oldPriceRaw) ? "price-pulse-up" : "price-pulse-down");
    }
    priceEl.dataset.rawPrice = currentPrice;
    
    // Update texts
    const sign = changePercent >= 0 ? "+" : "";
    const pricePrefix = asset.ticker === '^NSEI' ? '' : '$';
    priceEl.textContent = `Price: ${pricePrefix}${formatPrice(currentPrice)}`;
    changeEl.textContent = `${sign}${changePercent.toFixed(2)}%`;
    changeEl.className = `asset-change ${changePercent >= 0 ? 'positive' : 'negative'}`;

    // Handle Chart Rendering
    const chartContainer = document.getElementById(`chart-${asset.symbol}`);
    if (!chartInstances[asset.symbol] && typeof LightweightCharts !== "undefined") {
      const chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 140,
        layout: { 
          background: { type: 'solid', color: 'transparent' }, 
          textColor: '#4a5670',
          fontFamily: "'Inter', sans-serif",
          fontSize: 10
        },
        grid: { 
          vertLines: { visible: false }, 
          horzLines: { color: 'rgba(255,255,255,0.03)', style: 1 } 
        },
        timeScale: { 
          visible: true,
          borderColor: 'rgba(255,255,255,0.06)',
          timeVisible: true,
          secondsVisible: false
        },
        rightPriceScale: { 
          visible: true,
          borderColor: 'rgba(255,255,255,0.06)',
          scaleMargins: { top: 0.1, bottom: 0.1 }
        },
        crosshair: { 
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(56, 189, 193, 0.3)',
            width: 1,
            style: 2,
            labelBackgroundColor: '#1a2540'
          },
          horzLine: {
            color: 'rgba(56, 189, 193, 0.3)',
            width: 1,
            style: 2,
            labelBackgroundColor: '#1a2540'
          }
        },
        handleScroll: false,
        handleScale: false
      });

      const series = chart.addCandlestickSeries({
        upColor: '#00e676',
        downColor: '#ff5252',
        borderVisible: false,
        wickUpColor: '#00e676',
        wickDownColor: '#ff5252'
      });
      
      series.setData(candles);
      chart.timeScale().fitContent();
      
      chartInstances[asset.symbol] = { chart, series };
    } else if (chartInstances[asset.symbol]) {
      chartInstances[asset.symbol].series.setData(candles);
    }
  };

  const syncAllData = async () => {
    refreshAllBtn.classList.add("spinning");
    
    const promises = MARKETS.map(asset => fetchAssetData(asset));
    await Promise.allSettled(promises);
    
    syncTimeEl.textContent = new Date().toLocaleTimeString();
    
    setTimeout(() => {
      refreshAllBtn.classList.remove("spinning");
    }, 500);
  };

  // Initial Sync
  syncAllData();

  // Listeners
  refreshAllBtn.addEventListener("click", syncAllData);
  
  // Poll every 10 seconds
  setInterval(syncAllData, 10000);
});
