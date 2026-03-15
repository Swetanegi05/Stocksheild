/* ═══════════════════════════════════════════════════════════════════
   StockSheild — Client-side Application Logic
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    // ── DOM References ─────────────────────────────────────────────
    const form = document.getElementById('analyzeForm');
    const symbolInput = document.getElementById('symbolInput');
    const tipInput = document.getElementById('tipInput');
    const scanBtn = document.getElementById('scanBtn');
    const scanOverlay = document.getElementById('scanOverlay');
    const scanText = document.getElementById('scanText');
    const scanProgressBar = document.getElementById('scanProgressBar');
    const resultsPanel = document.getElementById('resultsPanel');
    const stockInfoCard = document.getElementById('stockInfoCard');
    const errorCard = document.getElementById('errorCard');
    const errorText = document.getElementById('errorText');
    const alertFeed = document.getElementById('alertFeed');
    const alertCount = document.getElementById('alertCount');

    // Determine API Base URL for local development (Live Server / file://)
    const API_BASE = (window.location.protocol === 'file:' || window.location.port === '5500' || window.location.port === '5501')
        ? 'http://localhost:3000'
        : '';

    // Score elements
    const gaugeFill = document.getElementById('gaugeFill');
    const scoreValue = document.getElementById('scoreValue');
    const verdictBadge = document.getElementById('verdictBadge');
    const manipulationType = document.getElementById('manipulationType');
    const recommendation = document.getElementById('recommendation');
    const flagsCard = document.getElementById('flagsCard');
    const flagsList = document.getElementById('flagsList');
    const analysisText = document.getElementById('analysisText');

    // Stock info
    const stockName = document.getElementById('stockName');
    const stockSymbol = document.getElementById('stockSymbol');
    const stockPrice = document.getElementById('stockPrice');
    const stockChange = document.getElementById('stockChange');
    const stockMcap = document.getElementById('stockMcap');
    const stockPE = document.getElementById('stockPE');
    const stockVolSpike = document.getElementById('stockVolSpike');
    const stockPriceChange = document.getElementById('stockPriceChange');

    // ── Background Particles ───────────────────────────────────────
    const particlesContainer = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 8 + 's';
        p.style.animationDuration = (6 + Math.random() * 6) + 's';
        particlesContainer.appendChild(p);
    }

    // ── Scan Messages ──────────────────────────────────────────────
    const SCAN_MESSAGES = [
        'Initializing scan...',
        'Fetching market data...',
        'Analyzing price patterns...',
        'Scanning volume anomalies...',
        'Checking social media signals...',
        'Running AI manipulation model...',
        'Cross-referencing SEBI alerts...',
        'Evaluating insider patterns...',
        'Generating risk assessment...',
        'Compiling final report...',
    ];

    let scanMsgInterval = null;
    let progressInterval = null;

    // ── Show Scan Animation ────────────────────────────────────────
    function showScanAnimation() {
        scanOverlay.classList.add('active');
        scanBtn.disabled = true;
        resultsPanel.style.display = 'none';
        errorCard.style.display = 'none';

        let msgIndex = 0;
        let progress = 0;

        scanText.textContent = SCAN_MESSAGES[0];
        scanProgressBar.style.width = '0%';

        scanMsgInterval = setInterval(() => {
            msgIndex = (msgIndex + 1) % SCAN_MESSAGES.length;
            scanText.textContent = SCAN_MESSAGES[msgIndex];
        }, 1800);

        progressInterval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 8, 90);
            scanProgressBar.style.width = progress + '%';
        }, 400);
    }

    // ── Hide Scan Animation ────────────────────────────────────────
    function hideScanAnimation() {
        clearInterval(scanMsgInterval);
        clearInterval(progressInterval);
        scanProgressBar.style.width = '100%';

        setTimeout(() => {
            scanOverlay.classList.remove('active');
            scanBtn.disabled = false;
        }, 500);
    }

    // ── Show Error ─────────────────────────────────────────────────
    function showError(message) {
        errorText.textContent = message;
        errorCard.style.display = 'block';
        resultsPanel.style.display = 'none';
    }

    // ── Render Score Gauge ─────────────────────────────────────────
    function renderScore(score) {
        const circumference = 2 * Math.PI * 70; // r=70
        const offset = circumference - (score / 100) * circumference;

        // Color based on score
        let color;
        if (score <= 25) color = '#00e676';
        else if (score <= 45) color = '#ffab00';
        else if (score <= 65) color = '#ff6d00';
        else if (score <= 85) color = '#dc143c';
        else color = '#ff1744';

        gaugeFill.style.stroke = color;
        gaugeFill.style.strokeDasharray = circumference;

        // Animate
        setTimeout(() => {
            gaugeFill.style.strokeDashoffset = offset;
        }, 100);

        // Animate number
        animateCounter(scoreValue, 0, score, 1500);
    }

    function animateCounter(el, start, end, duration) {
        const startTime = performance.now();
        function update(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(start + (end - start) * eased);
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    }

    // ── Render Verdict ─────────────────────────────────────────────
    function renderVerdict(analysis) {
        const verdict = (analysis.verdict || '').toUpperCase();

        // Remove old classes
        verdictBadge.className = 'verdict-badge';

        if (verdict.includes('SAFE')) verdictBadge.classList.add('safe');
        else if (verdict.includes('LOW')) verdictBadge.classList.add('low');
        else if (verdict.includes('MODERATE')) verdictBadge.classList.add('moderate');
        else if (verdict.includes('HIGH')) verdictBadge.classList.add('high');
        else if (verdict.includes('CRITICAL')) verdictBadge.classList.add('critical');
        else verdictBadge.classList.add('high');

        verdictBadge.textContent = analysis.verdict || 'UNKNOWN';
        manipulationType.textContent = analysis.manipulationType || 'Analysis complete';
        recommendation.textContent = analysis.recommendation || '';
    }

    // ── Render Red Flags ───────────────────────────────────────────
    function renderFlags(flags) {
        flagsList.innerHTML = '';
        if (!flags || !flags.length) {
            flagsCard.style.display = 'none';
            return;
        }

        flagsCard.style.display = 'block';
        flags.forEach((flag, i) => {
            const li = document.createElement('li');
            li.textContent = flag;
            li.style.animationDelay = `${i * 0.1}s`;
            flagsList.appendChild(li);
        });
    }

    // ── Render Stock Info ──────────────────────────────────────────
    function renderStockInfo(data) {
        if (!data) {
            stockInfoCard.style.display = 'none';
            return;
        }

        stockInfoCard.style.display = 'block';
        stockName.textContent = data.name;
        stockSymbol.textContent = data.symbol;
        stockPrice.textContent = '₹' + (data.price?.toLocaleString('en-IN') || '—');

        const changeVal = parseFloat(data.change);
        stockChange.textContent = (changeVal >= 0 ? '+' : '') + data.change + '%';
        stockChange.className = 'stock-change ' + (changeVal >= 0 ? 'positive' : 'negative');

        stockMcap.textContent = data.marketCap ? '₹' + (data.marketCap / 10000000).toFixed(0) + ' Cr' : '—';
        stockPE.textContent = data.peRatio ? data.peRatio.toFixed(1) : '—';
        stockVolSpike.textContent = data.volumeSpike || '—';
        stockPriceChange.textContent = data.priceChange90d || '—';
    }

    // ── Form Submit → Analyze ──────────────────────────────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const symbol = symbolInput.value.trim();
        const tip = tipInput.value.trim();

        if (!symbol && !tip) {
            showError('Please enter a stock symbol or paste a suspicious tip to analyze.');
            return;
        }

        showScanAnimation();

        try {
            const res = await fetch(`${API_BASE}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, tip }),
            });

            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Server did not return JSON. Make sure you are running 'node server.js' on port 3000.");
            }

            const data = await res.json();

            hideScanAnimation();

            if (!res.ok || data.error) {
                showError(data.error || 'Analysis failed. Please try again.');
                return;
            }

            // Reset gauge
            gaugeFill.style.strokeDashoffset = 440;
            scoreValue.textContent = '0';

            // Show results
            resultsPanel.style.display = 'flex';
            errorCard.style.display = 'none';

            renderStockInfo(data.stockData);
            renderScore(data.analysis.score);
            renderVerdict(data.analysis);
            renderFlags(data.analysis.redFlags);
            analysisText.textContent = data.analysis.analysis || 'No detailed analysis available.';

            // Scroll to results
            resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            hideScanAnimation();
            const errMsg = err.message.includes('Server did not return JSON')
                ? err.message
                : 'Network error. Ensure the backend server is running (node server.js) on port 3000.';
            showError(errMsg);
            console.error(err);
        }
    });

    // ── Alert Feed ─────────────────────────────────────────────────
    async function loadAlerts() {
        try {
            const res = await fetch(`${API_BASE}/api/alerts`);
            const alerts = await res.json();

            alertFeed.innerHTML = '';
            alertCount.textContent = alerts.length;

            alerts.forEach((alert, i) => {
                const card = document.createElement('div');
                card.className = 'alert-card';
                card.style.animationDelay = `${i * 0.08}s`;

                const scoreColor =
                    alert.score >= 70 ? 'var(--red-bright)' :
                        alert.score >= 45 ? 'var(--yellow)' :
                            'var(--green)';

                card.innerHTML = `
          <div class="alert-card-top">
            <span class="alert-stock-name">${alert.name}</span>
            <span class="alert-severity ${alert.severity}">${alert.severity}</span>
          </div>
          <div class="alert-type">${alert.alertType}</div>
          <div class="alert-card-bottom">
            <span class="alert-score" style="color:${scoreColor}">Score: ${alert.score}</span>
            <span class="alert-time">${alert.minutesAgo === 0 ? 'Just now' : alert.minutesAgo + 'm ago'}</span>
          </div>
        `;

                // Click to auto-fill & scan
                card.addEventListener('click', () => {
                    symbolInput.value = alert.symbol;
                    tipInput.value = '';
                    symbolInput.focus();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });

                alertFeed.appendChild(card);
            });
        } catch (err) {
            console.error('Failed to load alerts:', err);
        }
    }

    // Load initial alerts and refresh every 30s
    loadAlerts();
    setInterval(loadAlerts, 30000);

    // ── Keyboard shortcut ──────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            form.dispatchEvent(new Event('submit'));
        }
    });
});
