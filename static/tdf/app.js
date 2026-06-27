const data = window.TDF_TRIP_DATA;
const validViews = new Set(["overview", "day", "compare", "places", "lodging", "transit", "activities", "intake"]);

const state = {
  selectedStageId: data.itinerary[0].id,
  activeView: "day",
  hideCompareLowPriority: true,
  placesTypeFilter: "all",
  layers: {
    stageRoute: true,
    ourRoute: true,
    viewing_spot: true,
    activity: true,
    coffee: true,
    shopping: true,
    food: true,
    lodging: true,
  },
};

const layerMeta = {
  stageRoute: { label: "Tour route", color: "#b54844" },
  ourRoute: { label: "Our route", color: "#2f68a2" },
  viewing_spot: { label: "Viewing spots", color: "#b54844" },
  activity: { label: "Activities", color: "#1f7a8c" },
  coffee: { label: "Coffee", color: "#6f4e37" },
  shopping: { label: "Shopping", color: "#39d353" },
  food: { label: "Food", color: "#b54844" },
  lodging: { label: "Lodging", color: "#6d5fae" },
};

const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
});

L.control.zoom({ position: "bottomright" }).addTo(map);

const routeLayerGroup = L.layerGroup().addTo(map);
const markerLayerGroup = L.layerGroup().addTo(map);
let currentMapBounds = null;
let baseTileLayer = null;
let routeRequestId = 0;
const routeCache = new Map();

const els = {
  workspace: document.querySelector(".workspace"),
  stageSelect: document.querySelector("#stage-select"),
  stageSummary: document.querySelector("#stage-summary"),
  layerList: document.querySelector("#layer-list"),
  resetMap: document.querySelector("#reset-map"),
  tabs: document.querySelectorAll(".tab-button"),
  views: document.querySelectorAll(".view-panel"),
  overview: document.querySelector("#overview-view"),
  day: document.querySelector("#day-view"),
  compare: document.querySelector("#compare-view"),
  places: document.querySelector("#places-view"),
  lodging: document.querySelector("#lodging-view"),
  transit: document.querySelector("#transit-view"),
  activities: document.querySelector("#activities-view"),
  intake: document.querySelector("#intake-view"),
};

const imageLightbox = document.createElement("div");
imageLightbox.className = "image-lightbox";
imageLightbox.setAttribute("aria-hidden", "true");
imageLightbox.innerHTML = `
  <div class="image-lightbox__backdrop" data-close-image-lightbox></div>
  <figure class="image-lightbox__panel">
    <button class="image-lightbox__close" type="button" data-close-image-lightbox aria-label="Close expanded image">Close</button>
    <img alt="" />
    <figcaption></figcaption>
  </figure>
`;
document.body.append(imageLightbox);
const imageLightboxImg = imageLightbox.querySelector("img");
const imageLightboxCaption = imageLightbox.querySelector("figcaption");

function normalizeStageId(stageId) {
  return data.itinerary.some((stage) => stage.id === stageId) ? stageId : data.itinerary[0].id;
}

function normalizeView(view) {
  return validViews.has(view) ? view : "day";
}

function stateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    selectedStageId: normalizeStageId(params.get("stage")),
    activeView: normalizeView(params.get("view")),
    hideCompareLowPriority: params.get("compare") !== "all",
    placesTypeFilter: params.get("placeType") || "all",
  };
}

function syncUrl({ replace = false } = {}) {
  const params = new URLSearchParams();
  params.set("view", state.activeView);
  params.set("stage", state.selectedStageId);
  if (!state.hideCompareLowPriority) params.set("compare", "all");
  if (state.placesTypeFilter !== "all") params.set("placeType", state.placesTypeFilter);

  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  const historyMethod = replace ? "replaceState" : "pushState";
  window.history[historyMethod](null, "", nextUrl);
}

function applyUrlState({ replace = false, rerenderMap = true, refreshMap = false, fitMap = false } = {}) {
  const urlState = stateFromUrl();
  state.selectedStageId = urlState.selectedStageId;
  state.activeView = urlState.activeView;
  state.hideCompareLowPriority = urlState.hideCompareLowPriority;
  state.placesTypeFilter = urlState.placesTypeFilter;
  if (els.stageSelect) els.stageSelect.value = state.selectedStageId;
  if (replace) syncUrl({ replace: true });
  renderAll();
  if (rerenderMap) {
    scheduleMapRefresh({ fit: fitMap || refreshMap });
  }
}

function updateNavigation(nextState = {}, options = {}) {
  if (nextState.selectedStageId) {
    state.selectedStageId = normalizeStageId(nextState.selectedStageId);
  }
  if (nextState.activeView) {
    state.activeView = normalizeView(nextState.activeView);
  }
  if (typeof nextState.hideCompareLowPriority === "boolean") {
    state.hideCompareLowPriority = nextState.hideCompareLowPriority;
  }
  if (typeof nextState.placesTypeFilter === "string") {
    state.placesTypeFilter = nextState.placesTypeFilter || "all";
  }

  normalizeStateForActiveView();
  if (els.stageSelect) els.stageSelect.value = state.selectedStageId;
  syncUrl({ replace: Boolean(options.replaceUrl) });
  renderAll();
  if (options.refreshMap) {
    scheduleMapRefresh({ fit: Boolean(options.fitMap) });
  }
}

function refreshMapLayout({ fit = false, pan = false } = {}) {
  map.invalidateSize({ pan });
  if (fit) fitMapToCurrentBounds();
}

function scheduleMapRefresh(options = {}) {
  window.setTimeout(() => refreshMapLayout(options), 80);
}

function openImageLightbox(src, label) {
  imageLightboxImg.src = src;
  imageLightboxImg.alt = label;
  imageLightboxCaption.textContent = label;
  imageLightbox.classList.add("is-open");
  imageLightbox.setAttribute("aria-hidden", "false");
}

function closeImageLightbox() {
  imageLightbox.classList.remove("is-open");
  imageLightbox.setAttribute("aria-hidden", "true");
  imageLightboxImg.removeAttribute("src");
  imageLightboxImg.alt = "";
}

function addBaseTiles() {
  if (baseTileLayer) return;

  baseTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 1,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
}

function selectedStage() {
  return data.itinerary.find((stage) => stage.id === state.selectedStageId);
}

function stageById(stageId) {
  return data.itinerary.find((stage) => stage.id === stageId);
}

function stagePlaces(stageId) {
  return data.places.filter((place) => place.stageId === stageId);
}

function stageOptions(stageId) {
  return data.options.filter((option) => option.stageId === stageId);
}

function stageDateIso(stage) {
  const match = stage.id.match(/jul-(\d{2})$/);
  return match ? `2026-07-${match[1]}` : "";
}

function stageRoute(stage) {
  return stage.raceInfo?.route || [];
}

function ourRoute(stage) {
  return stage.ourRoute || [];
}

function raceInfo(stage) {
  return stage.raceInfo || null;
}

function officialRoute(stage) {
  return raceInfo(stage)?.officialRoute || null;
}

function stageActivities(stage) {
  const explicitActivities = (data.activities || []).filter((activity) => activity.stageId === stage.id);
  const options = stageOptions(stage.id);
  const hasExplicitStageViewingActivity = explicitActivities.some(
    (activity) => activity.type === "stage-viewing" && optionsForActivity(activity).length,
  );

  if (!options.length || hasExplicitStageViewingActivity) return explicitActivities;

  return [
    ...explicitActivities,
    {
      id: `${stage.id}-stage-viewing`,
      stageId: stage.id,
      type: "stage-viewing",
      name: "Stage Viewing",
      summary: "Choose where to watch the race for this day.",
      status: "shortlisted",
      startTime: raceInfo(stage)?.startTime || "",
      endTime: raceInfo(stage)?.endTime || "",
      optionIds: options.map((option) => option.id),
    },
  ];
}

function stageViewStages() {
  return data.itinerary.filter((stage) =>
    stageActivities(stage).some((activity) => activity.type === "stage-viewing" && optionsForActivity(activity).length),
  );
}

function optionsForActivity(activity) {
  if (!activity.optionIds?.length) return [];
  return stageOptions(activity.stageId).filter((option) => activity.optionIds.includes(option.id));
}

function compareOptionRank(option) {
  const ranking = {
    selected: 0,
    fallback: 1,
    candidate: 2,
    rejected: 3,
  };
  return ranking[option.status] ?? 99;
}

function selectedOptionForActivity(activity) {
  const options = optionsForActivity(activity);
  return [...options].sort((a, b) => compareOptionRank(a) - compareOptionRank(b))[0] || null;
}

function hideCompareOption(option) {
  return state.hideCompareLowPriority && ["candidate", "rejected"].includes(option.status);
}

function placesForStage(stageId) {
  return data.places.filter((place) => {
    const layerEnabled = Boolean(state.layers[place.type]);
    if (!(place.stageId === stageId && layerEnabled)) return false;
    if (!(["day", "compare"].includes(state.activeView) && place.type === "viewing_spot")) return true;

    const option = optionForPlace(place);
    return option ? !hideCompareOption(option) : true;
  });
}

function placesForOverview() {
  return data.places.filter((place) => place.type !== "viewing_spot" && Boolean(state.layers[place.type]));
}

function mappedActivitiesForStage(stageId) {
  if (!state.layers.activity) return [];
  return (data.mappedActivities || []).filter((activity) => activity.stageId === stageId);
}

function mappedActivitiesForOverview() {
  if (!state.layers.activity) return [];
  return data.mappedActivities || [];
}

function renderStageSelect() {
  els.stageSelect.innerHTML = data.itinerary
    .map((stage) => `<option value="${stage.id}">${stage.dateLabel} · ${stage.title}</option>`)
    .join("");
  els.stageSelect.value = state.selectedStageId;
}

function renderLayerControls() {
  els.layerList.innerHTML = Object.entries(layerMeta)
    .map(([key, meta]) => {
      const checked = state.layers[key] ? "checked" : "";
      return `
        <label class="toggle-row">
          <span>${meta.label}</span>
          <input type="checkbox" data-layer="${key}" ${checked} />
        </label>
      `;
    })
    .join("");
}

function renderStageSummary() {
  const stage = selectedStage();
  els.stageSummary.innerHTML = `
    <p>${stage.summary}</p>
    <div class="metric-row"><span>Base</span><strong>${stage.base}</strong></div>
    <div class="metric-row"><span>Activities</span><strong>${stageActivities(stage).length}</strong></div>
  `;
}

function markerIcon(type) {
  return markerIconWithStatus(type, "");
}

function markerIconWithStatus(type, status) {
  const statusClass = status ? ` dot-status-${status}` : "";
  return L.divIcon({
    className: "",
    html: `<div class="marker-dot dot-${type}${statusClass}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

function officialRouteCacheKey(stage) {
  const route = officialRoute(stage);
  if (!route) return "";
  return `${route.layerUrl}?${route.where}`;
}

function officialRouteUrl(stage) {
  const route = officialRoute(stage);
  const params = new URLSearchParams({
    where: route.where,
    outFields: "Etape,Name,Longueur,Type",
    returnGeometry: "true",
    f: "geojson",
    outSR: "4326",
  });

  return `${route.layerUrl}/query?${params.toString()}`;
}

function geoJsonToLatLngLines(geoJson) {
  return (geoJson.features || []).flatMap((feature) => {
    const geometry = feature.geometry || {};
    if (geometry.type === "LineString") {
      return [geometry.coordinates.map(([lng, lat]) => [lat, lng])];
    }

    if (geometry.type === "MultiLineString") {
      return geometry.coordinates.map((line) => line.map(([lng, lat]) => [lat, lng]));
    }

    return [];
  });
}

async function loadOfficialRoute(stage) {
  const key = officialRouteCacheKey(stage);
  if (routeCache.has(key)) return routeCache.get(key);

  const response = await fetch(officialRouteUrl(stage));
  if (!response.ok) throw new Error(`Route request failed: ${response.status}`);

  const geoJson = await response.json();
  const lines = geoJsonToLatLngLines(geoJson);
  routeCache.set(key, lines);
  return lines;
}

function drawStageRouteLines(lines, style = {}) {
  const drawnPoints = [];
  lines.forEach((line) => {
    if (!line.length) return;
    L.polyline(line, {
      color: layerMeta.stageRoute.color,
      weight: style.weight || 5,
      opacity: style.opacity || 0.9,
      lineJoin: "round",
      lineCap: "round",
    }).addTo(routeLayerGroup);
    drawnPoints.push(...line.map(([lat, lng]) => L.latLng(lat, lng)));
  });
  return drawnPoints;
}

function drawOurRoute(stage) {
  const route = ourRoute(stage);
  if (!(state.layers.ourRoute && route.length)) return [];

  const line = L.polyline(route, {
    color: layerMeta.ourRoute.color,
    weight: 4,
    opacity: 0.8,
    dashArray: "8 8",
  }).addTo(routeLayerGroup);

  return line.getLatLngs();
}

function googleMapsUrl(place) {
  if (place.googleMapsUrl) return place.googleMapsUrl;
  const { lat, lng } = place.coordinates;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function activityMapsUrl(activity) {
  if (activity.googleMapsUrl) return activity.googleMapsUrl;
  if (!activity.coordinates) return "";
  const { lat, lng } = activity.coordinates;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function resourceLinks(item) {
  return (item.resources || item.sources || []).map((link) => ({
    label: link.label || link.title || "Resource",
    url: link.url,
    note: link.note,
  }));
}

function dedupeLinks(links) {
  const seen = new Set();

  return links.filter((link) => {
    if (!link?.url) return false;
    const key = `${link.label || ""}::${link.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapActionLinks(place) {
  return dedupeLinks([{ label: "Open in Google Maps", url: googleMapsUrl(place) }, ...resourceLinks(place)]);
}

function relatedPlaces(option) {
  return (option.relatedPlaceIds || [])
    .map((placeId) => data.places.find((place) => place.id === placeId))
    .filter(Boolean);
}

function optionForPlace(place) {
  return data.options.find((option) => (option.relatedPlaceIds || []).includes(place.id));
}

function isViewingPlace(place) {
  return place.type === "viewing_spot";
}

function placeContextLabel(place, { overview = false } = {}) {
  if (!overview) {
    return place.status ? `${place.type.replace("_", " ")} · ${place.status}` : place.type.replace("_", " ");
  }

  if (isViewingPlace(place)) {
    return `${stageLabel(place.stageId)} · ${place.type.replace("_", " ")}`;
  }

  if (place.stageIds?.length > 1) {
    return `${place.type.replace("_", " ")} · multiple days`;
  }

  if (place.stageIds?.length === 1) {
    return `${place.type.replace("_", " ")} · ${stageLabel(place.stageIds[0])}`;
  }

  return place.type.replace("_", " ");
}

function fieldValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "TBD";
  return `${value}${suffix}`;
}

function parseTimeValue(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.POSITIVE_INFINITY;

  return hours * 60 + minutes;
}

function stageLabel(stageId) {
  const stage = stageById(stageId);
  return stage ? `${stage.dateLabel} · ${stage.title}` : stageId || "Unassigned";
}

function activityTiming(activity) {
  return [activity.startTime, activity.endTime].filter(Boolean).join(" - ") || "TBD";
}

function transitRouteLabel(transit) {
  return [transit.method, transit.start && transit.end ? `${transit.start} to ${transit.end}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function renderStageFacts(stage) {
  const details = raceInfo(stage);
  if (!details) return "";

  const routeMap = details.routeMap || {};
  const profile = details.elevationProfile || {};
  const links = [
    details.officialUrl
      ? { label: "Official race page", url: details.officialUrl }
      : null,
    routeMap.url ? { label: routeMap.label || "Route map", url: routeMap.url } : null,
    profile.url ? { label: profile.label || "Elevation profile", url: profile.url } : null,
  ].filter(Boolean);
  const images = [
    routeMap.imageUrl
      ? {
          label: routeMap.label || "Official route map",
          imageUrl: routeMap.imageUrl,
          className: "route-map-image",
        }
      : null,
    profile.imageUrl
      ? {
          label: profile.label || "Official elevation profile",
          imageUrl: profile.imageUrl,
          className: "elevation-profile-image",
        }
      : null,
  ].filter(Boolean);

  return `
    <div class="stage-overview-row">
      <div class="stage-facts">
        <div>
          <span>Race start</span>
          <strong>${fieldValue(details.startTime)}</strong>
        </div>
        <div>
          <span>Est. finish</span>
          <strong>${fieldValue(details.endTime)}</strong>
        </div>
        <div>
          <span>Route map</span>
          <strong>${routeMap.label || "TBD"}</strong>
        </div>
        ${links.length ? `<div class="stage-fact-links">${renderActionLinks(links)}</div>` : ""}
      </div>
      ${images.length ? `<div class="stage-image-grid">${images.map(renderStageImage).join("")}</div>` : ""}
      <section class="day-context-card weather-card stage-weather-card" id="compare-weather-card">
        <h3>Weather</h3>
        <p>Loading forecast...</p>
      </section>
    </div>
  `;
}

function renderStageImage(image) {
  const label = escapeAttribute(image.label);
  const src = escapeAttribute(image.imageUrl);

  return `
    <button class="stage-image-button ${image.className}" type="button" data-full-image="${src}" data-full-image-label="${label}" aria-label="Open ${label}">
      <span>${escapeHtml(image.label)}</span>
      <img src="${src}" alt="${label}" />
    </button>
  `;
}

function renderPlaceFacts(place) {
  if (place.type === "lodging") {
    return `
      <div class="place-facts">
        <div>
          <span>Stay</span>
          <strong>${fieldValue(place.stayLabel)}</strong>
        </div>
        <div>
          <span>Confirmed</span>
          <strong>${place.confirmed ? "Yes" : "No"}</strong>
        </div>
        <div>
          <span>Map precision</span>
          <strong>${fieldValue(place.mapPrecision)}</strong>
        </div>
      </div>
    `;
  }

  if (!isViewingPlace(place)) return "";

  return `
    <div class="place-facts">
      <div>
        <span>Caravan ETA</span>
        <strong>${fieldValue(place.caravanTime)}</strong>
      </div>
      <div>
        <span>Cyclist ETA</span>
        <strong>${fieldValue(place.estimatedPassageTime)}</strong>
      </div>
      <div>
        <span>Elevation</span>
        <strong>${fieldValue(place.elevationMeters, " m")}</strong>
      </div>
    </div>
  `;
}

function renderActionLinks(links) {
  return `
    <div class="resource-links">
      ${links
        .map(
          (link) => `
            <a href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer">
              ${escapeHtml(link.label)}
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSourceList(item) {
  const links = resourceLinks(item);
  if (!links.length) return "";

  return `
    <div class="source-list">
      <h3>Resources</h3>
      ${links
        .map(
          (link) => `
            <p>
              <a href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer">
                ${escapeHtml(link.label)}
              </a>
              ${link.note ? `<span>${escapeHtml(link.note)}</span>` : ""}
            </p>
          `,
        )
        .join("")}
    </div>
  `;
}

function fitMapToCurrentBounds() {
  if (currentMapBounds) {
    map.fitBounds(currentMapBounds, { padding: [38, 38], maxZoom: 12 });
  }
}

function renderMap({ fit = true } = {}) {
  const requestId = ++routeRequestId;
  routeLayerGroup.clearLayers();
  markerLayerGroup.clearLayers();

  if (state.activeView === "overview") {
    const overviewPlaces = placesForOverview();
    const overviewActivities = mappedActivitiesForOverview();
    const boundsPoints = [];

    overviewPlaces.forEach((place) => {
      const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
        icon: markerIconWithStatus(place.type, place.status || ""),
      }).addTo(markerLayerGroup);

      marker.bindPopup(`
        <p class="popup-title">${place.name}</p>
        <p class="popup-meta">${placeContextLabel(place, { overview: true })}</p>
        <p>${renderRichText(place.summary)}</p>
        ${renderPlaceFacts(place)}
        ${renderActionLinks(mapActionLinks(place).slice(0, 2))}
      `);
      boundsPoints.push(L.latLng(place.coordinates.lat, place.coordinates.lng));
    });

    overviewActivities.forEach((activity) => {
      const marker = L.marker([activity.coordinates.lat, activity.coordinates.lng], {
        icon: markerIconWithStatus(activity.mapType || "activity", activity.status || ""),
      }).addTo(markerLayerGroup);

      marker.bindPopup(`
        <p class="popup-title">${activity.name}</p>
        <p class="popup-meta">activity · ${stageLabel(activity.stageId)}</p>
        <p>${renderRichText(activity.summary || "Activity details TBD.")}</p>
        <div class="place-facts">
          <div>
            <span>Time</span>
            <strong>${activityTiming(activity)}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>${fieldValue(activity.type)}</strong>
          </div>
        </div>
        ${activityMapsUrl(activity) ? renderActionLinks([{ label: "Open in Google Maps", url: activityMapsUrl(activity) }]) : ""}
      `);

      boundsPoints.push(L.latLng(activity.coordinates.lat, activity.coordinates.lng));
    });

    if (boundsPoints.length) {
      currentMapBounds = L.latLngBounds(boundsPoints);
      if (fit) fitMapToCurrentBounds();
    } else {
      currentMapBounds = null;
    }
    return;
  }

  const stage = selectedStage();
  const boundsPoints = [];

  if (state.layers.stageRoute && !officialRoute(stage) && stageRoute(stage).length) {
    boundsPoints.push(...drawStageRouteLines([stageRoute(stage)], { weight: 5 }));
  }

  boundsPoints.push(...drawOurRoute(stage));

  placesForStage(stage.id).forEach((place) => {
    const option = optionForPlace(place);
    const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
      icon: markerIconWithStatus(place.type, option?.status || place.status || ""),
    }).addTo(markerLayerGroup);

    marker.bindPopup(`
      <p class="popup-title">${place.name}</p>
      <p class="popup-meta">${placeContextLabel(place)}</p>
      <p>${renderRichText(place.summary)}</p>
      ${renderPlaceFacts(place)}
      ${renderActionLinks(mapActionLinks(place).slice(0, 2))}
    `);
    boundsPoints.push(L.latLng(place.coordinates.lat, place.coordinates.lng));
  });

  mappedActivitiesForStage(stage.id).forEach((activity) => {
    const marker = L.marker([activity.coordinates.lat, activity.coordinates.lng], {
      icon: markerIconWithStatus(activity.mapType || "activity", activity.status || ""),
    }).addTo(markerLayerGroup);

    marker.bindPopup(`
      <p class="popup-title">${activity.name}</p>
      <p class="popup-meta">activity · ${activity.status || "planned"}</p>
      <p>${renderRichText(activity.summary || "Activity details TBD.")}</p>
      <div class="place-facts">
        <div>
          <span>Time</span>
          <strong>${activityTiming(activity)}</strong>
        </div>
        <div>
          <span>Type</span>
          <strong>${fieldValue(activity.type)}</strong>
        </div>
      </div>
      ${activityMapsUrl(activity) ? renderActionLinks([{ label: "Open in Google Maps", url: activityMapsUrl(activity) }]) : ""}
    `);

    boundsPoints.push(L.latLng(activity.coordinates.lat, activity.coordinates.lng));
  });

  if (boundsPoints.length) {
    currentMapBounds = L.latLngBounds(boundsPoints);
    if (fit) fitMapToCurrentBounds();
  } else {
    currentMapBounds = null;
  }

  if (state.layers.stageRoute && officialRoute(stage)) {
    loadOfficialRoute(stage)
      .then((lines) => {
        if (requestId !== routeRequestId || stage.id !== state.selectedStageId) return;
        routeLayerGroup.clearLayers();
        const detailedBounds = drawStageRouteLines(lines, { weight: 5 });
        detailedBounds.push(...drawOurRoute(stage));
        placesForStage(stage.id).forEach((place) => {
          detailedBounds.push(L.latLng(place.coordinates.lat, place.coordinates.lng));
        });
        mappedActivitiesForStage(stage.id).forEach((activity) => {
          detailedBounds.push(L.latLng(activity.coordinates.lat, activity.coordinates.lng));
        });
        if (detailedBounds.length) {
          currentMapBounds = L.latLngBounds(detailedBounds);
          if (fit) fitMapToCurrentBounds();
        }
      })
      .catch((error) => {
        console.warn(`Could not load official route for ${stage.id}`, error);
        if (stageRoute(stage).length) {
          drawStageRouteLines([stageRoute(stage)], { weight: 4, opacity: 0.55 });
        }
      });
  }
}

function renderOverview() {
  const days = data.itinerary.map((stage) => {
    const activities = [...stageActivities(stage)]
      .filter((activity) => activity.type !== "FYI")
      .map((activity, index) => ({
        name: activity.name,
        time: activityTiming(activity),
        type: activity.type,
        jumpView: activity.type === "stage-viewing" ? "compare" : "",
        sortTime: parseTimeValue(activity.startTime || activity.endTime),
        sortIndex: index,
      }))
      .sort((a, b) => a.sortTime - b.sortTime || a.sortIndex - b.sortIndex);

    return `
      <article class="overview-day-card">
        <button class="overview-day-button" type="button" data-select-stage="${stage.id}" data-jump-view="day">
          <div>
            <h3>${escapeHtml(stage.dateLabel)} · ${escapeHtml(stage.title)}</h3>
            <p class="meta-line">${escapeHtml(stage.routeLabel)}</p>
          </div>
        </button>
        <div class="overview-day-activities">
          ${
            activities.length
              ? activities
                  .map(
                    (activity) => `
                      ${
                        activity.jumpView
                          ? `<button class="overview-activity-title overview-activity-link" type="button" data-select-stage="${stage.id}" data-jump-view="${activity.jumpView}">
                              <span class="overview-activity-time">${escapeHtml(activity.time)}</span>
                              <span class="overview-activity-name">${escapeHtml(activity.name)}</span>
                              <span class="overview-activity-type">${escapeHtml(activity.type)}</span>
                            </button>`
                          : `<div class="overview-activity-title">
                              <span class="overview-activity-time">${escapeHtml(activity.time)}</span>
                              <span class="overview-activity-name">${escapeHtml(activity.name)}</span>
                              <span class="overview-activity-type">${escapeHtml(activity.type)}</span>
                            </div>`
                      }
                    `,
                  )
                  .join("")
              : `<div class="overview-activity-title is-empty">No activities loaded yet</div>`
          }
        </div>
      </article>
    `;
  });

  els.overview.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Overview</h2>
        <p>Scan the whole trip in order, day by day. Select any day to open its full itinerary.</p>
      </div>
    </div>
    <section class="overview-master-timeline" aria-label="Master trip timeline">
      ${days.join("")}
    </section>
  `;
}

function renderDay() {
  const stage = selectedStage();
  const places = stagePlaces(stage.id);
  const lodging = places.filter((place) => place.type === "lodging");
  const activities = stageActivities(stage);

  els.day.innerHTML = `
    <div class="section-header">
      <div>
        <h2>${stage.dateLabel} · ${stage.title}</h2>
        <p>${stage.dayPlan}</p>
      </div>
    </div>
    ${renderDayContext(stage, lodging)}
    <section class="day-timeline-section" aria-label="Day timeline">
      <div class="section-subheader">
        <h3>Timeline</h3>
      </div>
      <div class="day-timeline">
        ${renderDayTimeline(stage, activities)}
      </div>
    </section>
  `;

  renderWeatherWidget(stage, lodging[0]);
}

function renderDayTimeline(stage, activities) {
  const activityItems = activities.length
    ? activities
        .map((activity, index) => {
        const options = optionsForActivity(activity);
        const timing = [activity.startTime, activity.endTime].filter(Boolean).join(" - ");
        const transitDetails =
          activity.type === "transit"
            ? [activity.method, activity.start && activity.end ? `${activity.start} to ${activity.end}` : ""]
                .filter(Boolean)
                .join(" · ")
            : "";
        return {
          sortTime: parseTimeValue(activity.startTime || activity.endTime),
          sortIndex: index,
          time: timing || "TBD",
          label: activity.name,
          type: activity.type,
          body: [activity.summary || `${options.length} options to compare.`, transitDetails].filter(Boolean).join(" "),
          action: options.length
            ? `<button class="secondary-button" type="button" data-jump-view="compare">Open options</button>`
            : resourceLinks(activity).length
              ? renderActionLinks(resourceLinks(activity))
              : "",
        };
      })
        .sort((a, b) => a.sortTime - b.sortTime || a.sortIndex - b.sortIndex)
    : [
        {
          sortTime: Number.POSITIVE_INFINITY,
          sortIndex: 0,
          time: "TBD",
          label: "Activities",
          type: "",
          body: "No activities loaded yet",
        },
      ];

  const items = activityItems;

  return items
    .map(
      (item) => `
        <article class="timeline-item">
          <div class="timeline-time">${escapeHtml(item.time)}</div>
          <div>
            <div class="timeline-heading">
              <h3>${escapeHtml(item.label)}</h3>
              ${item.type ? `<span class="timeline-type">${escapeHtml(item.type)}</span>` : ""}
            </div>
            <p>${renderRichText(item.body)}</p>
            ${item.action || ""}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderDayContext(stage, lodging) {
  return `
    <div class="day-context-grid">
      <section class="day-context-card">
        <h3>Lodging</h3>
        ${
          lodging.length
            ? lodging.map(renderDayLodgingSummary).join("")
            : `<p>${escapeHtml(stage.base)} lodging TBD</p>`
        }
      </section>
      <section class="day-context-card weather-card" id="weather-card">
        <h3>Weather</h3>
        <p>Loading forecast...</p>
      </section>
    </div>
  `;
}

function renderDayLodgingSummary(place) {
  return `
    <div class="lodging-summary">
      <strong>${escapeHtml(place.name)}</strong>
      <span>${escapeHtml(place.stayLabel || "Lodging")}</span>
      <span>${place.confirmed ? "Confirmed" : "Unconfirmed"}</span>
      <p>${renderRichText(place.summary)}</p>
      ${renderActionLinks([{ label: "Map", url: googleMapsUrl(place) }])}
    </div>
  `;
}

function weatherDescription(code) {
  const descriptions = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy showers",
    95: "Thunderstorm",
  };
  return descriptions[code] || "Forecast";
}

const OPEN_METEO_MAX_FORECAST_DAYS = 16;

function parseIsoDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function daysUntilIsoDate(value) {
  const target = parseIsoDate(value);
  if (!target) return null;

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return Math.round((target - todayUtc) / 86400000);
}

function weatherAvailableForStage(stage) {
  const date = stageDateIso(stage);
  const daysUntil = daysUntilIsoDate(date);
  return daysUntil !== null && daysUntil >= 0 && daysUntil < OPEN_METEO_MAX_FORECAST_DAYS;
}

function weatherUrl(place, stage) {
  const date = stageDateIso(stage);
  const params = new URLSearchParams({
    latitude: place.coordinates.lat,
    longitude: place.coordinates.lng,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    start_date: date,
    end_date: date,
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function renderWeatherWidget(stage, lodging, selector = "#weather-card") {
  const weatherEl = document.querySelector(selector);
  if (!weatherEl) return;

  if (!lodging || !stageDateIso(stage)) {
    weatherEl.innerHTML = `
      <h3>Weather</h3>
      <p>Forecast unavailable until lodging/date are set.</p>
    `;
    return;
  }

  if (!weatherAvailableForStage(stage)) {
    weatherEl.innerHTML = `
      <h3>Weather</h3>
      <p>Forecast not available yet for this date. Open-Meteo opens daily forecasts within 16 days of travel.</p>
    `;
    return;
  }

  const requestId = String(Date.now() + Math.random());
  weatherEl.dataset.weatherRequestId = requestId;
  weatherEl.innerHTML = `
    <h3>Weather</h3>
    <p>Loading ${escapeHtml(stage.base)} forecast...</p>
  `;

  try {
    const response = await fetch(weatherUrl(lodging, stage));
    if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
    const forecast = await response.json();
    if (weatherEl.dataset.weatherRequestId !== requestId) return;

    const daily = forecast.daily || {};
    const code = daily.weather_code?.[0];
    const high = daily.temperature_2m_max?.[0];
    const low = daily.temperature_2m_min?.[0];
    const rain = daily.precipitation_probability_max?.[0];
    const wind = daily.wind_speed_10m_max?.[0];

    if (high === undefined || low === undefined) {
      throw new Error("Forecast outside available range");
    }

    weatherEl.innerHTML = `
      <h3>Weather</h3>
      <div class="weather-summary">
        <strong>${escapeHtml(weatherDescription(code))}</strong>
        <span>${Math.round(low)}-${Math.round(high)}°F</span>
      </div>
      <div class="weather-metrics">
        <span>Rain ${fieldValue(rain, "%")}</span>
        <span>Wind ${fieldValue(wind, " mph")}</span>
      </div>
      <p class="weather-note">Live forecast for lodging area when available.</p>
      ${renderActionLinks([{ label: "Detailed forecast", url: weatherUrl(lodging, stage) }])}
    `;
  } catch (error) {
    if (weatherEl.dataset.weatherRequestId !== requestId) return;
    weatherEl.innerHTML = `
      <h3>Weather</h3>
      <p>Forecast not available yet for this lodging/date.</p>
    `;
  }
}

function renderPlaceCard(place) {
  const option = optionForPlace(place);

  return `
    <article class="place-card">
      <div class="card-topline">
        <div>
          <h3>${place.name}</h3>
          <p class="meta-line">${placeContextLabel(place)}</p>
        </div>
        <span class="score-pill">${place.confidence}</span>
      </div>
      <p class="meta-line">${renderRichText(place.summary)}</p>
      ${renderPlaceFacts(place)}
      ${option ? renderLogisticsDigest(option) : ""}
      ${option ? renderResearchDigest(option) : ""}
      <div class="tag-list">
        ${place.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
      ${renderActionLinks(mapActionLinks(place))}
      ${renderSourceList(place)}
    </article>
  `;
}

function coordinatePrecision(value) {
  const stringValue = String(value ?? "");
  if (!stringValue.includes(".")) return 0;
  return stringValue.split(".")[1].length;
}

function placePrecisionLabel(place) {
  const latPrecision = coordinatePrecision(place.coordinateText?.lat ?? place.coordinates?.lat);
  const lngPrecision = coordinatePrecision(place.coordinateText?.lng ?? place.coordinates?.lng);
  const precision = Math.min(latPrecision, lngPrecision);

  if (precision >= 5) return "High";
  if (precision === 4) return "Good";
  if (precision === 3) return "Coarse";
  return "Approx";
}

function placeTypeLabel(type) {
  return String(type || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderPlacesView() {
  const placeTypes = [...new Set(data.places.map((place) => place.type).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const filteredPlaces = data.places.filter(
    (place) => state.placesTypeFilter === "all" || place.type === state.placesTypeFilter,
  );
  const places = [...filteredPlaces].sort((a, b) => {
    const stageDelta = firstStageIndex(a) - firstStageIndex(b);
    if (stageDelta !== 0) return stageDelta;

    const typeDelta = String(a.type).localeCompare(String(b.type));
    if (typeDelta !== 0) return typeDelta;

    return String(a.name).localeCompare(String(b.name));
  });

  els.places.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Places</h2>
        <p>All mapped places across the trip, including coordinate precision so we can spot entries that may need a tighter pin.</p>
      </div>
      <span class="score-pill">${places.length}${places.length === data.places.length ? "" : ` / ${data.places.length}`} places</span>
    </div>
    <div class="activity-controls-row places-controls-row">
      <div class="activity-day-control places-filter-control">
        <label class="field-label" for="places-type-filter">Type filter</label>
        <select id="places-type-filter">
          <option value="all"${state.placesTypeFilter === "all" ? " selected" : ""}>All types</option>
          ${placeTypes
            .map((type) => `<option value="${escapeAttribute(type)}"${state.placesTypeFilter === type ? " selected" : ""}>${escapeHtml(placeTypeLabel(type))}</option>`)
            .join("")}
        </select>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Place</th>
            <th>Type</th>
            <th>Coordinates</th>
            <th>Precision</th>
            <th>Status</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          ${places.map(renderPlacesTableRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPlacesTableRow(place) {
  const coordinatesLabel = `${place.coordinateText?.lat ?? place.coordinates.lat}, ${place.coordinateText?.lng ?? place.coordinates.lng}`;

  return `
    <tr>
      <td>
        <button class="table-link-button" type="button" data-select-stage="${escapeAttribute(place.stageId)}" data-jump-view="day">
          ${escapeHtml(stageLabel(place.stageId))}
        </button>
      </td>
      <td>
        <strong>${escapeHtml(place.name)}</strong>
        <span>${renderRichText(place.summary || "Place details TBD.")}</span>
      </td>
      <td>${escapeHtml(placeTypeLabel(place.type))}</td>
      <td>${escapeHtml(coordinatesLabel)}</td>
      <td>${escapeHtml(place.mapPrecision || placePrecisionLabel(place))}</td>
      <td><span class="table-status">${escapeHtml(place.status || "candidate")}</span></td>
      <td>${renderActionLinks(mapActionLinks(place).slice(0, 2))}</td>
    </tr>
  `;
}

function renderCompare() {
  const compareStages = stageViewStages();
  const stage = compareStages.find((item) => item.id === state.selectedStageId) || compareStages[0] || selectedStage();
  const lodging = stagePlaces(stage.id).filter((place) => place.type === "lodging");
  const stageViewActivity = stageActivities(stage).find((activity) => activity.type === "stage-viewing");
  const stageViewOptions = [...stageOptions(stage.id)].sort((a, b) => compareOptionRank(a) - compareOptionRank(b));
  const selectedOption = stageViewActivity ? selectedOptionForActivity(stageViewActivity) : null;
  const visibleOptions = state.hideCompareLowPriority
    ? stageViewOptions.filter((option) => !["candidate", "rejected"].includes(option.status))
    : stageViewOptions;
  const visibleSelectedOption =
    selectedOption && visibleOptions.some((option) => option.id === selectedOption.id) ? selectedOption : visibleOptions[0] || null;
  const alternativeOptions = visibleSelectedOption
    ? visibleOptions.filter((option) => option.id !== visibleSelectedOption.id)
    : visibleOptions;

  els.compare.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Stage Views</h2>
        <p>Official route materials, stage timing, and the best current viewing options for this race day.</p>
      </div>
    </div>
    <div class="activity-controls-row">
      <div class="activity-day-control">
        <label class="field-label" for="activity-stage-select">Selected stage</label>
        <select id="activity-stage-select">
          ${compareStages
            .map((day) => {
              const selected = day.id === stage.id ? "selected" : "";
              return `<option value="${escapeAttribute(day.id)}" ${selected}>${escapeHtml(day.dateLabel)} · ${escapeHtml(day.title)}</option>`;
            })
            .join("")}
        </select>
      </div>
      <label class="toggle-row activity-filter-toggle">
        <span>Hide candidate and rejected</span>
        <input id="compare-hide-low-priority" type="checkbox" ${state.hideCompareLowPriority ? "checked" : ""} />
      </label>
    </div>
    ${renderStageFacts(stage)}
    ${stageViewActivity ? renderStageViewSection(stageViewActivity, visibleSelectedOption, alternativeOptions) : `<p class="meta-line">No stage viewing options are loaded for this day yet.</p>`}
  `;

  renderWeatherWidget(stage, lodging[0], "#compare-weather-card");
}

function renderStageViewSection(activity, selectedOption, alternativeOptions) {
  return `
    <section class="activity-section">
      ${
        selectedOption || alternativeOptions.length
          ? `
            <div class="activity-option-group">
              ${selectedOption ? renderOptionCard(selectedOption) : `<p class="meta-line">No preferred viewing option has been picked yet.</p>`}
            </div>
            ${
              alternativeOptions.length
                ? `<div class="activity-option-group">
                    <div class="section-subheader">
                      <h3>Other Viewing Options</h3>
                    </div>
                    <div class="card-grid">
                      ${alternativeOptions.map(renderOptionCard).join("")}
                    </div>
                  </div>`
                : ""
            }
          `
          : `<p class="meta-line">No viewing options are loaded for this stage yet.</p>`
      }
    </section>
  `;
}

function renderLodgingView() {
  const lodging = [...(data.lodging || data.places.filter((place) => place.type === "lodging"))].sort(
    (a, b) => firstStageIndex(a) - firstStageIndex(b),
  );

  els.lodging.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Lodging</h2>
        <p>All overnight bases and stay notes, ordered by stay.</p>
      </div>
      <span class="score-pill">${lodging.length} stays</span>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Lodging</th>
            <th>Stay</th>
            <th>Base</th>
            <th>Precision</th>
            <th>Status</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          ${lodging.map(renderLodgingTableRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLodgingTableRow(place) {
  const stageIds = place.stageIds || [place.stageId].filter(Boolean);
  const firstStage = stageById(stageIds[0]);

  return `
    <tr>
      <td>
        <div class="table-day-links">
          ${stageIds
            .map(
              (stageId) => `
                <button class="table-link-button" type="button" data-select-stage="${escapeAttribute(stageId)}" data-jump-view="day">
                  ${escapeHtml(stageLabel(stageId))}
                </button>
              `,
            )
            .join("")}
        </div>
      </td>
      <td>
        <strong>${escapeHtml(place.name)}</strong>
        <span>${renderRichText(place.summary || "Lodging details TBD.")}</span>
      </td>
      <td>${escapeHtml(fieldValue(place.stayLabel))}</td>
      <td>${escapeHtml(firstStage?.base || "TBD")}</td>
      <td>${escapeHtml(fieldValue(place.mapPrecision))}</td>
      <td><span class="table-status">${place.confirmed ? "confirmed" : "unconfirmed"}</span></td>
      <td>${renderActionLinks([{ label: "Map", url: googleMapsUrl(place) }, ...resourceLinks(place).slice(0, 1)])}</td>
    </tr>
  `;
}

function firstStageIndex(place) {
  const stageId = (place.stageIds || [place.stageId]).find(Boolean);
  return data.itinerary.findIndex((stage) => stage.id === stageId);
}

function renderTransitView() {
  const transit = [...(data.transit || [])].sort(
    (a, b) =>
      data.itinerary.findIndex((stage) => stage.id === a.stageId) - data.itinerary.findIndex((stage) => stage.id === b.stageId),
  );

  els.transit.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Transit</h2>
        <p>Point-to-point moves from the transit CSV, grouped into the itinerary by day.</p>
      </div>
      <span class="score-pill">${transit.length} moves</span>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Move</th>
            <th>Route</th>
            <th>Method</th>
            <th>Status</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          ${transit.map(renderTransitTableRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTransitTableRow(transit) {
  const route = transitRouteLabel(transit);

  return `
    <tr>
      <td>
        <button class="table-link-button" type="button" data-select-stage="${escapeAttribute(transit.stageId)}" data-jump-view="day">
          ${escapeHtml(stageLabel(transit.stageId))}
        </button>
      </td>
      <td>${escapeHtml(activityTiming(transit))}</td>
      <td>
        <strong>${escapeHtml(transit.name)}</strong>
        <span>${renderRichText(transit.summary || "Transit details TBD.")}</span>
      </td>
      <td>${escapeHtml(route || "TBD")}</td>
      <td>${escapeHtml(fieldValue(transit.method))}</td>
      <td><span class="table-status">${escapeHtml(transit.status || "planned")}</span></td>
      <td>${resourceLinks(transit).length ? renderActionLinks(resourceLinks(transit)) : ""}</td>
    </tr>
  `;
}

function renderActivitiesView() {
  const activities = data.itinerary
    .flatMap((stage) => stageActivities(stage))
    .filter((activity) => activity.type !== "transit")
    .sort((a, b) => data.itinerary.findIndex((stage) => stage.id === a.stageId) - data.itinerary.findIndex((stage) => stage.id === b.stageId));

  els.activities.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Activities</h2>
        <p>Non-transit itinerary items and race-viewing activities, ordered by trip day.</p>
      </div>
      <span class="score-pill">${activities.length} items</span>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Activity</th>
            <th>Type</th>
            <th>Status</th>
            <th>Options</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${activities.map(renderActivityTableRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderActivityTableRow(activity) {
  const options = optionsForActivity(activity);

  return `
    <tr>
      <td>
        <button class="table-link-button" type="button" data-select-stage="${escapeAttribute(activity.stageId)}" data-jump-view="day">
          ${escapeHtml(stageLabel(activity.stageId))}
        </button>
      </td>
      <td>${escapeHtml(activityTiming(activity))}</td>
      <td>
        <strong>${escapeHtml(activity.name)}</strong>
        <span>${renderRichText(activity.summary || "Activity details TBD.")}</span>
      </td>
      <td>${escapeHtml(fieldValue(activity.type))}</td>
      <td><span class="table-status">${escapeHtml(activity.status || "planned")}</span></td>
      <td>${options.length}</td>
      <td>
        ${
          options.length
            ? `<button class="secondary-button" type="button" data-select-stage="${escapeAttribute(activity.stageId)}" data-jump-view="compare">Compare</button>`
            : activityMapsUrl(activity)
              ? renderActionLinks([{ label: "Map", url: activityMapsUrl(activity) }])
              : ""
        }
      </td>
    </tr>
  `;
}

function renderOptionDigest(option) {
  const logistics = option.logistics || {};
  const research = option.research || {};
  const fields = [
    ["Distance from lodging", logistics.distanceFromBase],
    ["Caravan time", option.caravanTime],
    ["Race time", option.raceTime],
    ["Best access", logistics.access],
    ["Bike usefulness", logistics.bikeUsefulness],
    ["Race viewing", research.raceViewingQuality],
    ["Crowding", research.crowding],
    ["Amenities", research.amenities],
    ["Road closures", research.roadClosureRisk],
    ["Exit", research.exitStrategy],
    ["Check-in/luggage", research.checkInLuggage],
    ["Catch-all", research.notes],
    ["Research confidence", option.confidence],
  ].filter(([, value]) => value);

  return `
    <dl class="research-digest">
      ${fields
        .map(
          ([label, value]) => `
            <div>
              <dt>${label}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderOptionCard(option) {
  const places = relatedPlaces(option);
  const placeLinks = places.map((place) => ({
    label: `${place.name} map`,
    url: googleMapsUrl(place),
  }));
  const links = [...resourceLinks(option), ...placeLinks];

  return `
    <article class="option-card">
      <div class="card-topline">
        <div>
          <h3>${option.name}</h3>
          <p class="meta-line">${option.vibe}</p>
        </div>
        <span class="score-pill">${option.status}</span>
      </div>
      ${option.research?.overview ? `<p class="meta-line">${renderRichText(option.research.overview)}</p>` : ""}
      ${renderOptionDigest(option)}
      ${renderActionLinks(links)}
    </article>
  `;
}

function renderIntake() {
  els.intake.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Research Intake Contract</h2>
        <p>Agents should add one sourced candidate per file under <strong>trip-data/research-inbox</strong>, then curated entries can move into canonical data.</p>
      </div>
    </div>
    <div class="intake-layout">
      <section class="schema-block">
        <h3>Required Fields</h3>
        <ul class="compact-list">
          <li>type, name, stageId, coordinates</li>
          <li>summary, pros, cons, logistics</li>
          <li>tags, status, confidence</li>
          <li>sources and open_questions</li>
        </ul>
      </section>
      <pre>${escapeHtml(JSON.stringify(data.researchTemplate, null, 2))}</pre>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeLinkUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(String(value), window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderRichText(value) {
  const text = String(value ?? "");
  const linkPattern = /https?:\/\/[^\s<]+/g;
  let lastIndex = 0;
  let html = "";
  let match;

  while ((match = linkPattern.exec(text))) {
    const rawUrl = match[0];
    const before = text.slice(lastIndex, match.index);
    const safeUrl = normalizeLinkUrl(rawUrl.trim());

    html += escapeHtml(before).replaceAll("\n", "<br>");
    html += safeUrl
      ? `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(rawUrl)}</a>`
      : escapeHtml(rawUrl).replaceAll("\n", "<br>");

    lastIndex = match.index + rawUrl.length;
  }

  html += escapeHtml(text.slice(lastIndex)).replaceAll("\n", "<br>");
  return html;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function normalizeStateForActiveView() {
  if (state.activeView !== "compare") return;

  const compareStages = stageViewStages();
  if (compareStages.length && !compareStages.some((stage) => stage.id === state.selectedStageId)) {
    state.selectedStageId = compareStages[0].id;
    if (els.stageSelect) els.stageSelect.value = state.selectedStageId;
  }
}

function renderView() {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.activeView));
  els.views.forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${state.activeView}-view`).classList.add("active");
  els.workspace.classList.toggle("workspace--day", state.activeView === "day");
  els.workspace.classList.toggle("workspace--no-map", ["places", "lodging", "transit", "activities", "intake"].includes(state.activeView));

  renderOverview();
  renderDay();
  renderCompare();
  renderPlacesView();
  renderLodgingView();
  renderTransitView();
  renderActivitiesView();
  renderIntake();
}

function renderAll() {
  normalizeStateForActiveView();
  renderStageSummary();
  renderMap();
  renderView();
}

els.stageSelect.addEventListener("change", (event) => {
  updateNavigation({ selectedStageId: event.target.value });
});

els.layerList.addEventListener("change", (event) => {
  const key = event.target.dataset.layer;
  if (!key) return;
  state.layers[key] = event.target.checked;
  renderAll();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "activity-stage-select") {
    updateNavigation({ selectedStageId: event.target.value }, { refreshMap: true, fitMap: true });
    return;
  }

  if (event.target.id === "compare-hide-low-priority") {
    updateNavigation({ hideCompareLowPriority: event.target.checked });
    return;
  }

  if (event.target.id === "places-type-filter") {
    updateNavigation({ placesTypeFilter: event.target.value }, { replaceUrl: true });
  }
});

els.resetMap.addEventListener("click", () => {
  refreshMapLayout();
  fitMapToCurrentBounds();
});

document.addEventListener("click", (event) => {
  const jumpButton = event.target.closest("[data-jump-view]");
  if (jumpButton) {
    updateNavigation(
      {
        selectedStageId: jumpButton.dataset.selectStage || state.selectedStageId,
        activeView: jumpButton.dataset.jumpView,
      },
      { refreshMap: true, fitMap: true },
    );
    return;
  }

  const imageButton = event.target.closest("[data-full-image]");
  if (imageButton) {
    openImageLightbox(imageButton.dataset.fullImage, imageButton.dataset.fullImageLabel);
    return;
  }

  if (event.target.closest("[data-close-image-lightbox]")) {
    closeImageLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && imageLightbox.classList.contains("is-open")) {
    closeImageLightbox();
  }

  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".overview-card")) {
    event.preventDefault();
    event.target.click();
  }
});

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    updateNavigation({ activeView: tab.dataset.view }, { refreshMap: true });
  });
});

Object.assign(state, stateFromUrl());
renderStageSelect();
renderLayerControls();
applyUrlState({ replace: true, rerenderMap: true, refreshMap: true, fitMap: true });

scheduleMapRefresh({ fit: true });
window.addEventListener("resize", () => scheduleMapRefresh());
window.addEventListener("popstate", () => {
  applyUrlState({ rerenderMap: true, refreshMap: true, fitMap: true });
});

if (document.readyState === "complete") {
  window.setTimeout(addBaseTiles, 100);
} else {
  window.addEventListener("load", () => {
    window.setTimeout(addBaseTiles, 100);
  });
}
