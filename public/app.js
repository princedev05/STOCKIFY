const API_URL = "http://localhost:4000";

// Store auth token when user logs in
let authToken = localStorage.getItem("authToken") || null;

function showTab(tabName) {
  // Hide all tabs
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => tab.classList.remove("active"));

  // Remove active class from all nav buttons
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => btn.classList.remove("active"));

  // Show selected tab and mark button as active
  document.getElementById(tabName).classList.add("active");
  event.target.classList.add("active");
}

function showAlert(elementId, message, type = "success") {
  const alertDiv = document.getElementById(elementId);
  alertDiv.innerHTML = `<div class="alert ${type}">${message}</div>`;
  setTimeout(() => {
    alertDiv.innerHTML = "";
  }, 5000);
}

// REGISTER
async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById("reg-username").value;
  const email = document.getElementById("reg-email").value;
  const name = document.getElementById("reg-name").value;
  const password = document.getElementById("reg-password").value;
  const role = document.getElementById("reg-role").value;

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, name, password, role }),
    });
    const data = await response.json();
    if (response.ok) {
        showAlert("register-alert", `✅ Registration successful! Logging in...`, "success");
        // Auto-login after successful registration so company users go to company dashboard
        try {
          const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const loginData = await loginRes.json();
          if (loginRes.ok) {
            authToken = loginData.token;
            localStorage.setItem("authToken", authToken);
            if (loginData.user_id) localStorage.setItem("userId", String(loginData.user_id));
            if (loginData.name) localStorage.setItem("userName", loginData.name);
            if (loginData.role) localStorage.setItem("role", loginData.role);
            if (loginData.company_id) localStorage.setItem("companyId", String(loginData.company_id));
            // redirect based on company association or role
            if (loginData.company_id || loginData.role === "company" || role === "company") {
              window.location.href = "company-dashboard.html";
            } else {
              window.location.href = "dashboard.html";
            }
            return;
          } else {
            showAlert("register-alert", `✅ Registration succeeded but auto-login failed: ${loginData.message || ''}`,
              "error");
            event.target.reset();
          }
        } catch (err) {
          showAlert("register-alert", `✅ Registered but login failed: ${err.message}", "error");
          event.target.reset();
        }
    } else {
      showAlert(
        "register-alert",
        `❌ ${data.message || "Registration failed"}`,
        "error"
      );
    }
  } catch (err) {
    showAlert("register-alert", `❌ Error: ${err.message}`, "error");
  }
}

// LOGIN
async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (response.ok) {
      authToken = data.token;
      // store token and user id/name/role returned by the API
      localStorage.setItem("authToken", authToken);
      if (data.user_id) localStorage.setItem("userId", String(data.user_id));
      if (data.name) localStorage.setItem("userName", data.name);
      if (data.role) localStorage.setItem("role", data.role);
      showAlert("login-alert", `✅ Login successful!`, "success");
      event.target.reset();
      // redirect based on role
      // If DB assigned company_id, prefer that redirect (company users)
      if (data.company_id) {
        localStorage.setItem('companyId', String(data.company_id));
        window.location.href = "company-dashboard.html";
      } else if (data.role === 'company') {
        // role fallback
        window.location.href = "company-dashboard.html";
      } else {
        window.location.href = "dashboard.html";
      }
    } else {
      showAlert("login-alert", `❌ ${data.message || "Login failed"}`, "error");
    }
  } catch (err) {
    showAlert("login-alert", `❌ Error: ${err.message}`, "error");
  }
}

// LIST STOCK
async function handleListStock(event) {
  event.preventDefault();
  const company_name = document.getElementById("list-company-name").value;
  const quantity = parseInt(document.getElementById("list-quantity").value);
  const price_per_share = parseFloat(
    document.getElementById("list-price").value
  );
  const sector = document.getElementById("list-sector").value || "General";

  try {
    const response = await fetch(`${API_URL}/company/listStock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: JSON.stringify({ company_name, quantity, price_per_share, sector }),
    });
    const data = await response.json();
    if (response.ok) {
      showAlert(
        "liststock-alert",
        `✅ Stock listed successfully! Stock ID: ${data.stockId}`,
        "success"
      );
      event.target.reset();
    } else {
      showAlert(
        "liststock-alert",
        `❌ ${data.message || "Failed to list stock"}`,
        "error"
      );
    }
  } catch (err) {
    showAlert("liststock-alert", `❌ Error: ${err.message}`, "error");
  }
}

// Show/hide limit price field for buy order
document.addEventListener("DOMContentLoaded", () => {
  const buyOrderType = document.getElementById("buy-order-type");
  const buyLimitPriceGroup = document.getElementById("buy-limit-price-group");
  if (buyOrderType) {
    buyOrderType.addEventListener("change", (e) => {
      buyLimitPriceGroup.style.display =
        e.target.value === "LIMIT" ? "block" : "none";
    });
  }

  const sellOrderType = document.getElementById("sell-order-type");
  const sellLimitPriceGroup = document.getElementById("sell-limit-price-group");
  if (sellOrderType) {
    sellOrderType.addEventListener("change", (e) => {
      sellLimitPriceGroup.style.display =
        e.target.value === "LIMIT" ? "block" : "none";
    });
  }
});

// BUY STOCK
async function handleBuyStock(event) {
  event.preventDefault();
  const user_id = parseInt(document.getElementById("buy-user-id").value);
  const stock_id = parseInt(document.getElementById("buy-stock-id").value);
  const quantity = parseInt(document.getElementById("buy-quantity").value);
  const order_type = document.getElementById("buy-order-type").value;
  const limit_price =
    order_type === "LIMIT"
      ? parseFloat(document.getElementById("buy-limit-price").value)
      : null;

  try {
    const body = { user_id, stock_id, quantity, order_type };
    if (limit_price) body.limit_price = limit_price;

    const response = await fetch(`${API_URL}/user/buyStock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok) {
      showAlert(
        "buy-alert",
        `✅ Buy order placed! Order ID: ${data.orderId}`,
        "success"
      );
      event.target.reset();
      // auto-refresh portfolio and history for this user
      try {
        await fetchPortfolioData(user_id);
        await fetchHistoryData(user_id);
      } catch (err) {
        // ignore frontend refresh errors
      }
    } else {
      showAlert(
        "buy-alert",
        `❌ ${data.message || "Failed to place buy order"}`,
        "error"
      );
    }
  } catch (err) {
    showAlert("buy-alert", `❌ Error: ${err.message}`, "error");
  }
}

// SELL STOCK
async function handleSellStock(event) {
  event.preventDefault();
  const user_id = parseInt(document.getElementById("sell-user-id").value);
  const stock_id = parseInt(document.getElementById("sell-stock-id").value);
  const quantity = parseInt(document.getElementById("sell-quantity").value);
  const order_type = document.getElementById("sell-order-type").value;
  const limit_price =
    order_type === "LIMIT"
      ? parseFloat(document.getElementById("sell-limit-price").value)
      : null;

  try {
    const body = { user_id, stock_id, quantity, order_type };
    if (limit_price) body.limit_price = limit_price;

    const response = await fetch(`${API_URL}/user/sellStock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok) {
      showAlert(
        "sell-alert",
        `✅ Sell order placed! Order ID: ${data.orderId}`,
        "success"
      );
      event.target.reset();
      // auto-refresh portfolio and history for this user
      try {
        await fetchPortfolioData(user_id);
        await fetchHistoryData(user_id);
      } catch (err) {
        // ignore frontend refresh errors
      }
    } else {
      showAlert(
        "sell-alert",
        `❌ ${data.message || "Failed to place sell order"}`,
        "error"
      );
    }
  } catch (err) {
    showAlert("sell-alert", `❌ Error: ${err.message}`, "error");
  }
}

// VIEW PORTFOLIO
async function handleViewPortfolio(event) {
  event.preventDefault();
  const user_id = document.getElementById("portfolio-user-id").value;
  await fetchPortfolioData(user_id);
}

// Fetch portfolio data and render (callable programmatically)
async function fetchPortfolioData(user_id) {
  try {
    const response = await fetch(`${API_URL}/user/portfolio/${user_id}`, {
      headers: { Authorization: authToken ? `Bearer ${authToken}` : "" },
    });
    const data = await response.json();
    if (response.ok) {
      let html = "<h3>Holdings</h3>";
      if (data.holdings && data.holdings.length > 0) {
        html +=
          "<table><tr><th>Stock ID</th><th>Company</th><th>Quantity</th><th>Avg Price</th><th>Value</th></tr>";
        data.holdings.forEach((h) => {
          const value = (h.quantity * h.average_price).toFixed(2);
          html += `<tr><td>${h.stock_id}</td><td>${h.company_name}</td><td>${h.quantity}</td><td>₹${h.average_price.toFixed(2)}</td><td>₹${value}</td></tr>`;
        });
        html += "</table>";
      } else {
        html += "<p>No holdings yet</p>";
      }

      html += "<h3>Wallet</h3>";
      if (data.wallet) {
        html += `<p><strong>Balance:</strong> ₹${data.wallet.balance.toFixed(2)}</p>`;
        html += `<p><strong>Reserved:</strong> ₹${data.wallet.reserved_amount.toFixed(2)}</p>`;
      }

      document.getElementById("portfolio-data").innerHTML = html;
    } else {
      showAlert("portfolio-alert", `❌ ${data.message || "Failed to fetch portfolio"}`, "error");
    }
  } catch (err) {
    showAlert("portfolio-alert", `❌ Error: ${err.message}`, "error");
  }
}

// VIEW HISTORY
async function handleViewHistory(event) {
  event.preventDefault();
  const user_id = document.getElementById("history-user-id").value;
  await fetchHistoryData(user_id);
}

// Fetch history data and render (callable programmatically)
async function fetchHistoryData(user_id) {
  try {
    const response = await fetch(`${API_URL}/user/history/${user_id}`, {
      headers: { Authorization: authToken ? `Bearer ${authToken}` : "" },
    });
    const data = await response.json();
    if (response.ok) {
      let html = "<h3>Transaction History</h3>";
      if (data.transactions && data.transactions.length > 0) {
        html +=
          "<table><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Action</th></tr>";
        data.transactions.forEach((t) => {
          const date = new Date(t.transaction_date).toLocaleString();
          html += `<tr><td>${date}</td><td>${t.transaction_type}</td><td>₹${t.amount.toFixed(2)}</td><td>${t.status}</td><td><button class=\"btn btn-secondary\" onclick=\"deleteTransaction(${t.txn_id})\">Delete</button></td></tr>`;
        });
        html += "</table>";
      } else {
        html += "<p>No transactions yet</p>";
      }
      document.getElementById("history-data").innerHTML = html;
    } else {
      showAlert("history-alert", `❌ ${data.message || "Failed to fetch history"}`, "error");
    }
  } catch (err) {
    showAlert("history-alert", `❌ Error: ${err.message}`, "error");
  }
}

// Delete a transaction via API and refresh the history view
async function deleteTransaction(txnId) {
  if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) return;
  try {
    const token = authToken || localStorage.getItem('authToken');
    const resp = await fetch(`${API_URL}/user/transactions/${txnId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }
    });
    const data = await resp.json();
    if (resp.ok) {
      showAlert('history-alert', '✅ Transaction deleted', 'success');
      // refresh using stored userId (if available) or prompt field
      const uid = localStorage.getItem('userId') || document.getElementById('history-user-id').value;
      if (uid) await fetchHistoryData(uid);
    } else {
      showAlert('history-alert', `❌ ${data.error || data.message || 'Failed to delete transaction'}`, 'error');
    }
  } catch (err) {
    showAlert('history-alert', `❌ Error: ${err.message}`, 'error');
  }
}
