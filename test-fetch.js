fetch("https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=15m&range=2d")
  .then(res => res.json())
  .then(data => {
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    console.log("TS length:", timestamps.length);
    console.log("Open length:", quote.open.length);
    console.log("First open:", quote.open[0]);
    console.log("Current price:", result.meta.regularMarketPrice);
  }).catch(err => console.error(err));
