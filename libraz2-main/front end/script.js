(
  function () {
  const API_BASE =
    window.API_BASE ||
    (window.location.port === "5500" ? "http://localhost:3000" : window.location.origin);
  const allowedStatuses = ["Pending", "Confirmed", "Completed", "Cancelled"];
  const priceCatalog = Array.isArray(window.PRICE_CATALOG) ? window.PRICE_CATALOG : [];
  const BOOKING_DRAFT_KEY = "bookingDraft";

  let toastTimer = null;

  function showToast(message, type) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 2800);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function phoneIsValid(phone) {
    return /^\d{3}-\d{7}$/.test(phone || "");
  }

  function buildPhoneValue(countryCode, localPhone) {
    return `${String(countryCode || "").trim()} ${String(localPhone || "").trim()}`.trim();
  }

  function splitPhoneValue(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\+\d+)\s*(.*)$/);
    if (!match) return { countryCode: "+92", phone: raw };
    return {
      countryCode: match[1] || "+92",
      phone: (match[2] || "").trim(),
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }
    return data;
  }

  function triggerShake(el) {
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }

  function formatPkr(amount) {
    return `PKR ${Number(amount || 0).toLocaleString()}`;
  }

  function findCategory(name) {
    return priceCatalog.find((category) => category.category === name) || null;
  }

  function findService(categoryName, serviceName) {
    const category = findCategory(categoryName);
    if (!category) return null;
    return category.services.find((service) => service.name === serviceName) || null;
  }

  function initBookingPage() {
    const form = document.getElementById("bookingForm");
    if (!form) return;

    const card = document.getElementById("bookingCard");
    const btn = document.getElementById("bookNowBtn");
    const spinner = btn.querySelector(".spinner");
    const btnText = btn.querySelector(".btn-text");
    const serviceRowsEl = document.getElementById("serviceRows");
    const addServiceBtn = document.getElementById("addServiceBtn");
    const countryCodeSelect = form.countryCode;
    const totalBillValue = document.getElementById("totalBillValue");

    // Add input formatting
    form.name.addEventListener('input', function() {
      this.value = this.value.replace(/\b\w/g, l => l.toUpperCase());
    });
    form.promoCode.addEventListener('input', function() {
      this.value = this.value.toUpperCase();
    });
    form.phone.addEventListener('input', function() {
      let value = this.value.replace(/\D/g, '');
      if (value.length > 3) {
        value = value.slice(0, 3) + '-' + value.slice(3, 10);
      }
      this.value = value;
    });

    // Hide service chip rows when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.service-row') && !e.target.closest('#addServiceBtn')) {
        document.querySelectorAll('.service-chip-row').forEach(row => row.classList.add('hidden'));
        document.querySelectorAll('.service-dropdown-toggle').forEach(btn => btn.classList.remove('open'));
      }
    });

    function categoryOptionsHtml() {
      const options = ['<option value="">Select category</option>'];
      priceCatalog.forEach((entry) => {
        options.push(`<option value="${escapeHtml(entry.category)}">${escapeHtml(entry.category)}</option>`);
      });
      return options.join("");
    }

    function serviceOptionsHtml(categoryName, currentSelection = []) {
      const category = findCategory(categoryName);
      const services = category ? category.services : [];
      if (!services.length) {
        return '<div class="service-chip-placeholder">Choose a category to show services</div>';
      }
      const selectedSet = new Set(currentSelection);
      return services
        .map((service) => {
          const checked = selectedSet.has(service.name) ? " checked" : "";
          const selectedClass = selectedSet.has(service.name) ? " selected" : "";
          return `
            <div class="service-chip${selectedClass}">
              <input type="checkbox" class="service-chip-checkbox" data-service-name="${escapeHtml(service.name)}"${checked} />
              <span class="service-chip-name">${escapeHtml(service.name)}</span>
              <span class="service-chip-rate">${escapeHtml(service.rate)}</span>
            </div>
          `;
        })
        .join("");
    }

    function updateServiceDisplay(row, categoryName) {
      const toggleBtn = row.querySelector(".service-dropdown-toggle");
      const serviceChipRow = row.querySelector(".service-chip-row");
      if (!toggleBtn || !serviceChipRow) return;
      if (!categoryName) {
        toggleBtn.textContent = "Select service";
        serviceChipRow.classList.add("hidden");
        toggleBtn.classList.remove("open");
        return;
      }
      const selectedCount = serviceChipRow.querySelectorAll(".service-chip-checkbox:checked").length;
      toggleBtn.textContent = selectedCount > 0 ? `${selectedCount} service(s) selected` : "Select service";
    }

    function attachServiceChipHandlers(chipRow) {
      chipRow.querySelectorAll(".service-chip-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const chip = checkbox.closest(".service-chip");
          if (chip) chip.classList.toggle("selected", checkbox.checked);
          const row = chipRow.closest(".service-row");
          const category = row?.querySelector(".service-category")?.value || "";
          updateServiceDisplay(row, category);
          recalcTotalAndRateLabels();
        });
      });
    }

    function recalcTotalAndRateLabels() {
      let total = 0;
      serviceRowsEl.querySelectorAll(".service-row").forEach((row) => {
        const category = row.querySelector(".service-category")?.value || "";
        const serviceRow = row.querySelector(".service-chip-row");
        const selectedNames = Array.from(serviceRow?.querySelectorAll(".service-chip-checkbox:checked") || []).map((checkbox) => checkbox.dataset.serviceName);
        const rateTextEl = row.querySelector(".service-rate");
        if (!category || selectedNames.length === 0) {
          rateTextEl.textContent = "-";
          return;
        }
        let rowTotal = 0;
        selectedNames.forEach((serviceName) => {
          const matched = findService(category, serviceName);
          if (matched) {
            if (typeof matched.amount === "number") {
              rowTotal += matched.amount;
              total += matched.amount;
            }
          }
        });
        rateTextEl.textContent = rowTotal ? formatPkr(rowTotal) : "-";
      });
      totalBillValue.textContent = formatPkr(total);
      return total;
    }

    function addServiceRow(prefill = {}) {
      const row = document.createElement("div");
      row.className = "service-row";
      row.innerHTML = `
        <div class="service-row-left">
          <select class="service-category" aria-label="Service category">
            ${categoryOptionsHtml()}
          </select>
          <button type="button" class="remove-service-btn">Remove</button>
        </div>
        <div class="service-row-right">
          <button type="button" class="service-dropdown-toggle">Select service</button>
          <div class="service-rate-box">Rate(s): <span class="service-rate">-</span></div>
        </div>
        <div class="service-chip-row" role="group" aria-label="Service options">
          ${serviceOptionsHtml(prefill.category || "", prefill.services || [])}
        </div>
      `;

      const categorySelect = row.querySelector(".service-category");
      const serviceToggle = row.querySelector(".service-dropdown-toggle");
      const serviceChipRow = row.querySelector(".service-chip-row");
      const removeBtn = row.querySelector(".remove-service-btn");

      categorySelect.value = prefill.category || "";
      serviceChipRow.innerHTML = serviceOptionsHtml(categorySelect.value, prefill.services || []);
      attachServiceChipHandlers(serviceChipRow);
      serviceChipRow.classList.add("hidden");
      serviceToggle.classList.remove("open");
      updateServiceDisplay(row, categorySelect.value);

      categorySelect.addEventListener("change", () => {
        serviceChipRow.innerHTML = serviceOptionsHtml(categorySelect.value, []);
        attachServiceChipHandlers(serviceChipRow);
        if (categorySelect.value) {
          serviceChipRow.classList.add("hidden");
          serviceToggle.classList.remove("open");
        } else {
          serviceChipRow.classList.add("hidden");
          serviceToggle.classList.remove("open");
        }
        updateServiceDisplay(row, categorySelect.value);
        recalcTotalAndRateLabels();
      });
      serviceToggle.addEventListener("click", () => {
        if (!categorySelect.value) {
          showToast("Please select a category first.", "error");
          return;
        }
        const isHidden = serviceChipRow.classList.toggle("hidden");
        serviceToggle.classList.toggle("open", !isHidden);
      });
      removeBtn.addEventListener("click", () => {
        row.remove();
        if (serviceRowsEl.querySelectorAll(".service-row").length === 0) addServiceRow();
        recalcTotalAndRateLabels();
      });

      serviceRowsEl.appendChild(row);
      recalcTotalAndRateLabels();
    }

    function collectSelectedServices() {
      const selected = [];
      serviceRowsEl.querySelectorAll(".service-row").forEach((row) => {
        const category = row.querySelector(".service-category")?.value || "";
        const checkedBoxes = row.querySelectorAll(".service-chip-checkbox:checked");
        checkedBoxes.forEach((checkbox) => {
          const serviceName = checkbox.dataset.serviceName;
          if (!category || !serviceName) return;
          const matched = findService(category, serviceName);
          selected.push({
            category,
            service: serviceName,
            rateLabel: matched?.rate || "-",
            amount: typeof matched?.amount === "number" ? matched.amount : null,
          });
        });
      });
      return selected;
    }

    function hydrateDraftIfAny() {
      const draftRaw = sessionStorage.getItem(BOOKING_DRAFT_KEY);
      if (!draftRaw) return;
      try {
        const draft = JSON.parse(draftRaw);
        form.name.value = draft.name || "";
        const parsedPhone = splitPhoneValue(draft.phone);
        if (countryCodeSelect) {
          const hasOption = Array.from(countryCodeSelect.options).some((option) => option.value === parsedPhone.countryCode);
          countryCodeSelect.value = hasOption ? parsedPhone.countryCode : "+92";
        }
        form.phone.value = parsedPhone.phone || "";
        form.email.value = draft.email || "";
        form.promoCode.value = draft.promoCode || "";
        serviceRowsEl.innerHTML = "";
        const grouped = {};
        (draft.selectedServices || []).forEach((item) => {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item.service);
        });
        const categories = Object.keys(grouped);
        if (categories.length === 0) {
          addServiceRow();
        } else {
          categories.forEach((cat) => addServiceRow({ category: cat, services: grouped[cat] }));
        }
        recalcTotalAndRateLabels();
      } catch {
        sessionStorage.removeItem(BOOKING_DRAFT_KEY);
      }
    }

    if (priceCatalog.length > 0) addServiceRow();
    hydrateDraftIfAny();
    btn.disabled = false;
    spinner.classList.add("hidden");
    btnText.textContent = "Book Now";
    window.addEventListener("pageshow", () => {
      btn.disabled = false;
      spinner.classList.add("hidden");
      btnText.textContent = "Book Now";
    });
    addServiceBtn?.addEventListener("click", () => addServiceRow());

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = form.name.value.trim();
      const phone = form.phone.value.trim();
      const countryCode = (countryCodeSelect?.value || "+92").trim();
      const email = form.email.value.trim();
      const promoCode = form.promoCode.value.trim();
      const selectedServices = collectSelectedServices();
      const totalBill = recalcTotalAndRateLabels();

      if (!name) {
        showToast("Name is required.", "error");
        triggerShake(card);
        return;
      }
      if (!phoneIsValid(phone)) {
        showToast("Enter a valid phone number.", "error");
        triggerShake(card);
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast("Invalid email format.", "error");
        triggerShake(card);
        return;
      }
      if (selectedServices.length === 0) {
        showToast("Please select at least one service.", "error");
        triggerShake(card);
        return;
      }

      btn.disabled = true;
      spinner.classList.remove("hidden");
      btnText.textContent = "Preparing invoice...";
      const draft = {
        name,
        phone: buildPhoneValue(countryCode, phone),
        email,
        promoCode,
        selectedServices,
        totalBill,
      };
      sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
      window.location.href = "success.html";
    });
  }

  function initSuccessPage() {
    const nameNode = document.getElementById("successName");
    if (!nameNode) return;
    const invoiceView = document.getElementById("invoiceView");
    const successView = document.getElementById("successView");
    const invoiceSummary = document.getElementById("invoiceSummary");
    const confirmBtn = document.getElementById("confirmInvoiceBtn");
    const editBtn = document.getElementById("editInvoiceBtn");
    const draftRaw = sessionStorage.getItem(BOOKING_DRAFT_KEY);
    if (!draftRaw) {
      invoiceView?.classList.add("hidden");
      successView?.classList.remove("hidden");
      nameNode.textContent = "";
      return;
    }
    let draft;
    try {
      draft = JSON.parse(draftRaw);
    } catch {
      sessionStorage.removeItem(BOOKING_DRAFT_KEY);
      window.location.href = "index.html";
      return;
    }
    const serviceLines = (draft.selectedServices || [])
      .map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.service)}</td><td>${escapeHtml(item.rateLabel || "-")}</td></tr>`)
      .join("");
    invoiceSummary.innerHTML = `
      <p><strong>Name:</strong> ${escapeHtml(draft.name || "")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(draft.phone || "")}</p>
      <p><strong>Email:</strong> ${escapeHtml(draft.email || "-")}</p>
      <p><strong>Promo Code:</strong> ${escapeHtml(draft.promoCode || "-")}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Category</th><th>Service</th><th>Rate</th></tr></thead>
          <tbody>${serviceLines || '<tr><td colspan="4">No services selected.</td></tr>'}</tbody>
        </table>
      </div>
      <p class="invoice-total"><strong>Total Bill:</strong> ${formatPkr(draft.totalBill || 0)}</p>
    `;

    editBtn?.addEventListener("click", () => {
      window.location.href = "index.html?edit=1";
    });
    confirmBtn?.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Confirming...";
      try {
        const data = await api("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        sessionStorage.removeItem(BOOKING_DRAFT_KEY);
        invoiceView?.classList.add("hidden");
        successView?.classList.remove("hidden");
        nameNode.textContent = `${data.booking?.name || draft.name}, we look forward to seeing you soon.`;
        nameNode.classList.remove("hidden");
        confirmBtn.textContent = "Confirm Booking";
      } catch (error) {
        showToast(error.message || "Failed to confirm booking.", "error");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Confirm Booking";
      }
    });
  }

  function getBadgeClass(status) {
    return `badge badge-${String(status).toLowerCase()}`;
  }

  function statusOptionsHtml(current) {
    return allowedStatuses
      .map(
        (status) =>
          `<option value="${status}" ${current === status ? "selected" : ""}>${status}</option>`
      )
      .join("");
  }

  function normalizePhone(phone) {
    const raw = String(phone || "");
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) return "tel:+92";
    if (digits.startsWith("92")) return `tel:+${digits}`;
    if (digits.startsWith("0")) return `tel:+92${digits.slice(1)}`;
    return `tel:+92${digits}`;
  }

  function bookingRowTemplate(booking) {
    const name = escapeHtml(booking.name || "-");
    const phone = escapeHtml(booking.phone || "-");
    const email = escapeHtml(booking.email || "-");
    const promo = escapeHtml(booking.promoCode || "-");
    const services = Array.isArray(booking.selectedServices) && booking.selectedServices.length
      ? booking.selectedServices.map((item) => `${item.category}: ${item.service}`).join(" | ")
      : "-";
    const total = Number.isFinite(Number(booking.totalBill)) ? formatPkr(Number(booking.totalBill)) : "PKR 0";
    const created = escapeHtml(new Date(booking.createdAt).toLocaleString());
    const status = escapeHtml(booking.status || "Pending");
    const id = escapeHtml(booking.id);

    return `
      <tr data-id="${id}">
        <td>${name}</td>
        <td>${phone}</td>
        <td>${email}</td>
        <td>${promo}</td>
        <td>${escapeHtml(services)}</td>
        <td>${escapeHtml(total)}</td>
        <td><span class="status-badge ${getBadgeClass(booking.status)}">${status}</span></td>
        <td>${created}</td>
        <td>
          <div class="action-row">
            <select class="status-select" aria-label="Change status for ${name}">${statusOptionsHtml(booking.status)}</select>
            <a class="call-link" href="${normalizePhone(booking.phone)}">Call</a>
            <button class="delete-btn" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  function bookingCardTemplate(booking) {
    const name = escapeHtml(booking.name || "-");
    const phone = escapeHtml(booking.phone || "-");
    const email = escapeHtml(booking.email || "-");
    const promo = escapeHtml(booking.promoCode || "-");
    const services = Array.isArray(booking.selectedServices) && booking.selectedServices.length
      ? booking.selectedServices.map((item) => `${item.category}: ${item.service}`).join(" | ")
      : "-";
    const total = Number.isFinite(Number(booking.totalBill)) ? formatPkr(Number(booking.totalBill)) : "PKR 0";
    const created = escapeHtml(new Date(booking.createdAt).toLocaleString());
    const status = escapeHtml(booking.status || "Pending");
    const id = escapeHtml(booking.id);

    return `
      <article class="booking-card-mobile" data-id="${id}">
        <div class="booking-card-mobile__header">
          <strong>${name}</strong>
          <span class="status-badge ${getBadgeClass(booking.status)}">${status}</span>
        </div>
        <dl class="booking-card-mobile__dl">
          <div><dt>Phone</dt><dd>${phone}</dd></div>
          <div><dt>Email</dt><dd>${email}</dd></div>
          <div><dt>Promo</dt><dd>${promo}</dd></div>
          <div><dt>Services</dt><dd>${escapeHtml(services)}</dd></div>
          <div><dt>Total</dt><dd>${escapeHtml(total)}</dd></div>
          <div><dt>Created</dt><dd>${created}</dd></div>
        </dl>
        <div class="action-row booking-card-mobile__actions">
          <select class="status-select" aria-label="Change status for ${name}">${statusOptionsHtml(booking.status)}</select>
          <a class="call-link" href="${normalizePhone(booking.phone)}">Call</a>
          <button class="delete-btn" type="button">Delete</button>
        </div>
      </article>
    `;
  }

  function renderBookings(bookings, tbody, cardsEl) {
    if (!bookings.length) {
      tbody.innerHTML = `<tr><td colspan="9">No bookings yet.</td></tr>`;
      cardsEl.innerHTML = `<p class="empty-bookings">No bookings yet.</p>`;
      return;
    }
    tbody.innerHTML = bookings.map(bookingRowTemplate).join("");
    cardsEl.innerHTML = bookings.map(bookingCardTemplate).join("");
  }

  function toTsvCell(value) {
    return String(value ?? "").replace(/\r?\n/g, " ").replace(/\t/g, " ");
  }

  function downloadExcelLikeFile(fileName, headers, rows) {
    const tsvContent = [headers.join("\t"), ...rows.map((row) => row.map(toTsvCell).join("\t"))].join("\n");
    const contentWithBom = `\uFEFF${tsvContent}`;
    const blob = new Blob([contentWithBom], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function initAdminPage() {
    const unlockBtn = document.getElementById("unlockAdminBtn");
    if (!unlockBtn) return;

    const gate = document.getElementById("adminGate");
    const dashboard = document.getElementById("dashboardSection");
    const passwordInput = document.getElementById("adminPassword");
    const tbody = document.getElementById("bookingsTbody");
    const cardsEl = document.getElementById("bookingsCards");
    const refreshBtn = document.getElementById("refreshBtn");
    const lockDashboardBtn = document.getElementById("lockDashboardBtn");
    const downloadAllBtn = document.getElementById("downloadAllBtn");
    const downloadContactsBtn = document.getElementById("downloadContactsBtn");
    const deleteModal = document.getElementById("deleteModal");
    const deleteModalMessage = document.getElementById("deleteModalMessage");
    const deleteBookingSummary = document.getElementById("deleteBookingSummary");
    const deletePasswordSection = document.getElementById("deletePasswordSection");
    const deletePasswordInput = document.getElementById("deletePasswordInput");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

    let adminPassword = sessionStorage.getItem("adminPassword") || "";
    let currentBookings = [];
    let currentDeleteId = null;
    let deletePasswordValidated = sessionStorage.getItem("deletePasswordValidated") === "true";

    async function loadBookings() {
      const data = await api("/api/bookings", {
        headers: { "x-admin-password": adminPassword },
      });
      currentBookings = data.bookings || [];
      renderBookings(currentBookings, tbody, cardsEl);
    }

    async function unlock() {
      const pass = (passwordInput.value || "").trim();
      if (!pass) {
        showToast("Enter admin password.", "error");
        return;
      }
      adminPassword = pass;
      sessionStorage.setItem("adminPassword", adminPassword);
      try {
        await loadBookings();
        gate.classList.add("hidden");
        dashboard.classList.remove("hidden");
        showToast("Dashboard unlocked.", "success");
      } catch (error) {
        adminPassword = "";
        sessionStorage.removeItem("adminPassword");
        showToast(error.message || "Invalid password or unable to load bookings.", "error");
      }
    }

    unlockBtn.addEventListener("click", unlock);
    passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        unlock();
      }
    });
    refreshBtn.addEventListener("click", async () => {
      try {
        await loadBookings();
        showToast("Bookings refreshed.", "success");
      } catch (error) {
        showToast(error.message || "Unable to load bookings.", "error");
      }
    });

    lockDashboardBtn?.addEventListener("click", () => {
      sessionStorage.removeItem("adminPassword");
      sessionStorage.removeItem("deletePasswordValidated");
      deletePasswordValidated = false;
      window.location.href = "index.html";
    });

    downloadAllBtn?.addEventListener("click", () => {
      if (!currentBookings.length) {
        showToast("No bookings available to export.", "error");
        return;
      }
      const rows = [];
      currentBookings.forEach((booking) => {
        const services = Array.isArray(booking.selectedServices) && booking.selectedServices.length
          ? booking.selectedServices
          : [{ category: "", service: "", rateLabel: "", amount: null }];
        services.forEach((item, index) => {
          rows.push([
            booking.id || "",
            index === 0 ? booking.name || "" : "",
            index === 0 ? booking.phone || "" : "",
            index === 0 ? booking.email || "" : "",
            index === 0 ? booking.promoCode || "" : "",
            item.category || "",
            item.service || "",
            item.rateLabel || "",
            item.amount ?? "",
            index === 0 ? Number.isFinite(Number(booking.totalBill)) ? Number(booking.totalBill) : 0 : "",
            index === 0 ? booking.status || "" : "",
            index === 0 ? new Date(booking.createdAt).toLocaleString() : "",
          ]);
        });
      });
      downloadExcelLikeFile(
        "libraz-all-bookings.xls",
        [
          "Booking ID",
          "Name",
          "Phone",
          "Email",
          "Promo Code",
          "Service Category",
          "Service",
          "Service Rate",
          "Service Amount",
          "Total Bill",
          "Status",
          "Created At",
        ],
        rows
      );
      showToast("All bookings file downloaded.", "success");
    });

    confirmDeleteBtn.addEventListener("click", async () => {
      if (!deletePasswordValidated) {
        const password = deletePasswordInput.value.trim();
        if (password !== "Master1") {
          showToast("Incorrect password.", "error");
          return;
        }
        deletePasswordValidated = true;
        sessionStorage.setItem("deletePasswordValidated", "true");
      }

      try {
        await api(`/api/bookings/${currentDeleteId}`, {
          method: "DELETE",
          headers: {
            "x-admin-password": adminPassword,
          },
        });
        document.querySelectorAll(`[data-id="${currentDeleteId}"]`).forEach((row) => row.remove());
        deleteModal.classList.add("hidden");
        currentDeleteId = null;
        showToast("Booking deleted.", "success");
      } catch (error) {
        showToast(error.message || "Delete failed.", "error");
      }
    });

    deletePasswordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmDeleteBtn.click();
      }
    });

    cancelDeleteBtn.addEventListener("click", () => {
      deleteModal.classList.add("hidden");
      currentDeleteId = null;
    });

    deleteModal.addEventListener("click", (event) => {
      if (event.target === deleteModal || event.target.classList.contains("modal-backdrop")) {
        deleteModal.classList.add("hidden");
        currentDeleteId = null;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !deleteModal.classList.contains("hidden")) {
        deleteModal.classList.add("hidden");
        currentDeleteId = null;
      }
    });

    dashboard.addEventListener("change", async (event) => {
      const select = event.target.closest(".status-select");
      if (!select) return;
      const row = select.closest("tr, .booking-card-mobile");
      const id = row?.dataset.id;
      if (!id) return;

      try {
        await api(`/api/bookings/${id}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": adminPassword,
          },
          body: JSON.stringify({ status: select.value }),
        });
        const badges = row.querySelectorAll(".status-badge");
        badges.forEach((badge) => {
          badge.className = `status-badge ${getBadgeClass(select.value)}`;
          badge.textContent = select.value;
        });
        showToast("Status updated.", "success");
      } catch (error) {
        showToast(error.message || "Status update failed.", "error");
      }
    });

    dashboard.addEventListener("click", async (event) => {
      const deleteBtn = event.target.closest(".delete-btn");
      if (!deleteBtn) return;
      const row = deleteBtn.closest("tr, .booking-card-mobile");
      const id = row?.dataset.id;
      if (!id) return;

      currentDeleteId = id;
      const booking = currentBookings.find((item) => item.id === id);
      if (booking) {
        deleteBookingSummary.innerHTML = `
          <div><strong>Name:</strong> ${escapeHtml(booking.name || "-")}</div>
          <div><strong>Phone:</strong> ${escapeHtml(booking.phone || "-")}</div>
          <div><strong>Total:</strong> ${formatPkr(Number(booking.totalBill) || 0)}</div>
          <div><strong>Services:</strong> ${escapeHtml(
            Array.isArray(booking.selectedServices) && booking.selectedServices.length
              ? booking.selectedServices.map((item) => `${item.category}: ${item.service}`).join(" | ")
              : "-"
          )}</div>
        `;
      } else {
        deleteBookingSummary.textContent = "Review the selected booking before confirming deletion.";
      }

      if (deletePasswordValidated) {
        deleteModalMessage.textContent = "Delete password already verified for this session. Confirm deletion.";
        deletePasswordSection.classList.add("hidden");
      } else {
        deleteModalMessage.textContent = "Enter the delete password to confirm deletion of this booking:";
        deletePasswordSection.classList.remove("hidden");
        deletePasswordInput.value = "";
        deletePasswordInput.focus();
      }

      deleteModal.classList.remove("hidden");
      if (deletePasswordValidated) {
        confirmDeleteBtn.focus();
      }
    });

    if (adminPassword) {
      passwordInput.value = adminPassword;
      unlock();
    }
  }

  function initPriceListPage() {
    const container = document.getElementById("priceListContainer");
    if (!container || priceCatalog.length === 0) return;
    const searchInput = document.getElementById("priceSearchInput");
    const filtersWrap = document.getElementById("priceCategoryFilters");
    const pageLinks = document.querySelectorAll('.price-list-page a');
    const urlParams = new URLSearchParams(window.location.search);
    const fromAdmin = urlParams.get('from') === 'admin';

    if (fromAdmin) {
      sessionStorage.setItem('lockAdminAfterPriceList', 'true');
    }

    function clearAdminLockOnReturn() {
      if (sessionStorage.getItem('lockAdminAfterPriceList') === 'true') {
        sessionStorage.removeItem('adminPassword');
        sessionStorage.removeItem('deletePasswordValidated');
        sessionStorage.removeItem('lockAdminAfterPriceList');
      }
    }

    pageLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        if (fromAdmin) {
          clearAdminLockOnReturn();
        }
      });
    });

    if (fromAdmin) {
      window.addEventListener('beforeunload', clearAdminLockOnReturn);
      window.addEventListener('pagehide', clearAdminLockOnReturn);
    }

    let activeCategory = "All";
    let term = "";

    function serviceMatches(service) {
      const hay = `${service.name} ${service.rate}`.toLowerCase();
      return hay.includes(term);
    }

    function renderCategoryFilters() {
      const buttons = ['<button type="button" data-category="All" class="chip-btn">All</button>'];
      priceCatalog.forEach((entry) => {
        buttons.push(`<button type="button" data-category="${escapeHtml(entry.category)}" class="chip-btn">${escapeHtml(entry.category)}</button>`);
      });
      filtersWrap.innerHTML = buttons.join("");
      filtersWrap.querySelectorAll(".chip-btn").forEach((btn) => {
        if (btn.dataset.category === activeCategory) btn.classList.add("active");
        btn.addEventListener("click", () => {
          activeCategory = btn.dataset.category;
          renderPriceList();
          renderCategoryFilters();
        });
      });
    }

    function renderPriceList() {
      const blocks = [];
      priceCatalog.forEach((entry) => {
        if (activeCategory !== "All" && entry.category !== activeCategory) return;
        const services = entry.services.filter(serviceMatches);
        if (!services.length) return;
        const rows = services
          .map(
            (service, index) =>
              `<tr><td>${index + 1}</td><td>${escapeHtml(service.name)}</td><td><span class="rate-chip">${escapeHtml(service.rate)}</span></td></tr>`
          )
          .join("");
        blocks.push(`
          <section class="price-category-section">
            <h3>${escapeHtml(entry.category)}</h3>
            ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
            <div class="table-wrap">
              <table>
                <thead><tr><th>No.</th><th>Service</th><th>Rate</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </section>
        `);
      });
      container.innerHTML = blocks.join("") || '<p class="empty-bookings">No services found for your search.</p>';
    }

    searchInput?.addEventListener("input", (event) => {
      term = String(event.target.value || "").trim().toLowerCase();
      renderPriceList();
    });

    renderCategoryFilters();
    renderPriceList();
  }

  initBookingPage();
  initSuccessPage();
  initAdminPage();
  initPriceListPage();
})();
