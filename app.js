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

  let data = null;
  let rows = [];

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
  };

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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    const list = filtered();
    renderStats(list);
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

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      el.sort.value = th.dataset.sort;
      render();
    });
  });

  fetch("hotels.json")
    .then((r) => r.json())
    .then((j) => {
      data = j;
      rows = j.hotels || [];
      const ev = j.event || {};
      const se = j.search || {};
      el.title.textContent = ev.name || "Presto hotels";
      el.subtitle.textContent = [
        se.startDate && se.endDate ? `${se.startDate} → ${se.endDate}` : null,
        ev.venueName,
        se.formattedAddress,
        j.scrapedAt ? `scraped ${j.scrapedAt.slice(0, 16).replace("T", " ")}Z` : null,
        "read-only · no booking",
      ]
        .filter(Boolean)
        .join(" · ");
      render();
    })
    .catch((e) => {
      el.subtitle.textContent = "Failed to load hotels.json: " + e.message;
    });
})();
