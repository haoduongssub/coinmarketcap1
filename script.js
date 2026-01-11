// ==================== FIREBASE CONFIG & IMPORTS ====================
// Import Firebase Authentication functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
import {
  getAuth, // Lấy instance xác thực
  createUserWithEmailAndPassword, // Tạo tài khoản mới
  signInWithEmailAndPassword, // Đăng nhập
  onAuthStateChanged, // Theo dõi trạng thái đăng nhập
  signOut, // Đăng xuất
  updateProfile, // Cập nhật thông tin hồ sơ
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"

// Import Firebase Firestore functions
import {
  getFirestore, // Lấy instance cơ sở dữ liệu
  collection, // Tham chiếu tới collection
  addDoc, // Thêm document mới
  getDocs, // Lấy tất cả documents
  deleteDoc, // Xóa document
  doc, // Tham chiếu tới document
  updateDoc, // Cập nhật document
  query, // Tạo query
  where, // Điều kiện WHERE
  onSnapshot, // Lắng nghe thay đổi realtime
  Timestamp, // Timestamp Firebase
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

// Cấu hình Firebase (thay đổi thành key của bạn)
const firebaseConfig = {
  apiKey: "AIzaSyCYaTDe2ucxQihyDieKOONA0QsDc7IE-OM",
  authDomain: "coinmarketcap-f6af1.firebaseapp.com",
  projectId: "coinmarketcap-f6af1",
  storageBucket: "coinmarketcap-f6af1.firebasestorage.app",
  messagingSenderId: "768632391540",
  appId: "1:768632391540:web:63ed4d31b938dc12534e21",
  measurementId: "G-9ZZFDWN1NF",
}

// Khởi tạo Firebase app
const app = initializeApp(firebaseConfig)
// Lấy instance xác thực
const firebaseAuth = getAuth(app)
// Lấy instance Firestore database
const db = getFirestore(app)

// ==================== GLOBAL CONSTANTS & VARIABLES ====================
const API_URL = "https://api.coingecko.com/api/v3" // URL API CoinGecko
const FNG_API = "https://api.alternative.me/fng/" // URL API Fear & Greed
let previousPrices = {} // Lưu giá trước đó để so sánh
const currentPrices = {} // Giá hiện tại của các coin
let selectedSentiment = "bullish" // Cảm xúc được chọn (bullish/bearish)

const modal = document.getElementById("modal-overlay") // Modal xác thực
const charts = {} // Lưu trữ các Chart.js instances
const MOCK_SPARKLINE = [
  // Dữ liệu mẫu cho biểu đồ
  30000, 31000, 30500, 32000, 31500, 33000, 32500, 34000, 33500, 35000, 34500, 36000, 35500, 37000, 36500, 38000,
]

let userPortfolio = [] // Danh sách portfolio của người dùng
let userAlerts = [] // Danh sách alerts của người dùng

// ==================== AUTHENTICATION OBJECT ====================
const auth = {
  isLoggedIn: false, // Trạng thái đăng nhập
  user: null, // Thông tin người dùng
  userId: null, // ID người dùng (UID từ Firebase)

  // Hàm đăng ký tài khoản mới
  async signup(email, password, name) {
    try {
      // Tạo tài khoản Firebase mới
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
      // Cập nhật tên hiển thị
      await updateProfile(userCredential.user, { displayName: name })
      // Đóng modal nếu thành công
      modal.classList.add("hidden")
    } catch (error) {
      alert("Đăng ký thất bại: " + error.message)
    }
  },

  // Hàm đăng nhập
  async login(email, password) {
    try {
      // Đăng nhập bằng email & password
      await signInWithEmailAndPassword(firebaseAuth, email, password)
      // Đóng modal nếu thành công
      modal.classList.add("hidden")
    } catch (error) {
      alert("Đăng nhập thất bại: " + error.message)
    }
  },

  // Hàm đăng xuất
  async logout() {
    try {
      // Đăng xuất khỏi Firebase
      await signOut(firebaseAuth)
    } catch (error) {
      console.error("[v0] Lỗi đăng xuất:", error)
    }
  },
}

// ==================== FIREBASE AUTHENTICATION STATE LISTENER ====================
// Theo dõi thay đổi trạng thái xác thực realtime
onAuthStateChanged(firebaseAuth, (user) => {
  if (user) {
    // Nếu người dùng đã đăng nhập
    auth.isLoggedIn = true
    auth.user = user.displayName || user.email // Lấy tên hiển thị hoặc email
    auth.userId = user.uid // Lưu UID để xác định dữ liệu người dùng
    loadUserPortfolio() // Tải portfolio từ Firestore
    loadUserAlerts() // Tải alerts từ Firestore
    setupCommunityListener() // Lắng nghe bài viết community
  } else {
    // Nếu người dùng chưa đăng nhập
    auth.isLoggedIn = false
    auth.user = null
    auth.userId = null
    userPortfolio = [] // Xóa portfolio cục bộ
    userAlerts = [] // Xóa alerts cục bộ
  }
  updateAuthUI() // Cập nhật giao diện xác thực
})

// ==================== PORTFOLIO FUNCTIONS ====================
// Tải portfolio của người dùng từ Firestore
async function loadUserPortfolio() {
  if (!auth.userId) return // Kiểm tra người dùng đã đăng nhập
  try {
    // Tạo query để lấy portfolios của người dùng hiện tại
    const q = query(collection(db, "portfolios"), where("userId", "==", auth.userId))
    // Thực thi query
    const querySnapshot = await getDocs(q)
    userPortfolio = [] // Làm sạch mảng
    // Lặp qua từng document
    querySnapshot.forEach((doc) => {
      userPortfolio.push({ id: doc.id, ...doc.data() })
    })
    renderPortfolio() // Hiển thị portfolio
  } catch (error) {
    console.error("[v0] Lỗi tải portfolio:", error)
  }
}

// Thêm item vào portfolio
async function addPortfolioItem(coinName, quantity) {
  if (!auth.userId) {
    // Kiểm tra xác thực
    alert("Vui lòng đăng nhập trước")
    return
  }
  try {
    const normalizedName = coinName.toLowerCase() // Chuẩn hóa tên coin
    // Kiểm tra item đã tồn tại chưa
    const existingItem = userPortfolio.find((p) => p.coinName.toLowerCase() === normalizedName)

    if (existingItem) {
      // Nếu đã tồn tại, cộng thêm số lượng
      await updateDoc(doc(db, "portfolios", existingItem.id), {
        quantity: Number(existingItem.quantity) + Number(quantity),
        updatedAt: Timestamp.now(),
      })
    } else {
      // Nếu chưa tồn tại, tạo mới
      await addDoc(collection(db, "portfolios"), {
        userId: auth.userId, // ID người dùng
        coinName: coinName, // Tên coin
        quantity: Number(quantity), // Số lượng
        createdAt: Timestamp.now(), // Thời gian tạo
        updatedAt: Timestamp.now(), // Thời gian cập nhật
      })
    }
    await loadUserPortfolio() // Tải lại portfolio
  } catch (error) {
    console.error("[v0] Lỗi thêm portfolio:", error)
    alert("Lỗi khi thêm vào portfolio")
  }
}

// Xóa item khỏi portfolio
async function deletePortfolioItem(itemId) {
  if (!auth.userId) return
  try {
    // Xóa document từ Firestore
    await deleteDoc(doc(db, "portfolios", itemId))
    await loadUserPortfolio() // Tải lại portfolio
  } catch (error) {
    console.error("[v0] Lỗi xóa portfolio:", error)
  }
}

// Hiển thị portfolio trên giao diện
function renderPortfolio() {
  const tbody = document.getElementById("portfolio-body") // Lấy tbody của bảng
  tbody.innerHTML = "" // Xóa nội dung cũ

  let totalValue = 0 // Tổng giá trị
  let totalChange = 0 // Tổng thay đổi 24h

  // Lặp qua từng item portfolio
  userPortfolio.forEach((item) => {
    const price = currentPrices[item.coinName.toLowerCase()] || 0 // Lấy giá hiện tại
    const value = price * item.quantity // Tính giá trị
    const change = (currentPrices[`${item.coinName.toLowerCase()}_change`] || 0) * item.quantity // Tính thay đổi

    totalValue += value
    totalChange += change

    // Tạo hàng mới cho bảng
    const row = document.createElement("tr")
    row.innerHTML = `
      <td>${item.coinName}</td>
      <td>${item.quantity}</td>
      <td>$${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      <td>$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      <td class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</td>
      <td><button class="delete-btn" onclick="deletePortfolioItem('${item.id}')">Delete</button></td>
    `
    tbody.appendChild(row)
  })

  // Cập nhật tổng giá trị
  document.getElementById("portfolio-total").textContent =
    `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  // Cập nhật tổng thay đổi
  document.getElementById("portfolio-change").textContent = `${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}%`
}

// ==================== ALERTS FUNCTIONS ====================
// Tải alerts của người dùng từ Firestore
async function loadUserAlerts() {
  if (!auth.userId) return
  try {
    // Tạo query để lấy alerts của người dùng
    const q = query(collection(db, "alerts"), where("userId", "==", auth.userId))
    const querySnapshot = await getDocs(q)
    userAlerts = []
    querySnapshot.forEach((doc) => {
      userAlerts.push({ id: doc.id, ...doc.data() })
    })
    renderAlerts() // Hiển thị alerts
  } catch (error) {
    console.error("[v0] Lỗi tải alerts:", error)
  }
}

// Thêm alert mới
async function addAlert(coinName, alertPrice, type) {
  if (!auth.userId) {
    alert("Vui lòng đăng nhập trước")
    return
  }
  try {
    // Thêm alert vào Firestore
    await addDoc(collection(db, "alerts"), {
      userId: auth.userId,
      coinName: coinName, // Tên coin
      alertPrice: Number(alertPrice), // Giá alert
      type: type, // Loại (above/below)
      triggered: false, // Trạng thái kích hoạt
      createdAt: Timestamp.now(),
    })
    await loadUserAlerts() // Tải lại alerts
  } catch (error) {
    console.error("[v0] Lỗi thêm alert:", error)
    alert("Lỗi khi tạo alert")
  }
}

// Xóa alert
async function deleteAlert(alertId) {
  if (!auth.userId) return
  try {
    // Xóa alert từ Firestore
    await deleteDoc(doc(db, "alerts", alertId))
    await loadUserAlerts()
  } catch (error) {
    console.error("[v0] Lỗi xóa alert:", error)
  }
}

// Hiển thị alerts trên giao diện
function renderAlerts() {
  const tbody = document.getElementById("alerts-body")
  tbody.innerHTML = ""

  // Lặp qua từng alert
  userAlerts.forEach((alert) => {
    const currentPrice = currentPrices[alert.coinName.toLowerCase()] || 0 // Lấy giá hiện tại
    let status = "Waiting" // Trạng thái mặc định
    let triggered = false

    // Kiểm tra xem alert có được kích hoạt không
    if (alert.type === "above" && currentPrice >= alert.alertPrice) {
      // Nếu giá >= giá alert
      status = "Triggered!"
      triggered = true
    } else if (alert.type === "below" && currentPrice <= alert.alertPrice) {
      // Nếu giá <= giá alert
      status = "Triggered!"
      triggered = true
    }

    // Tạo hàng mới cho bảng
    const row = document.createElement("tr")
    row.innerHTML = `
      <td>${alert.coinName}</td>
      <td>$${alert.alertPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      <td>${alert.type === "above" ? "Above" : "Below"}</td>
      <td>$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      <td class="${triggered ? "triggered" : ""}">${status}</td>
      <td><button class="delete-btn" onclick="deleteAlert('${alert.id}')">Delete</button></td>
    `
    tbody.appendChild(row)

    // Nếu alert được kích hoạt lần đầu, hiển thị thông báo
    if (triggered && !alert.triggered) {
      updateDoc(doc(db, "alerts", alert.id), { triggered: true })
      alert(`Alert: ${alert.coinName} price is now ${alert.type === "above" ? "above" : "below"} $${alert.alertPrice}!`)
    }
  })
}

// ==================== COMMUNITY FUNCTIONS ====================
// Thiết lập lắng nghe bài viết community realtime
async function setupCommunityListener() {
  if (!auth.userId) return
  try {
    // Tạo query để lấy tất cả bài viết
    const q = query(collection(db, "communityPosts"))
    // Lắng nghe thay đổi realtime
    onSnapshot(q, (querySnapshot) => {
      const posts = []
      querySnapshot.forEach((doc) => {
        posts.push({ id: doc.id, ...doc.data() })
      })
      // Sắp xếp theo thời gian mới nhất
      posts.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
      renderCommunityFeed(posts)
    })
  } catch (error) {
    console.error("[v0] Lỗi setup community listener:", error)
  }
}

// Đăng bài viết community
async function postCommunityMessage(content, sentiment) {
  if (!auth.userId) {
    alert("Vui lòng đăng nhập trước")
    return
  }
  try {
    // Thêm bài viết vào Firestore
    await addDoc(collection(db, "communityPosts"), {
      userId: auth.userId,
      username: auth.user, // Tên người dùng
      content: content, // Nội dung bài viết
      sentiment: sentiment, // Cảm xúc (bullish/bearish)
      likes: 0, // Số lượt thích
      comments: 0, // Số bình luận
      createdAt: Timestamp.now(),
    })
  } catch (error) {
    console.error("[v0] Lỗi post community message:", error)
    alert("Lỗi khi đăng bài")
  }
}

// ==================== CRYPTO DATA FETCHING ====================
// Tải dữ liệu tiền điện tử từ API
async function fetchCryptoData() {
  try {
    // Hàm fetch với timeout 8 giây
    const fetchWithTimeout = (url) =>
      Promise.race([fetch(url), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))])

    // Fetch 3 endpoint cùng lúc (coins, global data, fear & greed)
    const [marketRes, globalRes, fngRes] = await Promise.all([
      fetchWithTimeout(
        `${API_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h,7d`,
      ),
      fetchWithTimeout(`${API_URL}/global`),
      fetchWithTimeout(FNG_API),
    ])

    // Kiểm tra lỗi API
    if (!marketRes.ok) {
      console.warn("[v0] API Limit reached")
      return
    }

    // Parse JSON response
    const coins = await marketRes.json()
    const globalData = await globalRes.json()
    const fngData = await fngRes.json()

    // Lưu giá hiện tại vào object để tính toán portfolio
    coins.forEach((coin) => {
      currentPrices[coin.id] = coin.current_price
      currentPrices[`${coin.id}_change`] = coin.price_change_percentage_24h_in_currency || 0
    })

    // Cập nhật các phần khác nhau của giao diện
    updateGlobalStats(globalData.data)
    updateStatsCards(coins, fngData.data ? fngData.data[0] : { value: 50, value_classification: "Neutral" })
    renderTable(coins)
    renderPortfolio() // Cập nhật portfolio với giá mới
    renderAlerts() // Cập nhật alerts (kiểm tra trigger)
  } catch (error) {
    console.error("[v0] Lỗi khi tải dữ liệu:", error)
  }
}

// Cập nhật thống kê toàn cầu
function updateGlobalStats(stats) {
  if (!stats) return
  // Hiển thị số lượng crypto
  document.getElementById("global-cryptos").textContent = stats.active_cryptocurrencies?.toLocaleString() || "..."
  // Hiển thị số sàn giao dịch
  document.getElementById("global-exchanges").textContent = stats.markets?.toLocaleString() || "..."
  // Hiển thị vốn hóa thị trường (chuyển sang Trillions)
  document.getElementById("global-market-cap").textContent = stats.total_market_cap?.usd
    ? "$" + (stats.total_market_cap.usd / 1e12).toFixed(2) + "T"
    : "..."
  // Hiển thị khối lượng 24h (chuyển sang Billions)
  document.getElementById("global-vol").textContent = stats.total_volume?.usd
    ? "$" + (stats.total_volume.usd / 1e9).toFixed(2) + "B"
    : "..."
}

// Cập nhật các thẻ thống kê (biểu đồ)
function updateStatsCards(coins, fng) {
  // Cập nhật Fear & Greed Index
  const fngValue = Number.parseInt(fng.value) || 50 // Lấy giá trị F&G
  document.getElementById("fng-value").textContent = fngValue
  document.getElementById("fng-label").textContent = fng.value_classification // Phân loại (Fear/Greed)
  updateFngGauge(fngValue) // Vẽ gauge

  // Tìm Bitcoin và Ethereum
  const btc = coins.find((c) => c.id === "bitcoin")
  const eth = coins.find((c) => c.id === "ethereum")

  // Vẽ biểu đồ sparkline cho Market Cap và CMC20
  initSparkline("market-cap-chart", btc ? btc.sparkline_in_7d.price : MOCK_SPARKLINE, "#00c087")
  initSparkline("cmc20-chart", eth ? eth.sparkline_in_7d.price : MOCK_SPARKLINE, "#3861fb")
}

// Khởi tạo biểu đồ sparkline (đường thẳng nhỏ)
function initSparkline(id, data, color) {
  const canvas = document.getElementById(id)
  if (!canvas) return
  const ctx = canvas.getContext("2d")
  // Hủy biểu đồ cũ nếu tồn tại
  if (charts[id]) charts[id].destroy()

  // Tạo biểu đồ Chart.js
  charts[id] = new window.Chart(ctx, {
    type: "line", // Loại biểu đồ: line
    data: {
      labels: data.map((_, i) => i), // Tạo nhãn từ 0 đến n
      datasets: [
        {
          data: data, // Dữ liệu giá
          borderColor: color, // Màu đường
          borderWidth: 2, // Độ dày đường
          pointRadius: 0, // Không hiển thị điểm
          fill: true, // Tô màu dưới đường
          backgroundColor: (context) => {
            // Hàm tạo gradient
            const chart = context.chart
            const { ctx, chartArea } = chart
            if (!chartArea) return null
            // Tạo gradient từ trên xuống dưới
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
            gradient.addColorStop(0, color.replace(")", ", 0.2)").replace("rgb", "rgba"))
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
            return gradient
          },
          tension: 0.4, // Độ cong của đường
        },
      ],
    },
    options: {
      responsive: true, // Tự động co dãn
      maintainAspectRatio: false, // Cho phép tuỳ chỉnh chiều cao
      plugins: { legend: { display: false }, tooltip: { enabled: false } }, // Ẩn chú thích
      scales: { x: { display: false }, y: { display: false } }, // Ẩn trục
    },
  })
}

// Cập nhật Fear & Greed Gauge (doughnut chart)
function updateFngGauge(value) {
  const canvas = document.getElementById("fear-greed-gauge")
  if (!canvas) return
  const ctx = canvas.getContext("2d")
  // Hủy gauge cũ nếu tồn tại
  if (charts["fng"]) charts["fng"].destroy()

  // Chọn màu dựa trên giá trị
  let gaugeColor = "#f6851b" // Neutral (vàng)
  if (value < 25)
    gaugeColor = "#cf304a" // Extreme Fear (đỏ)
  else if (value > 75) gaugeColor = "#00c087" // Extreme Greed (xanh)

  // Tạo doughnut chart cho gauge
  charts["fng"] = new window.Chart(ctx, {
    type: "doughnut", // Loại biểu đồ: doughnut (bánh)
    data: {
      datasets: [
        {
          data: [value, 100 - value], // Tỉ lệ: value vs phần còn lại
          backgroundColor: [gaugeColor, "#2b3139"], // Màu tô
          borderWidth: 0, // Không vẽ đường viền
          circumference: 180, // 180 độ (nửa vòng tròn)
          rotation: 270, // Bắt đầu từ trên
          cutout: "85%", // Kích thước lỗ (85% -> chỉ còn viền ngoài)
          borderRadius: 10, // Góc bo tròn
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

// ==================== TABLE RENDERING ====================
// Hiển thị bảng tiền điện tử
function renderTable(coins) {
  const tbody = document.getElementById("crypto-body")
  const currentRowPrices = {}

  // Lặp qua từng coin
  coins.forEach((coin, index) => {
    currentRowPrices[coin.id] = coin.current_price
    // Kiểm tra hàng đã tồn tại
    let row = document.getElementById(`row-${coin.id}`)
    const isNewRow = !row

    if (isNewRow) {
      // Tạo hàng mới
      row = document.createElement("tr")
      row.id = `row-${coin.id}`
    }

    // Lấy thay đổi giá 24h và 7d
    const priceChange24h = coin.price_change_percentage_24h || 0
    const priceChange7d = coin.price_change_percentage_7d_in_currency || 0

    // Xác định hiệu ứng flash (giá tăng/giảm)
    let priceClass = ""
    if (!isNewRow && previousPrices[coin.id]) {
      if (coin.current_price > previousPrices[coin.id])
        priceClass = "flash-up" // Giá tăng
      else if (coin.current_price < previousPrices[coin.id]) priceClass = "flash-down" // Giá giảm
    }

    // Tạo HTML cho hàng
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
    // Thêm hàng mới vào bảng
    if (isNewRow) tbody.appendChild(row)
  })

  // Lưu giá hiện tại cho lần tải tiếp theo
  previousPrices = { ...currentRowPrices }
}

// ==================== UI UPDATES ====================
// Cập nhật giao diện xác thực
function updateAuthUI() {
  const userActions = document.getElementById("user-actions") // Nút Login/Signup
  const userProfile = document.getElementById("user-profile") // Thông tin người dùng
  const usernameDisplay = document.getElementById("username-display")

  if (auth.isLoggedIn) {
    // Nếu đã đăng nhập
    userActions.classList.add("hidden") // Ẩn nút Login/Signup
    userProfile.classList.remove("hidden") // Hiển thị thông tin người dùng
    usernameDisplay.textContent = auth.user
  } else {
    // Nếu chưa đăng nhập
    userActions.classList.remove("hidden")
    userProfile.classList.add("hidden")
  }
}

// Chuyển đổi giữa các view (trang)
function switchView(viewId) {
  const views = {
    crypto: document.getElementById("view-crypto"), // Trang Tiền điện tử
    exchanges: document.getElementById("view-exchanges"), // Trang Sàn giao dịch
    community: document.getElementById("view-community"), // Trang Cộng đồng
    portfolio: document.getElementById("view-portfolio"), // Trang Portfolio
    alerts: document.getElementById("view-alerts"), // Trang Alerts
  }

  // Ẩn tất cả views
  Object.keys(views).forEach((key) => {
    views[key].classList.add("hidden")
    const navItem = document.getElementById(`nav-${key}`)
    if (navItem) navItem.classList.remove("active")
  })

  // Hiển thị view được chọn
  views[viewId].classList.remove("hidden")
  const activeNav = document.getElementById(`nav-${viewId}`)
  if (activeNav) activeNav.classList.add("active")

  // Load dữ liệu riêng cho từng trang
  if (viewId === "community") setupCommunityListener()
  if (viewId === "exchanges") fetchExchanges()
}

// ==================== EXCHANGES FETCHING ====================
// Tải danh sách sàn giao dịch
async function fetchExchanges() {
  const body = document.getElementById("exchange-body")
  body.innerHTML = '<tr><td colspan="5" style="text-align:center">Loading exchanges...</td></tr>'
  try {
    // Fetch danh sách 15 sàn giao dịch hàng đầu
    const res = await fetch(`${API_URL}/exchanges?per_page=15`)
    const exchanges = await res.json()
    // Tạo HTML cho từng sàn
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

// ==================== COMMUNITY FEED RENDERING ====================
// Hiển thị feed bài viết community
function renderCommunityFeed(posts = []) {
  const feed = document.getElementById("community-feed")
  if (!feed) return

  // Tạo HTML cho từng bài viết
  feed.innerHTML = posts
    .map(
      (post) => `
        <div class="feed-post">
          <div class="post-header">
            <img src="https://avatar.vercel.sh/${post.username}" class="avatar">
            <div class="user-info">
              <strong>${post.username}</strong>
              <span>@${post.username} • ${new Date(post.createdAt.seconds * 1000).toLocaleTimeString()}</span>
            </div>
            <button class="signup-btn" style="margin-left: auto; padding: 4px 12px">Follow</button>
          </div>
          <div class="post-content">
            ${post.content}
          </div>
          <div class="post-actions">
            <span><i class="fa-regular fa-comment"></i> ${post.comments || 0}</span>
            <span><i class="fa-regular fa-heart"></i> ${post.likes || 0}</span>
            <span><i class="fa-solid fa-share-nodes"></i></span>
          </div>
        </div>
      `,
    )
    .join("")
}

// ==================== DOM CONTENT LOADED - EVENT LISTENERS ====================
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form-container")
  const signupForm = document.getElementById("signup-form-container")

  // Xử lý sự kiện mở modal Login
  document.getElementById("open-login").onclick = () => {
    modal.classList.remove("hidden")
    loginForm.classList.remove("hidden")
    signupForm.classList.add("hidden")
  }

  // Xử lý sự kiện mở modal Signup
  document.getElementById("open-signup").onclick = () => {
    modal.classList.remove("hidden")
    signupForm.classList.remove("hidden")
    loginForm.classList.add("hidden")
  }

  // Xử lý sự kiện đóng modal
  document.getElementById("close-modal").onclick = () => modal.classList.add("hidden")

  // Xử lý sự kiện chuyển từ Login sang Signup
  document.getElementById("switch-to-signup").onclick = () => {
    loginForm.classList.add("hidden")
    signupForm.classList.remove("hidden")
  }

  // Xử lý sự kiện chuyển từ Signup sang Login
  document.getElementById("switch-to-login").onclick = () => {
    signupForm.classList.add("hidden")
    loginForm.classList.remove("hidden")
  }

  // Xử lý submit form Login
  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault() // Ngăn chặn reload trang
    const email = document.getElementById("login-email").value
    const pass = document.getElementById("login-password").value
    await auth.login(email, pass)
  }

  // Xử lý submit form Signup
  document.getElementById("signup-form").onsubmit = async (e) => {
    e.preventDefault()
    const name = document.getElementById("signup-name").value
    const email = document.getElementById("signup-email").value
    const pass = document.getElementById("signup-password").value
    await auth.signup(email, pass, name)
  }

  // Xử lý sự kiện Logout
  document.getElementById("logout-btn").onclick = () => auth.logout()

  // Xử lý thêm item portfolio
  document.getElementById("add-portfolio-btn").onclick = async () => {
    const coinName = document.getElementById("portfolio-coin-name").value.trim()
    const quantity = document.getElementById("portfolio-quantity").value
    if (!coinName || !quantity) {
      alert("Vui lòng điền đầy đủ thông tin")
      return
    }
    await addPortfolioItem(coinName, quantity)
    document.getElementById("portfolio-coin-name").value = ""
    document.getElementById("portfolio-quantity").value = ""
  }

  // Xử lý thêm alert
  document.getElementById("add-alert-btn").onclick = async () => {
    const coin = document.getElementById("alert-coin").value.trim()
    const price = document.getElementById("alert-price").value
    const type = document.getElementById("alert-type").value
    if (!coin || !price) {
      alert("Vui lòng điền đầy đủ thông tin")
      return
    }
    await addAlert(coin, price, type)
    document.getElementById("alert-coin").value = ""
    document.getElementById("alert-price").value = ""
  }

  // Xử lý đăng bài community
  document.getElementById("post-community-btn").onclick = async () => {
    const textarea = document.getElementById("community-textarea")
    if (!textarea.value.trim()) {
      alert("Vui lòng nhập nội dung")
      return
    }
    await postCommunityMessage(textarea.value.trim(), selectedSentiment)
    textarea.value = ""
  }

  // Xử lý chọn cảm xúc (Bullish/Bearish)
  document.querySelectorAll(".sentiment-btns button").forEach((btn) => {
    btn.onclick = (e) => {
      // Bỏ active từ tất cả nút
      document.querySelectorAll(".sentiment-btns button").forEach((b) => b.classList.remove("active"))
      // Thêm active vào nút được click
      e.target.closest("button").classList.add("active")
      // Cập nhật sentiment được chọn
      selectedSentiment = e.target.closest("button").dataset.sentiment
    }
  })

  // ==================== NAVIGATION ====================
  // Xử lý click các nút navigation
  document.getElementById("nav-crypto").onclick = () => switchView("crypto")
  document.getElementById("nav-exchanges").onclick = () => switchView("exchanges")
  document.getElementById("nav-community").onclick = () => switchView("community")
  document.getElementById("nav-portfolio").onclick = () => switchView("portfolio")
  document.getElementById("nav-alerts").onclick = () => switchView("alerts")

  // Xử lý tabs trong trang tiền điện tử
  document.querySelectorAll("#crypto-tabs .tab-btn").forEach((btn) => {
    btn.onclick = () => {
      // Bỏ active từ tất cả tabs
      document.querySelectorAll("#crypto-tabs .tab-btn").forEach((b) => b.classList.remove("active"))
      // Thêm active vào tab được click
      btn.classList.add("active")
      // Tải lại dữ liệu
      fetchCryptoData()
    }
  })

  // ==================== SEARCH FUNCTIONALITY ====================
  const searchInput = document.querySelector(".search-bar input")
  searchInput.oninput = (e) => {
    const term = e.target.value.toLowerCase() // Lấy từ tìm kiếm (lowercase)
    // Lặp qua từng hàng trong bảng
    document.querySelectorAll("#crypto-body tr").forEach((row) => {
      // Lấy tên coin từ hàng
      const name = row.querySelector(".name-container strong")?.innerText.toLowerCase() || ""
      // Ẩn hoặc hiển thị hàng dựa trên tìm kiếm
      row.style.display = name.includes(term) ? "" : "none"
    })
  }

  // ==================== INITIAL DATA LOADING ====================
  fetchCryptoData() // Tải dữ liệu lần đầu
  setInterval(fetchCryptoData, 5000) // Tải dữ liệu mỗi 5 giây (realtime)
})

// ==================== GLOBAL FUNCTIONS ====================
// Xuất hàm xóa portfolio để có thể gọi từ onclick trong HTML
window.deletePortfolioItem = deletePortfolioItem
// Xuất hàm xóa alert để có thể gọi từ onclick trong HTML
window.deleteAlert = deleteAlert
