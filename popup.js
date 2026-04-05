document.addEventListener("DOMContentLoaded", () => {
  const gridContainer = document.getElementById("dashboard-grid");
  const syncTimeEl = document.getElementById("sync-time");
  const refreshAllBtn = document.getElementById("refresh-all");

  const MARKETS = [
    { ticker: "BTC-USD", name: "Bitcoin", symbol: "BTC" },
    { ticker: "^NSEI", name: "Nifty 50", symbol: "NSEI" },
    { ticker: "GC=F", name: "Gold Futures", symbol: "XAU" },
    { ticker: "SI=F", name: "Silver Futures", symbol: "XAG" }
  ];

  // Store references to charts to update them instead of rebuilding
  const chartInstances = {};

  const formatPrice = (price) => {
    if (isNaN(price) || price === null) return "---";
    // Adjust decimals based on magnitude
    const decimals = price > 10000 ? 0 : 2;
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
          <span class="asset-name">${asset.name}</span>
          <span class="asset-symbol">${asset.symbol}</span>
        </div>
        <div class="price-info">
          <div class="asset-price" id="price-${asset.symbol}">---</div>
          <div class="asset-change" id="change-${asset.symbol}">--%</div>
        </div>
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
      // Use direct URL. Chrome extension permissions (host_permissions) will naturally bypass CORS locally!
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
      // Display the actual error so we can debug it visually!
      const errorMsg = e.message.includes('fetch') ? 'Network/CORS Error' : 'Data Parse Error';
      document.getElementById(`price-${asset.symbol}`).textContent = errorMsg;
      document.getElementById(`price-${asset.symbol}`).style.fontSize = "0.7rem";
      document.getElementById(`price-${asset.symbol}`).style.color = "#ef4444";
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
    priceEl.textContent = asset.ticker === '^NSEI' ? formatPrice(currentPrice) : `$${formatPrice(currentPrice)}`;
    changeEl.textContent = `${sign}${changePercent.toFixed(2)}%`;
    changeEl.className = `asset-change ${changePercent >= 0 ? 'positive' : 'negative'}`;

    // Handle Chart Rendering
    const chartContainer = document.getElementById(`chart-${asset.symbol}`);
    if (!chartInstances[asset.symbol] && typeof LightweightCharts !== "undefined") {
      const chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 120, // matching CSS
        layout: { 
          background: { type: 'solid', color: 'transparent' }, 
          textColor: '#94a3b8' 
        },
        grid: { 
          vertLines: { visible: false }, 
          horzLines: { visible: false } 
        },
        timeScale: { visible: false },
        rightPriceScale: { visible: false },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false
      });

      const series = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444'
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
  
  // Poll every 10 seconds (closest thing to live without websocket multiplexing)
  setInterval(syncAllData, 10000);
});
