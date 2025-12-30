// --- Initialize Map (Delhi Focused) ---
const map = L.map('map', {
  minZoom: 10,
  maxZoom: 18,
  maxBounds: [
    [28.35, 76.80], // Southwest Delhi boundary
    [28.88, 77.35]  // Northeast Delhi boundary
  ]
}).setView([28.6139, 77.2090], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let routesLayer = L.layerGroup().addTo(map);

// --- Toast Helper ---
function showToast(msg, type = "danger") {
  const toast = document.getElementById('toast');
  toast.querySelector('.toast-body').textContent = msg;
  toast.classList.remove('bg-danger', 'bg-success');
  toast.classList.add(type === "success" ? "bg-success" : "bg-danger");
  toast.style.opacity = 1;
  setTimeout(() => toast.style.opacity = 0, 3500);
}

// --- Geocoding (restricted to Delhi) ---
async function geocode(place) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&countrycodes=in&bounded=1&viewbox=76.80,28.35,77.35,28.88&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SheSafe/1.0' } });
  const data = await res.json();
  return data.length ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
}

// --- Main Route Finder ---
async function findRoutes() {
  const startSel = document.getElementById('start');
  const endSel = document.getElementById('end');
  const customStart = document.getElementById('customStart');
  const customEnd = document.getElementById('customEnd');

  let start = startSel.value === "Custom (type manually)" ? customStart.value.trim() : startSel.value;
  let end = endSel.value === "Custom (type manually)" ? customEnd.value.trim() : endSel.value;

  if (!start || !end) {
    showToast("Please select both start and destination!");
    return;
  }

  document.getElementById('loader-wrapper').style.display = 'flex';
  routesLayer.clearLayers();

  try {
    const [startCoord, endCoord] = await Promise.all([geocode(start), geocode(end)]);
    if (!startCoord || !endCoord) throw new Error("Could not find one or both locations in Delhi.");

    // --- OSRM route request (Delhi region only) ---
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startCoord[1]},${startCoord[0]};${endCoord[1]},${endCoord[0]}?alternatives=true&geometries=geojson&overview=full`;
    const osrmRes = await fetch(osrmUrl);
    const osrmData = await osrmRes.json();

    if (!osrmData.routes?.length) throw new Error("No routes found.");

    const allRoutes = osrmData.routes.map(r => r.geometry.coordinates.map(c => [c[1], c[0]]));

    // --- Send to backend for scoring ---
    const scoreRes = await fetch("/score_route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routes: allRoutes })
    });
    const scoreData = await scoreRes.json();

    if (!scoreData.scores) throw new Error("Error scoring routes.");

    // --- Identify safest route ---
    let minRisk = Infinity;
    let safestIdx = 0;

    scoreData.scores.forEach((risk, i) => {
      if (risk < minRisk) {
        minRisk = risk;
        safestIdx = i;
      }
    });

    // --- Draw all routes ---
    osrmData.routes.forEach((r, i) => {
      const coords = allRoutes[i];
      const distance = (r.distance / 1000).toFixed(2);
      const safetyScore = scoreData.scores[i].toFixed(2);

      const color = (i === safestIdx) ? 'green' : 'red';
      const weight = (i === safestIdx) ? 6 : 4;

      const polyline = L.polyline(coords, {
        color,
        weight,
        opacity: 0.85
      }).addTo(routesLayer);

      
      polyline.bindPopup(`
        <div class="fw-bold mb-1">${i === safestIdx ? "🟩 Safest Route" : "🟥 Alternate Route"}</div>
        <div><b>Distance:</b> ${distance} km</div>
        <div><b>Safety Score:</b> ${safetyScore}</div>
      `);
    });

    
    const sidebar = document.getElementById("sidebar-wrapper");
    const sidebarContent = document.getElementById("sidebar-content");
    sidebar.style.display = "block";

    const safestRoute = osrmData.routes[safestIdx];
    const safestDist = (safestRoute.distance / 1000).toFixed(2);
    const safestRisk = scoreData.scores[safestIdx].toFixed(2);

    sidebarContent.innerHTML = `
      <h5 class="fw-bold mb-3 text-primary"><i class="bi bi-shield-check"></i> Route Summary</h5>
      <p><b>Safest Route</b><br>
      <i class="bi bi-signpost-2"></i> Distance: ${safestDist} km<br>
      <i class="bi bi-bar-chart"></i> Safety Score: ${safestRisk}</p>
      <hr>
      <p class="text-muted small">Click on any route on the map to view its score.</p>
    `;

    // --- Fit map to safest route ---
    map.fitBounds(L.polyline(allRoutes[safestIdx]).getBounds());

    // --- Add legend ---
    addLegend();

    document.getElementById('loader-wrapper').style.display = 'none';
    showToast("Routes loaded successfully!", "success");

  } catch (err) {
    console.error(err);
    showToast(err.message || "Error finding routes.");
    document.getElementById('loader-wrapper').style.display = 'none';
  }
}

// --- Legend ---
function addLegend() {
  const existing = document.querySelector(".map-legend");
  if (existing) existing.remove();

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend card shadow-sm p-2 glass-card');
    div.innerHTML = `
      <h6 class="fw-bold mb-2">Legend</h6>
      <div><span class="color-box" style="background:green;"></span> Safest Route</div>
      <div><span class="color-box" style="background:red;"></span> Other Routes</div>
    `;
    return div;
  };
  legend.addTo(map);
}
