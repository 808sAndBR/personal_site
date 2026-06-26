function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = "";
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function loadText(path) {
  const request = new XMLHttpRequest();
  request.open("GET", path, false);
  request.send(null);

  if (request.status !== 200 && request.status !== 0) {
    throw new Error("Could not load " + path + ": " + request.status);
  }

  return request.responseText;
}

function loadCsv(path) {
  return parseCsv(loadText(path));
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "[]") return [];
  if (trimmed.startsWith('"') || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  let index = 0;

  function indentOf(line) {
    return line.match(/^ */)[0].length;
  }

  function isSkippable(line) {
    const trimmed = line.trim();
    return !trimmed || trimmed.startsWith("#");
  }

  function skipSkippable() {
    while (index < lines.length && isSkippable(lines[index])) {
      index += 1;
    }
  }

  function parseBlockScalar(indent, mode = "literal") {
    const blockLines = [];

    while (index < lines.length) {
      const line = lines[index];
      const currentIndent = indentOf(line);

      if (!line.trim()) {
        blockLines.push("");
        index += 1;
        continue;
      }

      if (currentIndent < indent) break;
      blockLines.push(line.slice(indent));
      index += 1;
    }

    if (mode === "folded") {
      const paragraphs = [];
      let current = [];

      blockLines.forEach((line) => {
        if (line === "") {
          if (current.length) {
            paragraphs.push(current.join(" "));
            current = [];
          }
          paragraphs.push("");
          return;
        }
        current.push(line);
      });

      if (current.length) {
        paragraphs.push(current.join(" "));
      }

      return paragraphs.join("\n").replace(/\n{3,}/g, "\n\n");
    }

    return blockLines.join("\n");
  }

  function parseBlock(indent) {
    skipSkippable();
    if (index >= lines.length) return {};
    return lines[index].slice(indent).startsWith("-") ? parseArray(indent) : parseObject(indent);
  }

  function parseObject(indent) {
    const object = {};

    while (index < lines.length) {
      if (isSkippable(lines[index])) {
        index += 1;
        continue;
      }

      const line = lines[index];
      const currentIndent = indentOf(line);
      const trimmed = line.trim();
      if (currentIndent < indent || trimmed.startsWith("-")) break;
      if (currentIndent > indent) {
        index += 1;
        continue;
      }

      const separatorIndex = trimmed.indexOf(":");
      const key = trimmed.slice(0, separatorIndex);
      const value = trimmed.slice(separatorIndex + 1).trim();
      index += 1;

      if (value === "|") {
        object[key] = parseBlockScalar(indent + 2, "literal");
      } else if (value === ">") {
        object[key] = parseBlockScalar(indent + 2, "folded");
      } else {
        object[key] = value ? parseYamlScalar(value) : parseBlock(indent + 2);
      }
    }

    return object;
  }

  function parseArray(indent) {
    const array = [];

    while (index < lines.length) {
      if (isSkippable(lines[index])) {
        index += 1;
        continue;
      }

      const line = lines[index];
      const currentIndent = indentOf(line);
      const trimmed = line.trim();
      if (currentIndent < indent || !trimmed.startsWith("-")) break;
      if (currentIndent > indent) {
        index += 1;
        continue;
      }

      const value = trimmed.slice(1).trim();
      index += 1;
      if (!value) {
        array.push(parseBlock(indent + 2));
        continue;
      }

      const separatorIndex = value.indexOf(":");
      const looksLikeObjectEntry =
        separatorIndex > 0 && !value.startsWith('"') && !value.startsWith("[") && !value.startsWith("{");

      if (looksLikeObjectEntry) {
        const key = value.slice(0, separatorIndex).trim();
        const rawValue = value.slice(separatorIndex + 1).trim();
        const item = {};

        if (rawValue === "|") {
          item[key] = parseBlockScalar(indent + 4, "literal");
        } else if (rawValue === ">") {
          item[key] = parseBlockScalar(indent + 4, "folded");
        } else if (rawValue) {
          item[key] = parseYamlScalar(rawValue);
        } else {
          item[key] = parseBlock(indent + 4);
        }

        while (index < lines.length) {
          if (isSkippable(lines[index])) {
            index += 1;
            continue;
          }

          const nextLine = lines[index];
          const nextIndent = indentOf(nextLine);
          const nextTrimmed = nextLine.trim();

          if (nextIndent < indent + 2 || nextTrimmed.startsWith("-")) break;
          if (nextIndent > indent + 2) {
            index += 1;
            continue;
          }

          const nextSeparatorIndex = nextTrimmed.indexOf(":");
          const nextKey = nextTrimmed.slice(0, nextSeparatorIndex);
          const nextValue = nextTrimmed.slice(nextSeparatorIndex + 1).trim();
          index += 1;

          if (nextValue === "|") {
            item[nextKey] = parseBlockScalar(indent + 4, "literal");
          } else if (nextValue === ">") {
            item[nextKey] = parseBlockScalar(indent + 4, "folded");
          } else {
            item[nextKey] = nextValue ? parseYamlScalar(nextValue) : parseBlock(indent + 4);
          }
        }

        array.push(item);
        continue;
      }

      array.push(parseYamlScalar(value));
    }

    return array;
  }

  return parseBlock(0);
}

function listFromCell(value) {
  return value ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];
}

function numberFromCell(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

function yesNo(value) {
  return ["yes", "true", "y", "1", "confirmed"].includes(String(value).trim().toLowerCase());
}

function slugFromParts(parts) {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function itineraryIdFromDay(value) {
  const day = String(value || "").trim();
  if (!day) return "";
  const legacyStageDays = {
    "stage-1-jul-04": "trip-jul-04",
    "stage-2-jul-05": "trip-jul-05",
    "stage-3-jul-06": "trip-jul-06",
    "stage-6-jul-09": "trip-jul-09",
    "stage-7-jul-10": "trip-jul-10",
  };
  if (legacyStageDays[day]) return legacyStageDays[day];
  if (day.startsWith("trip-")) return day;

  const match = day.match(/^2026-07-(\d{2})$/);
  if (!match) return day;

  const dayNumber = match[1];
  const stageDays = {
    "04": "trip-jul-04",
    "05": "trip-jul-05",
    "06": "trip-jul-06",
    "09": "trip-jul-09",
    "10": "trip-jul-10",
  };

  return stageDays[dayNumber] || `trip-jul-${dayNumber}`;
}

const viewingOptionFiles = parseYaml(loadText("./trip-data/input/viewing-options/index.yaml"));

const viewingOptionRows = viewingOptionFiles.map((file) => parseYaml(loadText(`./trip-data/input/viewing-options/${file}`))).map((row) => ({
  ...row,
  coordinates: { lat: numberFromCell(row.lat), lng: numberFromCell(row.lng) },
  sources: Array.isArray(row.sources) ? row.sources : listFromCell(row.sources),
}));

function viewingStatus(row) {
  if (row.status) return String(row.status).trim().toLowerCase();
  const priority = row.priority.toLowerCase();
  if (priority.includes("top")) return "shortlisted";
  if (priority.includes("best")) return "shortlisted";
  if (priority.includes("avoid")) return "rejected";
  return "candidate";
}

function viewingConfidence(row) {
  const priority = row.priority.toLowerCase();
  if (priority.includes("top") || priority.includes("best")) return "high";
  if (priority.includes("depends") || priority.includes("avoid")) return "low";
  return "medium";
}

function sourceLabel(url) {
  if (url.includes("follow-the-publicity-caravan")) return "Official publicity caravan page";
  if (url.includes("bordeaux-tourism")) return "Bordeaux Tourism Tour de France 2026 page";
  const stageMatch = url.match(/stage-(\d+)/);
  return stageMatch ? `Official Stage ${stageMatch[1]} page` : "Research source";
}

function isDistinctViewingResource(url) {
  return !url.includes("letour.fr/en/stage-") && !url.includes("letour.fr/en/follow-the-publicity-caravan");
}

function sourceResources(row) {
  return row.sources
    .filter(isDistinctViewingResource)
    .map((url) => ({
      label: sourceLabel(url),
      url,
      note: "Distinct source from viewing options research workbook",
    }));
}

function viewingTags(row) {
  return [
    row.stageId.replace("-jul-", "-"),
    row.priority.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  ];
}

function placeFromViewingRow(row) {
  const status = viewingStatus(row);
  return {
    id: row.id,
    stageId: row.stageId,
    type: "viewing_spot",
    name: row.name,
    status,
    confidence: viewingConfidence(row),
    coordinates: row.coordinates,
    estimatedPassageTime: row.raceTime,
    caravanTime: row.caravanTime,
    elevationMeters: null,
    overview: row.overview,
    summary: row.overview || row.viewingQuality,
    tags: viewingTags(row),
    resources: sourceResources(row),
  };
}

const lodgingRows = loadCsv("./trip-data/input/lodging.csv").map((row) => ({
  ...row,
  stageIds: listFromCell(row.stageIds || row.stageId),
  confirmed: yesNo(row.confirmed),
  coordinates: { lat: numberFromCell(row.lat), lng: numberFromCell(row.lng) },
  tags: listFromCell(row.tags),
}));

function placeFromLodgingRow(row) {
  const directLink = row.overview && row.overview.startsWith("http") ? row.overview : "";

  return {
    id: row.id,
    lodgingId: row.lodgingId || row.id,
    stageId: row.stageId,
    stageIds: row.stageIds,
    type: "lodging",
    name: row.name,
    status: "selected",
    confidence: row.mapPrecision.toLowerCase().includes("approximate") ? "medium" : "high",
    coordinates: row.coordinates,
    estimatedPassageTime: null,
    caravanTime: null,
    elevationMeters: null,
    overview: directLink ? "" : row.overview,
    summary: directLink ? row.summary : row.overview || row.summary,
    confirmed: row.confirmed,
    stayLabel: row.stayLabel,
    mapPrecision: row.mapPrecision,
    tags: row.tags,
    resources: [
      directLink
        ? {
            label: "Open lodging link",
            url: directLink,
            note: "Direct lodging or map reference",
          }
        : null,
      {
        label: "Open lodging search",
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name)}`,
        note: "Use to verify the exact lodging pin/address",
      },
    ].filter(Boolean),
  };
}

const lodgingStays = lodgingRows.map(placeFromLodgingRow);
const lodgingPlaces = lodgingRows.flatMap((row) =>
  row.stageIds.map((stageId) =>
    placeFromLodgingRow({
      ...row,
      id: `${row.id}-${stageId}`,
      lodgingId: row.id,
      stageId,
    }),
  ),
);

const placeRows = loadCsv("./trip-data/input/places.csv").map((row) => ({
  ...row,
  stageIds: listFromCell(row.stageIds || row.stageId),
  coordinates: { lat: numberFromCell(row.lat), lng: numberFromCell(row.lng) },
  tags: listFromCell(row.tags),
}));

function resourcesFromPlaceRow(row) {
  return row.googleMapsUrl
    ? [
        {
          label: "Open in Google Maps",
          url: row.googleMapsUrl,
          note: "Direct place link",
        },
      ]
    : [];
}

function placeFromPlaceRow(row) {
  return {
    id: row.id,
    stageId: row.stageId,
    stageIds: row.stageIds,
    type: row.type || "general_place",
    name: row.name,
    status: row.status || "candidate",
    confidence: row.confidence || "medium",
    coordinates: row.coordinates,
    estimatedPassageTime: null,
    caravanTime: null,
    elevationMeters: null,
    overview: row.description || "",
    summary: row.summary || row.description || "",
    tags: row.tags,
    googleMapsUrl: row.googleMapsUrl || "",
    resources: resourcesFromPlaceRow(row),
  };
}

const standalonePlaces = placeRows.flatMap((row) =>
  row.stageIds.map((stageId) =>
    placeFromPlaceRow({
      ...row,
      id: `${row.id}-${stageId}`,
      sourceId: row.id,
      stageId,
    }),
  ),
);

function optionFromViewingRow(row) {
  return {
    id: `watch-${row.id}`,
    stageId: row.stageId,
    name: row.name,
    status: viewingStatus(row),
    vibe: row.priority,
    confidence: viewingConfidence(row),
    caravanTime: row.caravanTime,
    raceTime: row.raceTime,
    pros: [row.viewingQuality, row.amenities, row.exitStrategy],
    cons: [row.crowding, row.roadClosureRisk],
    research: {
      overview: row.overview,
      raceViewingQuality: row.viewingQuality,
      crowding: row.crowding,
      amenities: row.amenities,
      roadClosureRisk: row.roadClosureRisk,
      exitStrategy: row.exitStrategy,
      checkInLuggage: row.luggage,
      notes: row.notes,
    },
    logistics: {
      distanceFromBase: row.distanceFromBase,
      access: row.access,
      bikeUsefulness: row.bikeUsefulness,
      publicityCaravan: row.publicityCaravan,
      luggage: row.luggage,
      notes: row.notes,
    },
    relatedPlaceIds: [row.id],
    resources: sourceResources(row),
  };
}

function transitResources(row) {
  if (!row.link) return [];

  if (typeof row.link === "string") {
    return [
      {
        label: "Map",
        url: row.link,
        note: `${row.method || "Transit"} directions from ${row.start || "start"} to ${row.end || "end"}`,
      },
    ];
  }

  if (typeof row.link === "object") {
    return Object.entries(row.link)
      .filter(([, url]) => Boolean(url))
      .map(([label, url]) => ({
        label,
        url,
        note: `${row.method || "Transit"} link for ${row.start || "start"} to ${row.end || "end"}`,
      }));
  }

  return [];
}

const transitGroups = parseYaml(loadText("./trip-data/input/transit.yaml"));
const transitRows = Object.entries(transitGroups)
  .flatMap(([stageId, items]) =>
    (Array.isArray(items) ? items : []).map((row) => ({
      ...row,
      day: row.day || stageId,
    })),
  )
  .filter((row) => row.name || row.day || row.start || row.end)
  .map((row) => {
    const stageId = itineraryIdFromDay(row.day);
    const transitId = row.id || slugFromParts(["transit", stageId, row.start, row.end]);

    return {
      ...row,
      id: transitId,
      sourceId: row.id,
      stageId,
      type: "transit",
      summary: row.overview,
      status: yesNo(row.confirmed) ? "confirmed" : "planned",
      startTime: row.time,
      endTime: "",
      resources: transitResources(row),
    };
  });

function normalizeItineraryDay(row) {
  const existingRaceInfo = row.raceInfo && typeof row.raceInfo === "object" ? row.raceInfo : {};
  const startTime = existingRaceInfo.startTime || row.startTime || row.raceStartTime || "";
  const endTime = existingRaceInfo.endTime || row.endTime || row.estimatedFinishTime || "";
  const route = existingRaceInfo.route || row.route || row.stageRoute || [];
  const officialUrl = existingRaceInfo.officialUrl || row.officialUrl || row.officialStageUrl || "";
  const routeMap = existingRaceInfo.routeMap || row.routeMap || null;
  const elevationProfile = existingRaceInfo.elevationProfile || row.elevationProfile || null;
  const officialRoute = existingRaceInfo.officialRoute || row.officialRoute || null;
  const hasRaceInfo = Boolean(startTime || endTime || officialUrl || route.length || routeMap || elevationProfile || officialRoute);
  const raceInfo = hasRaceInfo
    ? {
        ...(existingRaceInfo || {}),
        startTime,
        endTime,
        officialUrl,
        route,
        routeMap,
        elevationProfile,
        officialRoute,
      }
    : null;

  return {
    ...row,
    ...(raceInfo ? { raceInfo } : {}),
  };
}

const itineraryDayFiles = [
  "trip-jul-01.yaml",
  "trip-jul-02.yaml",
  "trip-jul-03.yaml",
  "trip-jul-04.yaml",
  "trip-jul-05.yaml",
  "trip-jul-06.yaml",
  "trip-jul-07.yaml",
  "trip-jul-08.yaml",
  "trip-jul-09.yaml",
  "trip-jul-10.yaml",
  "trip-jul-11.yaml",
  "trip-jul-12.yaml",
  "trip-jul-13.yaml",
  "trip-jul-14.yaml",
  "trip-jul-15.yaml",
  "trip-jul-16.yaml",
  "trip-jul-17.yaml",
  "trip-jul-18.yaml",
  "trip-jul-19.yaml"
];

const itineraryDays = itineraryDayFiles.map((file) =>
  normalizeItineraryDay(parseYaml(loadText(`./trip-data/input/itinerary/${file}`))),
);

const activityGroups = parseYaml(loadText("./trip-data/input/activities.yaml"));
const activityRows = Object.entries(activityGroups).flatMap(([stageId, activities]) =>
  (Array.isArray(activities) ? activities : []).map((row) => {
    const coordinates =
      row.coordinates && typeof row.coordinates === "object"
        ? {
            lat: row.coordinates.lat ?? null,
            lng: row.coordinates.lng ?? null,
          }
        : row.lat || row.lng
          ? {
              lat: numberFromCell(row.lat),
              lng: numberFromCell(row.lng),
            }
          : null;

    return {
      ...row,
      stageId: row.stageId || stageId,
      summary: row.overview || row.summary || "",
      optionIds: Array.isArray(row.optionIds) ? row.optionIds : listFromCell(row.optionIds),
      coordinates:
        coordinates && coordinates.lat !== null && coordinates.lng !== null
          ? {
              lat: Number(coordinates.lat),
              lng: Number(coordinates.lng),
            }
          : null,
      googleMapsUrl: row.googleMapsUrl || "",
    };
  }),
);

const mappedActivities = activityRows
  .filter((row) => row.coordinates && row.coordinates.lat !== null && row.coordinates.lng !== null)
  .map((row) => ({
    ...row,
    mapType: "activity",
  }));

window.TDF_TRIP_DATA = {
  itinerary: itineraryDays,
  places: [...viewingOptionRows.map(placeFromViewingRow), ...lodgingPlaces, ...standalonePlaces],
  lodging: lodgingStays,
  options: viewingOptionRows.map(optionFromViewingRow),
  activities: [...activityRows, ...transitRows],
  mappedActivities,
  transit: transitRows,
  researchTemplate: {
    type: "viewing_spot",
    name: "Candidate place name",
    stageId: "trip-jul-04",
    coordinates: { lat: 0, lng: 0 },
    estimatedPassageTime: "TBD",
    caravanTime: "TBD",
    elevationMeters: null,
    summary: "One-sentence planning value.",
    pros: ["Specific upside"],
    cons: ["Specific downside"],
    logistics: {
      parking: "Unknown",
      transit: "Unknown",
      walking_time_minutes: null,
      arrival_buffer_hours: null,
    },
    tags: ["needs-verification"],
    status: "candidate",
    confidence: "low",
    resources: [
      {
        label: "Official page, business website, map, or research note",
        url: "https://example.com",
        note: "What this source supports",
      },
    ],
    sources: [
      {
        title: "Source title",
        url: "https://example.com",
        note: "What this source supports",
      },
    ],
    open_questions: ["What should the next researcher verify?"],
  },
};
