(() => {
  const money = (n, c = "USD") =>
    n == null || n === ""
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: c || "USD",
          maximumFractionDigits: 0,
        }).format(Number(n));

  const fmtMi = (n) => (n == null ? "—" : `${Number(n).toFixed(1)} mi`);

  const availRank = { AVAILABLE: 0, WAITLIST: 1, SOLD_OUT: 2, NOT_AVAILABLE: 3 };
  const pinColor = {
    AVAILABLE: "#3ecf8e",
    WAITLIST: "#f0b429",
    SOLD_OUT: "#f07178",
    NOT_AVAILABLE: "#f07178",
  };

  let data = null;
  let rows = [];
  let view = "list";
  let map = null;
  let hotelLayer = null;
  let venueMarker = null;
  let mapReady = false;

  const el = {
    title: document.getElementById("title"),
    subtitle: document.getElementById("subtitle"),
    stats: document.getElementById("stats"),
    q: document.getElementById("q"),
    avail: document.getElementById("avail"),
    pref: document.getElementById("pref"),
    sort: document.getElementById("sort"),
    tbody: document.getElementById("tbody"),
    cards: document.getElementById("cards"),
    table: document.getElementById("table"),
    empty: document.getElementById("empty"),
    cardsOnly: document.getElementById("cardsOnly"),
    cardsToggle: document.getElementById("cardsToggle"),
    listWrap: document.getElementById("listWrap"),
    mapWrap: document.getElementById("mapWrap"),
    tabList: document.getElementById("tabList"),
    tabMap: document.getElementById("tabMap"),
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function filtered() {
    const q = (el.q.value || "").trim().toLowerCase();
    const av = el.avail.value;
    const pref = el.pref.value;
    let list = rows.slice();
    if (av) list = list.filter((h) => h.availability === av);
    if (pref === "1") list = list.filter((h) => h.isPreferred);
    if (pref === "0") list = list.filter((h) => !h.isPreferred);
    if (q) {
      list = list.filter((h) => {
        const hay = [
          h.name,
          h.city,
          h.state,
          h.address,
          h.postal,
          ...(h.amenities || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    const sort = el.sort.value;
    list.sort((a, b) => {
      if (sort === "name") return (a.name || "").localeCompare(b.name || "");
      if (sort === "rating") return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      if (sort === "price")
        return (Number(a.avgPerNight) || 1e12) - (Number(b.avgPerNight) || 1e12);
      if (sort === "total")
        return (Number(a.lowestTotal) || 1e12) - (Number(b.lowestTotal) || 1e12);
      if (sort === "avail")
        return (availRank[a.availability] ?? 9) - (availRank[b.availability] ?? 9);
      return (Number(a.distanceMi) || 1e9) - (Number(b.distanceMi) || 1e9);
    });
    return list;
  }

  function renderStats(list) {
    const by = {};
    list.forEach((h) => {
      by[h.availability || "?"] = (by[h.availability || "?"] || 0) + 1;
    });
    const chips = [
      `<span class="chip">${list.length} shown</span>`,
      `<span class="chip">of ${rows.length}</span>`,
    ];
    for (const [k, v] of Object.entries(by)) {
      const cls =
        k === "AVAILABLE" ? "ok" : k === "WAITLIST" ? "warn" : "bad";
      chips.push(`<span class="chip ${cls}">${k.replace("_", " ")}: ${v}</span>`);
    }
    el.stats.innerHTML = chips.join("");
  }

  function rowHtml(h) {
    const flags = [
      h.isPreferred ? "Preferred" : null,
      h.isHost ? "Host" : null,
      h.waitListEnabled ? "WL on" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return `<tr>
      <td>${h.thumb ? `<img class="thumb" src="${h.thumb}" alt="" loading="lazy" />` : ""}</td>
      <td class="name">
        <a href="${h.link || "#"}" target="_blank" rel="noopener">${escapeHtml(h.name || "Hotel")}</a>
        <div class="meta">${escapeHtml([h.address, h.city, h.state, h.postal].filter(Boolean).join(", "))}${flags ? " · " + flags : ""}</div>
      </td>
      <td class="num">${fmtMi(h.distanceMi)}</td>
      <td class="num">${money(h.avgPerNight, h.currency)}</td>
      <td class="num">${money(h.lowestTotal, h.currency)}</td>
      <td><span class="badge ${h.availability || ""}">${escapeHtml((h.availability || "—").replace("_", " "))}</span></td>
      <td class="num">${h.rating != null ? escapeHtml(String(h.rating)) : "—"}</td>
      <td>${h.link ? `<a href="${h.link}" target="_blank" rel="noopener">Open</a>` : "—"}</td>
    </tr>`;
  }

  function cardHtml(h) {
    return `<article class="card">
      ${h.thumb ? `<img src="${h.thumb}" alt="" loading="lazy" />` : `<div></div>`}
      <div class="body">
        <h3><a href="${h.link || "#"}" target="_blank" rel="noopener">${escapeHtml(h.name || "Hotel")}</a></h3>
        <div class="meta">${escapeHtml([h.city, h.state].filter(Boolean).join(", "))} · ${fmtMi(h.distanceMi)}</div>
        <div class="row2">
          <span class="badge ${h.availability || ""}">${escapeHtml((h.availability || "—").replace("_", " "))}</span>
          <span>${money(h.avgPerNight, h.currency)}/night</span>
          <span>${money(h.lowestTotal, h.currency)} stay</span>
          <span>★ ${h.rating != null ? escapeHtml(String(h.rating)) : "—"}</span>
        </div>
      </div>
    </article>`;
  }

  function pinIcon(color) {
    return L.divIcon({
      className: "pin-icon",
      html: `<div class="pin-bubble" style="background:${color}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8],
    });
  }

  function popupHtml(h) {
    const addr = [h.address, h.city, h.state, h.postal].filter(Boolean).join(", ");
    return `<div>
      <strong>${escapeHtml(h.name || "Hotel")}</strong><br/>
      <span class="badge ${h.availability || ""}">${escapeHtml((h.availability || "—").replace("_", " "))}</span>
      ${fmtMi(h.distanceMi)} · ${money(h.avgPerNight, h.currency)}/night<br/>
      <span style="color:#9aabbf;font-size:0.8rem">${escapeHtml(addr)}</span><br/>
      ${h.link ? `<a href="${h.link}" target="_blank" rel="noopener">Open on Presto</a>` : ""}
    </div>`;
  }

  function ensureMap() {
    if (mapReady) return;
    map = L.map("map", { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);
    hotelLayer = L.layerGroup().addTo(map);
    const se = (data && data.search) || {};
    if (se.latitude != null && se.longitude != null) {
      venueMarker = L.circleMarker([se.latitude, se.longitude], {
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: "#3d9cf0",
        fillOpacity: 1,
      })
        .bindPopup(`<strong>Venue</strong><br/>${escapeHtml(se.formattedAddress || "Event venue")}`)
        .addTo(map);
    }
    mapReady = true;
  }

  function renderMap(list) {
    ensureMap();
    hotelLayer.clearLayers();
    const bounds = [];
    const se = (data && data.search) || {};
    if (se.latitude != null && se.longitude != null) {
      bounds.push([se.latitude, se.longitude]);
    }
    list.forEach((h) => {
      if (h.lat == null || h.lng == null) return;
      const color = pinColor[h.availability] || "#9aabbf";
      const m = L.marker([h.lat, h.lng], {
        icon: pinIcon(color),
        title: h.name || "Hotel",
      }).bindPopup(popupHtml(h));
      m.addTo(hotelLayer);
      bounds.push([h.lat, h.lng]);
    });
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
    } else if (se.latitude != null) {
      map.setView([se.latitude, se.longitude], 11);
    }
    setTimeout(() => map.invalidateSize(), 50);
  }

  function setView(next) {
    view = next;
    const isMap = view === "map";
    el.listWrap.hidden = isMap;
    el.mapWrap.hidden = !isMap;
    el.tabList.classList.toggle("active", !isMap);
    el.tabMap.classList.toggle("active", isMap);
    el.tabList.setAttribute("aria-selected", String(!isMap));
    el.tabMap.setAttribute("aria-selected", String(isMap));
    el.cardsToggle.style.display = isMap ? "none" : "flex";
    document.body.classList.toggle("map-mode", isMap);
    render();
  }

  function render() {
    const list = filtered();
    renderStats(list);
    if (view === "map") {
      renderMap(list);
      el.empty.hidden = true;
      return;
    }
    el.tbody.innerHTML = list.map(rowHtml).join("");
    el.cards.innerHTML = list.map(cardHtml).join("");
    el.empty.hidden = list.length > 0;
    const cards = el.cardsOnly.checked;
    el.table.classList.toggle("hide", cards);
    el.cards.classList.toggle("force", cards);
  }

  ["input", "change"].forEach((ev) => {
    el.q.addEventListener(ev, render);
    el.avail.addEventListener(ev, render);
    el.pref.addEventListener(ev, render);
    el.sort.addEventListener(ev, render);
    el.cardsOnly.addEventListener(ev, render);
  });

  el.tabList.addEventListener("click", () => setView("list"));
  el.tabMap.addEventListener("click", () => setView("map"));

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      el.sort.value = th.dataset.sort;
      render();
    });
  });

  // deep-link ?view=map
  if (new URLSearchParams(location.search).get("view") === "map") {
    view = "map";
  }

  let dataFingerprint = "";
  let loadGen = 0;
  let initialLoad = true;

  function fingerprint(j) {
    const n = (j.hotels || []).length;
    return `${j.scrapedAt || ""}|${n}|${(j.source && j.source.shopKeyOut) || ""}`;
  }

  function fmtUpdated(iso) {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return `Updated ${iso.slice(0, 16).replace("T", " ")}Z`;
      return `Updated ${d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;
    } catch {
      return `Updated ${iso}`;
    }
  }

  function applySubtitle(j) {
    const ev = j.event || {};
    const se = j.search || {};
    el.title.textContent = ev.name || "Presto hotels";
    el.subtitle.textContent = [
      se.startDate && se.endDate ? `${se.startDate} → ${se.endDate}` : null,
      ev.venueName,
      fmtUpdated(j.scrapedAt),
      "read-only · no booking",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  async function loadHotels({ silent = false } = {}) {
    const gen = ++loadGen;
    const url = `hotels.json?t=${Date.now()}`;
    try {
      const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (gen !== loadGen) return; // stale response
      const fp = fingerprint(j);
      if (fp === dataFingerprint && data) {
        applySubtitle(j); // refresh "Updated …" wording only
        return;
      }
      dataFingerprint = fp;
      data = j;
      rows = j.hotels || [];
      applySubtitle(j);
      if (initialLoad) {
        initialLoad = false;
        setView(view);
      } else {
        render(); // keep filters / sort / map tab
      }
    } catch (e) {
      if (!silent && !data) {
        el.subtitle.textContent = "Failed to load hotels.json: " + e.message;
      }
    }
  }

  loadHotels();

  window.addEventListener("pageshow", (ev) => {
    // bfcache restore or normal show — always re-check overnight updates
    if (ev.persisted || document.visibilityState === "visible") {
      loadHotels({ silent: true });
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      loadHotels({ silent: true });
    }
  });

  window.addEventListener("focus", () => {
    loadHotels({ silent: true });
  });
})();
