// Shared sidebar and topbar injection
function renderLayout(activePage, pageTitle) {
  const nav = [
    { id: 'dashboard',   label: 'Dashboard',        icon: '📊', file: 'dashboard.html' },
    { id: 'stock',       label: 'Stock Management',  icon: '📦', file: 'stock.html' },
    { id: 'record-sale', label: 'Record Sale',        icon: '🛒', file: 'record-sale.html' },
    { id: 'history',     label: 'Sales History',      icon: '🗂️', file: 'history.html' },
    { id: 'expenses',    label: 'Expenses',            icon: '💸', file: 'expenses.html' },
    { id: 'reports',     label: 'Reports',             icon: '📄', file: 'reports.html' },
    { id: 'insights',    label: 'Business Insights',  icon: '🔍', file: 'insights.html' },
  ];

  const navHTML = nav.map(n => `
    <a href="${n.file}" class="nav-item ${activePage === n.id ? 'active' : ''}">
      <span>${n.icon}</span> ${n.label}
    </a>
  `).join('');

  document.body.insertAdjacentHTML('afterbegin', `
    <div class="sidebar">
      <div class="sidebar-brand">
        <div class="app-name">BIASHARA APP</div>
        <div class="app-sub">Sales Analysis System</div>
      </div>
      <nav>${navHTML}</nav>
      <div class="sidebar-footer">
        <div class="sf-label">Logged in as</div>
        <div class="sf-name">Amina Juma</div>
        <div class="sf-role">Admin</div>
        <a href="login.html" style="font-size:11px; color:#EF4444; text-decoration:none; display:block; margin-top:8px;">🚪 Logout</a>
      </div>
    </div>
    <div class="main-content">
      <div class="topbar">
        <div>
          <div class="topbar-title">${pageTitle}</div>
          <div class="topbar-date">19 February 2026</div>
        </div>
        <div class="avatar">AJ</div>
      </div>
      <div class="page-body" id="page-body">
  `);

  document.body.insertAdjacentHTML('beforeend', `</div></div>`);
}
