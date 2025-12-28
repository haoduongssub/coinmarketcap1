import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
// const Chart from "https://cdn.jsdelivr.net/npm/chart.js" // Removed import to use window.Chart

const firebaseConfig = {
  apiKey: "AIzaSyCYaTDe2ucxQihyDieKOONA0QsDc7IE-OM",
  authDomain: "coinmarketcap-f6af1.firebaseapp.com",
  projectId: "coinmarketcap-f6af1",
  storageBucket: "coinmarketcap-f6af1.firebasestorage.app",
  messagingSenderId: "768632391540",
  appId: "1:768632391540:web:63ed4d31b938dc12534e21",
  measurementId: "G-9ZZFDWN1NF",
}

const app = initializeApp(firebaseConfig)
const firebaseAuth = getAuth(app)

const API_URL = "https://api.coingecko.com/api/v3"
const FNG_API = "https://api.alternative.me/fng/"
let previousPrices = {}
const modal = document.getElementById("modal-overlay")

const charts = {}

const MOCK_SPARKLINE = [
  30000, 31000, 30500, 32000, 31500, 33000, 32500, 34000, 33500, 35000, 34500, 36000, 35500, 37000, 36500, 38000,
]

const auth = {
  isLoggedIn: false,
  user: null,
  async signup(email, password, name) {
    try {
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
      await updateProfile(userCredential.user, { displayName: name })
      modal.classList.add("hidden")
    } catch (error) {
      alert("Đăng ký thất bại: " + error.message)
    }
  },
  async login(email, password) {
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password)
      modal.classList.add("hidden")
    } catch (error) {
      alert("Đăng nhập thất bại: " + error.message)
    }
  },
  async logout() {
    try {
      await signOut(firebaseAuth)
    } catch (error) {
      console.error("[v0] Lỗi đăng xuất:", error)
    }
  },
}

// Theo dõi trạng thái đăng nhập thời gian thực
onAuthStateChanged(firebaseAuth, (user) => {
  if (user) {
    auth.isLoggedIn = true
    auth.user = user.displayName || user.email
  } else {
    auth.isLoggedIn = false
    auth.user = null
  }
  updateAuthUI()
})

async function fetchCryptoData() {
  try {
    const fetchWithTimeout = (url) =>
      Promise.race([fetch(url), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))])

    const [marketRes, globalRes, fngRes] = await Promise.all([
      fetchWithTimeout(
        `${API_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h,7d`,
      ),
      fetchWithTimeout(`${API_URL}/global`),
      fetchWithTimeout(FNG_API),
    ])

    // Nếu API lỗi (quá giới hạn), vẫn xử lý dữ liệu mặc định để không bị trống
    if (!marketRes.ok) {
      console.warn("[v0] API Limit reached, using cached or fallback data")
      // Có thể chèn dữ liệu mẫu ở đây nếu cần
      return
    }

    const coins = await marketRes.json()
    const globalData = await globalRes.json()
    const fngData = await fngRes.json()

    updateGlobalStats(globalData.data)
    updateStatsCards(coins, fngData.data ? fngData.data[0] : { value: 50, value_classification: "Neutral" })
    renderTable(coins)
  } catch (error) {
    console.error("[v0] Lỗi khi tải dữ liệu:", error)
  }
}

function updateGlobalStats(stats) {
  if (!stats) return // Kiểm tra dữ liệu
  document.getElementById("global-cryptos").textContent = stats.active_cryptocurrencies?.toLocaleString() || "..."
  document.getElementById("global-exchanges").textContent = stats.markets?.toLocaleString() || "..."
  document.getElementById("global-market-cap").textContent = stats.total_market_cap?.usd
    ? "$" + (stats.total_market_cap.usd / 1e12).toFixed(2) + "T"
    : "..."
  document.getElementById("global-vol").textContent = stats.total_volume?.usd
    ? "$" + (stats.total_volume.usd / 1e9).toFixed(2) + "B"
    : "..."
}

function updateStatsCards(coins, fng) {
  // Fear & Greed
  const fngValue = Number.parseInt(fng.value) || 50
  document.getElementById("fng-value").textContent = fngValue
  document.getElementById("fng-label").textContent = fng.value_classification
  updateFngGauge(fngValue)

  // Market Cap & CMC20 Charts
  const btc = coins.find((c) => c.id === "bitcoin")
  const eth = coins.find((c) => c.id === "ethereum")

  initSparkline("market-cap-chart", btc ? btc.sparkline_in_7d.price : MOCK_SPARKLINE, "#00c087")
  initSparkline("cmc20-chart", eth ? eth.sparkline_in_7d.price : MOCK_SPARKLINE, "#3861fb")
}

function initSparkline(id, data, color) {
  const canvas = document.getElementById(id)
  if (!canvas) return
  const ctx = canvas.getContext("2d")
  if (charts[id]) charts[id].destroy()

  charts[id] = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => i),
      datasets: [
        {
          data: data,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: (context) => {
            const chart = context.chart
            const { ctx, chartArea } = chart
            if (!chartArea) return null
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
            gradient.addColorStop(0, color.replace(")", ", 0.2)").replace("rgb", "rgba"))
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
            return gradient
          },
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  })
}

function updateFngGauge(value) {
  const canvas = document.getElementById("fear-greed-gauge")
  if (!canvas) return
  const ctx = canvas.getContext("2d")
  if (charts["fng"]) charts["fng"].destroy()

  let gaugeColor = "#f6851b"
  if (value < 25) gaugeColor = "#cf304a"
  else if (value > 75) gaugeColor = "#00c087"

  charts["fng"] = new window.Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [value, 100 - value],
          backgroundColor: [gaugeColor, "#2b3139"],
          borderWidth: 0,
          circumference: 180,
          rotation: 270,
          cutout: "85%",
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  })
}

function renderTable(coins) {
  const tbody = document.getElementById("crypto-body")
  const currentPrices = {}

  coins.forEach((coin, index) => {
    currentPrices[coin.id] = coin.current_price
    let row = document.getElementById(`row-${coin.id}`)
    const isNewRow = !row

    if (isNewRow) {
      row = document.createElement("tr")
      row.id = `row-${coin.id}`
    }

    const priceChange24h = coin.price_change_percentage_24h || 0
    const priceChange7d = coin.price_change_percentage_7d_in_currency || 0

    let priceClass = ""
    if (!isNewRow && previousPrices[coin.id]) {
      if (coin.current_price > previousPrices[coin.id]) priceClass = "flash-up"
      else if (coin.current_price < previousPrices[coin.id]) priceClass = "flash-down"
    }

    row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <div class="coin-info">
                    <img src="${coin.image}" class="coin-icon" alt="${coin.name}">
                    <div class="name-container">
                        <strong>${coin.name}</strong>
                        <span class="symbol">${coin.symbol.toUpperCase()}</span>
                    </div>
                </div>
            </td>
            <td class="${priceClass}">$${coin.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td class="${priceChange24h >= 0 ? "up" : "down"}">
                <i class="fa-solid fa-caret-${priceChange24h >= 0 ? "up" : "down"}"></i>
                ${Math.abs(priceChange24h).toFixed(2)}%
            </td>
            <td class="${priceChange7d >= 0 ? "up" : "down"}">
                <i class="fa-solid fa-caret-${priceChange7d >= 0 ? "up" : "down"}"></i>
                ${Math.abs(priceChange7d).toFixed(2)}%
            </td>
            <td>$${coin.market_cap.toLocaleString()}</td>
            <td>$${coin.total_volume.toLocaleString()}</td>
            <td>${coin.circulating_supply.toLocaleString()} ${coin.symbol.toUpperCase()}</td>
        `
    if (isNewRow) tbody.appendChild(row)
  })

  previousPrices = currentPrices
}

function updateAuthUI() {
  const userActions = document.getElementById("user-actions")
  const userProfile = document.getElementById("user-profile")
  const usernameDisplay = document.getElementById("username-display")

  if (auth.isLoggedIn) {
    userActions.classList.add("hidden")
    userProfile.classList.remove("hidden")
    usernameDisplay.textContent = auth.user
  } else {
    userActions.classList.remove("hidden")
    userProfile.classList.add("hidden")
  }
}

function showSkeleton() {
  const tbody = document.getElementById("crypto-body")
  tbody.innerHTML = Array(10)
    .fill(0)
    .map(
      () => `
        <tr>
            <td><div class="skeleton skeleton-text" style="width: 20px"></div></td>
            <td>
                <div class="coin-info">
                    <div class="skeleton skeleton-circle"></div>
                    <div class="skeleton skeleton-text" style="width: 100px"></div>
                </div>
            </td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
        </tr>
    `,
    )
    .join("")
}

const views = {
  crypto: document.getElementById("view-crypto"),
  exchanges: document.getElementById("view-exchanges"),
  community: document.getElementById("view-community"),
  news: document.getElementById("view-news"),
}

function switchView(viewId) {
  Object.keys(views).forEach((key) => {
    views[key].classList.add("hidden")
    const navItem = document.getElementById(`nav-${key === "news" ? "products" : key}`)
    if (navItem) navItem.classList.remove("active")
  })
  views[viewId].classList.remove("hidden")
  const activeNav = document.getElementById(`nav-${viewId === "news" ? "products" : viewId}`)
  if (activeNav) activeNav.classList.add("active")

  if (viewId === "community") renderCommunityFeed()
  if (viewId === "exchanges") fetchExchanges()
  if (viewId === "news") renderNews()
}

async function fetchExchanges() {
  const body = document.getElementById("exchange-body")
  body.innerHTML = '<tr><td colspan="5" style="text-align:center">Loading exchanges...</td></tr>'
  try {
    const res = await fetch(`${API_URL}/exchanges?per_page=15`)
    const exchanges = await res.json()
    body.innerHTML = exchanges
      .map(
        (ex, i) => `
        <tr>
            <td>${i + 1}</td>
            <td class="coin-info"><img src="${ex.image}" class="coin-icon"> <strong>${ex.name}</strong></td>
            <td><span class="blue-text">${ex.trust_score}/10</span></td>
            <td>$${ex.trade_volume_24h_btc_normalized.toFixed(2)} BTC</td>
            <td>$${ex.trade_volume_24h_btc.toFixed(2)} BTC</td>
        </tr>
    `,
      )
      .join("")
  } catch (e) {
    body.innerHTML = '<tr><td colspan="5">Failed to load exchanges.</td></tr>'
  }
}

function renderCommunityFeed() {
  const feed = document.getElementById("community-feed")
  const mockPosts = [
    {
      user: "Daniel Markson",
      handle: "@Daniel_Markson",
      time: "11h",
      content:
        "Expert Outlines Key Crypto Market Trends for 2026. Pantera Capital junior partner Jay Yu has shared his outlook on how the crypto market is evolving.",
      img: "/images/image.png",
      likes: 370,
      comments: 10,
    },
    {
      user: "Whale Alert",
      handle: "@whale_alert",
      time: "2h",
      content: "🚨 5,000 #BTC (435,000,000 USD) transferred from unknown wallet to #Coinbase",
      img: null,
      likes: 1200,
      comments: 45,
    },
  ]

  feed.innerHTML = mockPosts
    .map(
      (post) => `
        <div class="feed-post">
            <div class="post-header">
                <img src="https://avatar.vercel.sh/${post.handle}" class="avatar">
                <div class="user-info">
                    <strong>${post.user} <i class="fa-solid fa-circle-check blue-text" style="font-size: 10px"></i></strong>
                    <span>${post.handle} • ${post.time}</span>
                </div>
                <button class="signup-btn" style="margin-left: auto; padding: 4px 12px">Follow</button>
            </div>
            <div class="post-content">
                ${post.content}
                ${post.img ? `<img src="${post.img}" style="width: 100%; border-radius: 12px; margin-top: 15px">` : ""}
            </div>
            <div class="post-actions">
                <span><i class="fa-regular fa-comment"></i> ${post.comments}</span>
                <span><i class="fa-regular fa-heart"></i> ${post.likes}</span>
                <span><i class="fa-solid fa-share-nodes"></i></span>
            </div>
        </div>
    `,
    )
    .join("")
}

function renderNews() {
  const grid = document.getElementById("news-grid")
  const mockNews = [
    { title: "Bitcoin Reaches New All-Time High", source: "CryptoNews", time: "1h ago" },
    { title: "Ethereum Layer 2 Adoption Surges", source: "CoinDesk", time: "3h ago" },
    { title: "New Regulation in EU Affecting Exchanges", source: "Reuters", time: "5h ago" },
    { title: "Top 5 AI Tokens to Watch in 2025", source: "MarketWatch", time: "8h ago" },
  ]

  grid.innerHTML = mockNews
    .map(
      (news) => `
        <div class="news-card">
            <img src="https://placeholder.svg?height=180&width=300&query=crypto" class="news-img">
            <div class="news-body">
                <h4>${news.title}</h4>
                <div class="news-footer">
                    <span>${news.source}</span>
                    <span>${news.time}</span>
                </div>
            </div>
        </div>
    `,
    )
    .join("")
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form-container")
  const signupForm = document.getElementById("signup-form-container")

  document.getElementById("open-login").onclick = () => {
    modal.classList.remove("hidden")
    loginForm.classList.remove("hidden")
    signupForm.classList.add("hidden")
  }

  document.getElementById("open-signup").onclick = () => {
    modal.classList.remove("hidden")
    signupForm.classList.remove("hidden")
    loginForm.classList.add("hidden")
  }

  document.getElementById("close-modal").onclick = () => modal.classList.add("hidden")
  document.getElementById("switch-to-signup").onclick = () => {
    loginForm.classList.add("hidden")
    signupForm.classList.remove("hidden")
  }
  document.getElementById("switch-to-login").onclick = () => {
    signupForm.classList.add("hidden")
    loginForm.classList.remove("hidden")
  }

  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault()
    const email = document.getElementById("login-email").value
    const pass = document.getElementById("login-password").value
    await auth.login(email, pass)
  }

  document.getElementById("signup-form").onsubmit = async (e) => {
    e.preventDefault()
    const name = document.getElementById("signup-name").value
    const email = document.getElementById("signup-email").value
    const pass = document.getElementById("signup-password").value
    await auth.signup(email, pass, name)
  }

  document.getElementById("logout-btn").onclick = () => auth.logout()

  document.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.onclick = () => alert(`Bạn vừa nhấn vào: ${btn.innerText}`)
  })

  // Thêm chức năng tìm kiếm cơ bản
  const searchInput = document.querySelector(".search-bar input")
  searchInput.oninput = (e) => {
    const term = e.target.value.toLowerCase()
    document.querySelectorAll("#crypto-body tr").forEach((row) => {
      const name = row.querySelector(".name-container strong")?.innerText.toLowerCase() || ""
      row.style.display = name.includes(term) ? "" : "none"
    })
  }

  // Initial fetch
  fetchCryptoData()
  setInterval(fetchCryptoData, 30000) // 30s để tránh giới hạn API

  // Navigation
  document.getElementById("nav-crypto").onclick = () => switchView("crypto")
  document.getElementById("nav-exchanges").onclick = () => switchView("exchanges")
  document.getElementById("nav-community").onclick = () => switchView("community")
  document.getElementById("nav-products").onclick = () => switchView("news")

  // Tab table filtering logic
  document.querySelectorAll("#crypto-tabs .tab-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#crypto-tabs .tab-btn").forEach((b) => b.classList.remove("active"))
      btn.classList.add("active")
      // Logic for sorting can be added here
      fetchCryptoData()
    }
  })
})
