import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./App.css";

import {
  ReactFlow,
  Background,
  Controls,
  useViewport,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

const PacketScreenOverlay = ({ position, active, status }) => {

  const { x, y, zoom } = useViewport();

  if (!position) {
    return null;
  }

  const screenX = position.x * zoom + x;
  const screenY = position.y * zoom + y;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${screenX}px`,
          top: `${screenY}px`,
          width: 38,
          height: 38,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#facc15",
          border: "3px solid #fef08a",
          color: "#111827",
          fontWeight: 900,
          fontSize: 17,
          boxSizing: "border-box",
          transform: "translate(-50%, -50%)",
          boxShadow: active
            ? "0 0 0 6px rgba(250, 204, 21, 0.16), 0 0 24px rgba(250, 204, 21, 0.85)"
            : "0 0 18px rgba(250, 204, 21, 0.65)",
          transition: "box-shadow 0.15s ease",
        }}
        aria-label={`Packet ${status}`}
      >
        P
      </div>
    </div>
  );
};

const API_BASE =
  "http://localhost:8080/api";

const NODE_WIDTH = 110;
const NODE_HEIGHT = 78;

const X_GAP = 230;
const Y_GAP = 150;

// =========================================================
// SIMULATED NETWORK HEALTH TELEMETRY
// =========================================================

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const stableHash = (text) => {
  let hash = 0;

  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const getHealthStatus = (score) => {
  if (score >= 85) {
    return "HEALTHY";
  }

  if (score >= 65) {
    return "WARNING";
  }

  return "CRITICAL";
};

const getHealthClass = (score) => {
  if (score >= 85) {
    return "health-good";
  }

  if (score >= 65) {
    return "health-warning";
  }

  return "health-critical";
};

const getSimulatedLinkTelemetry = (link, tick) => {

  if (!link.active) {
    return {
      latency: 0,
      packetLoss: 100,
      congestion: 100,
      availability: 0,
      health: 0,
      status: "CRITICAL",
      healthClass: "health-critical",
    };
  }

  const identity = `${link.source}-${link.destination}`;
  const hash = stableHash(identity);
  const phase = hash % 17;
  const wave =
    (Math.sin(tick * 0.85 + phase) + 1) / 2;

  const latency = Math.round(
    8 + Number(link.cost || 1) * 4 + (hash % 8) + wave * 6
  );

  const packetLoss = Number(
    (0.2 + (hash % 4) * 0.15 + wave * 0.45).toFixed(1)
  );

  const congestion = Math.round(
    15 + (hash % 30) + wave * 28
  );

  const availability = Number(
    (99.5 - wave * 1.2 - (hash % 3) * 0.1).toFixed(1)
  );

  const latencyScore = clamp(
    100 - Math.max(latency - 5, 0) * 1.7,
    0,
    100
  );

  const lossScore = clamp(
    100 - packetLoss * 12,
    0,
    100
  );

  const congestionScore =
    clamp(100 - congestion, 0, 100);

  const health = Math.round(
    availability * 0.25 +
    latencyScore * 0.2 +
    lossScore * 0.25 +
    congestionScore * 0.3
  );

  return {
    latency,
    packetLoss,
    congestion,
    availability,
    health,
    status: getHealthStatus(health),
    healthClass: getHealthClass(health),
  };
};

const getSimulatedRouterTelemetry = (
  router,
  links,
  linkTelemetryMap
) => {

  if (!router.active) {
    return {
      health: 0,
      status: "CRITICAL",
      healthClass: "health-critical",
      connectedLinks: 0,
    };
  }

  const connectedLinks = links.filter(
    (link) =>
      link.active &&
      (link.source === router.id ||
        link.destination === router.id)
  );

  if (connectedLinks.length === 0) {
    return {
      health: 0,
      status: "CRITICAL",
      healthClass: "health-critical",
      connectedLinks: 0,
    };
  }

  const totalHealth = connectedLinks.reduce(
    (sum, link) =>
      sum +
      (linkTelemetryMap[
        `${link.source}-${link.destination}`
      ]?.health || 0),
    0
  );

  const health = Math.round(
    totalHealth / connectedLinks.length
  );

  return {
    health,
    status: getHealthStatus(health),
    healthClass: getHealthClass(health),
    connectedLinks: connectedLinks.length,
  };
};

// =========================================================
// CLEAN NETWORK LAYOUT
// =========================================================

const getCleanLayout = (
  routers,
  links,
  sourceId,
  destinationId
) => {

  if (!routers.length) {
    return {};
  }

  const activeRouters =
    routers.filter(
      (router) => router.active
    );

  // ---------------------------------------------
  // Build adjacency map
  // ---------------------------------------------

  const adjacency = new Map();

  routers.forEach((router) => {
    adjacency.set(
      router.id,
      []
    );
  });

  links
    .filter((link) => link.active)
    .forEach((link) => {

      if (
        adjacency.has(link.source) &&
        adjacency.has(link.destination)
      ) {

        adjacency
          .get(link.source)
          .push(link.destination);

        adjacency
          .get(link.destination)
          .push(link.source);
      }
    });

  // ---------------------------------------------
  // Choose starting node
  // ---------------------------------------------

  const start =
    activeRouters.find(
      (router) =>
        router.id === sourceId
    )?.id ||
    activeRouters[0]?.id ||
    routers[0].id;

  // ---------------------------------------------
  // Breadth-first layering
  // ---------------------------------------------

  const levels = new Map();

  const queue = [start];

  levels.set(start, 0);

  while (queue.length > 0) {

    const current =
      queue.shift();

    const currentLevel =
      levels.get(current);

    const neighbors =
      adjacency.get(current) || [];

    neighbors.forEach(
      (neighbor) => {

        if (!levels.has(neighbor)) {

          levels.set(
            neighbor,
            currentLevel + 1
          );

          queue.push(neighbor);
        }
      }
    );
  }

  // ---------------------------------------------
  // Put unreachable nodes at the end
  // ---------------------------------------------

  let maxLevel = 0;

  levels.forEach(
    (level) => {

      if (level > maxLevel) {
        maxLevel = level;
      }

    }
  );

  routers.forEach((router) => {

    if (!levels.has(router.id)) {

      maxLevel += 1;

      levels.set(
        router.id,
        maxLevel
      );
    }
  });

  // ---------------------------------------------
  // Force destination toward the right
  // ---------------------------------------------

  if (
    destinationId &&
    levels.has(destinationId)
  ) {

    const destinationLevel =
      levels.get(destinationId);

    const otherLevels =
      [...levels.values()];

    const desiredLevel =
      Math.max(
        destinationLevel,
        maxLevel
      );

    levels.set(
      destinationId,
      desiredLevel
    );

    maxLevel =
      Math.max(
        maxLevel,
        desiredLevel
      );
  }

  // ---------------------------------------------
  // Group routers by level
  // ---------------------------------------------

  const grouped = new Map();

  routers.forEach((router) => {

    const level =
      levels.get(router.id) ?? 0;

    if (!grouped.has(level)) {
      grouped.set(level, []);
    }

    grouped
      .get(level)
      .push(router);
  });

  // ---------------------------------------------
  // Sort destination last in its level
  // ---------------------------------------------

  grouped.forEach((routerList) => {

    routerList.sort((a, b) => {

      if (
        a.id === destinationId
      ) {
        return 1;
      }

      if (
        b.id === destinationId
      ) {
        return -1;
      }

      return a.id.localeCompare(
        b.id
      );
    });

  });

  // ---------------------------------------------
  // Generate positions
  // ---------------------------------------------

  const positions = {};

  grouped.forEach(
    (routerList, level) => {

      const count =
        routerList.length;

      const totalHeight =
        (count - 1) * Y_GAP;

      const startY =
        300 -
        totalHeight / 2;

      routerList.forEach(
        (router, index) => {

          let x =
            120 +
            level * X_GAP;

          let y =
            startY +
            index * Y_GAP;

          // Source at far left
          if (
            router.id === sourceId
          ) {
            x = 80;
          }

          // Destination near right side
          if (
            router.id === destinationId
          ) {

            x =
              120 +
              Math.max(
                maxLevel,
                3
              ) * X_GAP;
          }

          positions[router.id] = {
            x,
            y,
          };
        }
      );
    }
  );

  return positions;
};

function appendNetworkEvent(setEvents, type, text) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toLocaleTimeString([], {
      hour12: false,
    }),
    type,
    text,
  };

  setEvents((previous) => [
    event,
    ...previous,
  ].slice(0, 12));
}


// =========================================================
// PURE ADAPTIVE ROUTE ANALYSIS (USED AFTER LIVE FAILURES)
// =========================================================
//
// This helper evaluates a supplied network snapshot rather than
// relying on React state that may not have updated yet. That makes
// post-failure recovery decisions deterministic and health-aware.
const getAdaptiveRouteAnalysisForNetwork = (
  networkSnapshot,
  startRouter,
  targetRouter,
  tick
) => {
  const activeRouterIds = new Set(
    networkSnapshot.routers
      .filter((router) => router.active)
      .map((router) => router.id)
  );

  if (
    !activeRouterIds.has(startRouter) ||
    !activeRouterIds.has(targetRouter)
  ) {
    return [];
  }

  const adjacency = {};
  activeRouterIds.forEach((routerId) => {
    adjacency[routerId] = [];
  });

  networkSnapshot.links.forEach((link) => {
    if (
      !link.active ||
      !activeRouterIds.has(link.source) ||
      !activeRouterIds.has(link.destination)
    ) {
      return;
    }

    adjacency[link.source].push(link.destination);
    adjacency[link.destination].push(link.source);
  });

  Object.values(adjacency).forEach((neighbors) => {
    neighbors.sort((a, b) => a.localeCompare(b));
  });

  const candidatePaths = [];
  const maximumRoutes = 60;
  const maximumDepth = activeRouterIds.size;

  const dfs = (currentRouter, path, visited) => {
    if (candidatePaths.length >= maximumRoutes) {
      return;
    }

    if (currentRouter === targetRouter) {
      candidatePaths.push(path.slice());
      return;
    }

    if (path.length >= maximumDepth) {
      return;
    }

    for (const neighbour of adjacency[currentRouter] || []) {
      if (visited.has(neighbour)) {
        continue;
      }

      visited.add(neighbour);
      path.push(neighbour);
      dfs(neighbour, path, visited);
      path.pop();
      visited.delete(neighbour);

      if (candidatePaths.length >= maximumRoutes) {
        return;
      }
    }
  };

  dfs(
    startRouter,
    [startRouter],
    new Set([startRouter])
  );

  if (candidatePaths.length === 0) {
    return [];
  }

  const telemetryMap = {};
  networkSnapshot.links.forEach((link) => {
    telemetryMap[
      `${link.source}-${link.destination}`
    ] = getSimulatedLinkTelemetry(link, tick);
  });

  const rawMetrics = candidatePaths.map((path) => {
    const pathLinks = [];

    for (let index = 0; index < path.length - 1; index += 1) {
      const link = networkSnapshot.links.find(
        (candidate) =>
          candidate.active &&
          (
            (candidate.source === path[index] &&
              candidate.destination === path[index + 1]) ||
            (candidate.source === path[index + 1] &&
              candidate.destination === path[index])
          )
      );

      if (!link) {
        return null;
      }

      pathLinks.push(link);
    }

    if (pathLinks.length === 0) {
      return null;
    }

    const telemetryValues = pathLinks.map(
      (link) =>
        telemetryMap[
          `${link.source}-${link.destination}`
        ] || {
          latency: 0,
          packetLoss: 100,
          congestion: 100,
          health: 0,
        }
    );

    const totalCost = pathLinks.reduce(
      (sum, link) => sum + Number(link.cost || 0),
      0
    );

    const averageLatency =
      telemetryValues.reduce(
        (sum, telemetry) =>
          sum + Number(telemetry.latency || 0),
        0
      ) / telemetryValues.length;

    const averagePacketLoss =
      telemetryValues.reduce(
        (sum, telemetry) =>
          sum + Number(telemetry.packetLoss || 0),
        0
      ) / telemetryValues.length;

    const averageCongestion =
      telemetryValues.reduce(
        (sum, telemetry) =>
          sum + Number(telemetry.congestion || 0),
        0
      ) / telemetryValues.length;

    const averageHealth =
      telemetryValues.reduce(
        (sum, telemetry) =>
          sum + Number(telemetry.health || 0),
        0
      ) / telemetryValues.length;

    return {
      path,
      cost: totalCost,
      latency: Math.round(averageLatency),
      packetLoss: Number(averagePacketLoss.toFixed(1)),
      congestion: Math.round(averageCongestion),
      health: Math.round(averageHealth),
    };
  }).filter(Boolean);

  if (rawMetrics.length === 0) {
    return [];
  }

  const costs = rawMetrics.map((item) => item.cost);
  const minimumCost = Math.min(...costs);
  const maximumCost = Math.max(...costs);

  const scored = rawMetrics.map((item) => {
    const costScore =
      maximumCost === minimumCost
        ? 100
        : clamp(
            100 -
              ((item.cost - minimumCost) /
                (maximumCost - minimumCost)) *
                100,
            0,
            100
          );

    const latencyScore = clamp(
      100 - item.latency * 2.2,
      0,
      100
    );

    const packetLossScore = clamp(
      100 - item.packetLoss * 18,
      0,
      100
    );

    const congestionScore = clamp(
      100 - item.congestion,
      0,
      100
    );

    const score = Math.round(
      costScore * 0.25 +
      item.health * 0.35 +
      latencyScore * 0.15 +
      packetLossScore * 0.10 +
      congestionScore * 0.15
    );

    const risk =
      score >= 80
        ? "LOW"
        : score >= 60
        ? "MEDIUM"
        : "HIGH";

    return {
      ...item,
      costScore: Math.round(costScore),
      latencyScore: Math.round(latencyScore),
      packetLossScore: Math.round(packetLossScore),
      congestionScore: Math.round(congestionScore),
      score,
      risk,
    };
  });

  return scored.sort((first, second) => {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    if (first.cost !== second.cost) {
      return first.cost - second.cost;
    }

    if (second.health !== first.health) {
      return second.health - first.health;
    }

    return first.path.length - second.path.length;
  });
};


function App() {

  // =====================================================
  // NETWORK STATE
  // =====================================================

  const [network, setNetwork] =
    useState({
      routers: [],
      links: [],
    });

  // =====================================================
  // ROUTING STATE
  // =====================================================

  const [source, setSource] =
    useState("");

  const [destination, setDestination] =
    useState("");

  const [route, setRoute] =
    useState([]);

  const [routeCost, setRouteCost] =
    useState(0);

  // =====================================================
  // ADAPTIVE ROUTING ANALYSIS
  // =====================================================

  const [adaptiveAnalysis, setAdaptiveAnalysis] =
    useState([]);

  const [adaptiveRoute, setAdaptiveRoute] =
    useState([]);

  // =====================================================
  // PACKET SIMULATION
  // =====================================================

  const [packetActive, setPacketActive] =
    useState(false);

  const [packetId, setPacketId] =
    useState(0);

  const [packetStep, setPacketStep] =
    useState(0);

  const [packetProgress, setPacketProgress] =
    useState(0);

  const [packetStatus, setPacketStatus] =
    useState("READY");

  const [packetRoute, setPacketRoute] =
    useState([]);

  const [selfHealingMode, setSelfHealingMode] =
    useState(false);

  const [healingInProgress, setHealingInProgress] =
    useState(false);

  const [originalPacketRoute, setOriginalPacketRoute] =
    useState([]);

  const [recoveryCount, setRecoveryCount] =
    useState(0);

  const [healingMessage, setHealingMessage] =
    useState(
      "Ready for packet transmission."
    );

  const [networkEvents, setNetworkEvents] =
    useState([]);

  // Simulated telemetry refreshes periodically so the dashboard
  // behaves like a live network monitor. These values are for
  // simulation/visualization; they are not measurements of the
  // user's physical network.
  const [healthTick, setHealthTick] =
    useState(0);

  // Proactive recovery plan: proposes a healthier route before
  // intentionally injecting any failure into the simulated network.
  const [proactivePlan, setProactivePlan] =
    useState(null);

  // Stores a before/after comparison for proactive route changes.
  // All values are based on the simulator's synthetic telemetry.
  const [performanceComparison, setPerformanceComparison] =
    useState(null);

  // Prevent the self-healing demo from injecting more than one
  // automatic failure during a single packet transmission. The actual
  // failed link is selected dynamically from the live topology.
  const selfHealFailureInjected = useRef(false);

  // Keep a handle to the React Flow instance so the topology can be
  // reframed after a simulated failure/recovery changes active links.
  // Without this, the viewport can remain on a stale transform and the
  // router nodes may appear to disappear until the page is refreshed.
  const reactFlowInstanceRef = useRef(null);

  // Changing this value remounts React Flow after a successful network reset.
  // It helps recover from occasional stale viewport/canvas state after reset.
  const [topologyGeneration, setTopologyGeneration] = useState(0);

  // =====================================================
  // SYSTEM STATE
  // =====================================================

  const [message, setMessage] =
    useState(
      "Connecting to Resilio..."
    );

  const [loading, setLoading] =
    useState(false);

  // =====================================================
  // ADD ROUTER
  // =====================================================

  const [newRouterId, setNewRouterId] =
    useState("");

  // =====================================================
  // ADD LINK
  // =====================================================

  const [linkSource, setLinkSource] =
    useState("");

  const [linkDestination, setLinkDestination] =
    useState("");

  const [linkCost, setLinkCost] =
    useState("1");

  // Stores unsaved cost edits for each existing connection.
  const [linkCostDrafts, setLinkCostDrafts] =
    useState({});

  // =====================================================
  // FAILURE CONTROL
  // =====================================================

  const [failureType, setFailureType] =
    useState("link");

  const [failureRouter, setFailureRouter] =
    useState("");

  const [failureLink, setFailureLink] =
    useState("");

  // =====================================================
  // CHECK ROUTE EDGE
  // =====================================================

  const isRouteEdge = (
    sourceId,
    targetId
  ) => {

    for (
      let i = 0;
      i < route.length - 1;
      i++
    ) {

      const first =
        route[i];

      const second =
        route[i + 1];

      if (
        (first === sourceId &&
          second === targetId) ||
        (first === targetId &&
          second === sourceId)
      ) {
        return true;
      }
    }

    return false;
  };

  // =====================================================
  // NODE BASE
  // =====================================================

  const baseNodes = useMemo(() => {

    return network.routers.map(
      (router) => {

        const isSource =
          router.id === source;

        const isDestination =
          router.id === destination;

        const isOnRoute =
          route.includes(
            router.id
          );

        let background =
          "#172554";

        let border =
          "#60a5fa";

        let textColor =
          "#ffffff";

        // FAILED
        if (
          !router.active
        ) {

          background =
            "#450a0a";

          border =
            "#ef4444";

          textColor =
            "#fca5a5";

        }

        // SOURCE
        else if (
          isSource
        ) {

          background =
            "#14532d";

          border =
            "#22c55e";

        }

        // DESTINATION
        else if (
          isDestination
        ) {

          background =
            "#4c1d95";

          border =
            "#a78bfa";

        }

        // ROUTE
        else if (
          isOnRoute
        ) {

          background =
            "#123b5d";

          border =
            "#38bdf8";
        }

        return {

          id:
            router.id,

          position: {
            x: 0,
            y: 0,
          },

          data: {

            label: (

              <div className="router-node-content">

                <strong>
                  {router.id}
                </strong>

                <span>

                  {!router.active
                    ? "FAILED"
                    : isSource
                    ? "SOURCE"
                    : isDestination
                    ? "DESTINATION"
                    : isOnRoute
                    ? "ON ROUTE"
                    : "ACTIVE"}

                </span>

              </div>
            ),
          },

          draggable:
            false,

          selectable:
            false,

          style: {

            width:
              NODE_WIDTH,

            height:
              NODE_HEIGHT,

            borderRadius:
              18,

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            background,

            border:
              `2px solid ${border}`,

            color:
              textColor,

            boxShadow:
              isOnRoute &&
              router.active
                ? "0 0 20px rgba(56, 189, 248, 0.35)"
                : "none",
          },
        };
      }
    );

  }, [
    network.routers,
    route,
    source,
    destination,
  ]);

  // =====================================================
  // EDGES
  // =====================================================

  const graphEdges = useMemo(() => {

    return network.links.map(
      (link) => {

        const routeEdge =
          link.active &&
          isRouteEdge(
            link.source,
            link.destination
          );

        return {

          id:
            `${link.source}-${link.destination}`,

          source:
            link.source,

          target:
            link.destination,

          label:
            `${link.cost}`,

          type:
            "smoothstep",

          animated:
            routeEdge,

          style: {

            stroke:
              !link.active
                ? "#ef4444"
                : routeEdge
                ? "#22c55e"
                : "#64748b",

            strokeWidth:
              routeEdge
                ? 5
                : 2,

            strokeDasharray:
              !link.active
                ? "7 6"
                : undefined,
          },

          labelStyle: {

            fill:
              routeEdge
                ? "#86efac"
                : "#cbd5e1",

            fontWeight:
              700,

            fontSize:
              13,
          },

          labelBgStyle: {

            fill:
              "#0f172a",

            fillOpacity:
              1,
          },

          labelBgPadding:
            [7, 4],

          labelBgBorderRadius:
            5,
        };
      }
    );

  }, [
    network.links,
    route,
  ]);

  // =====================================================
  // APPLY CLEAN LAYOUT
  // =====================================================

  const {
    nodes: layoutedNodes,
    edges: layoutedEdges,
  } =
    useMemo(() => {

      const positions =
        getCleanLayout(
          network.routers,
          network.links,
          source,
          destination
        );

      const nodes =
        baseNodes.map(
          (node) => {

            const position =
              positions[node.id] || {
                x: 100,
                y: 100,
              };

            return {
              ...node,

              position,
            };
          }
        );

      return {
        nodes,
        edges:
          graphEdges,
      };

    }, [
      baseNodes,
      graphEdges,
      network.routers,
      network.links,
      source,
      destination,
    ]);

  // Refit the topology after the network snapshot changes. Two animation
  // frames give React Flow time to commit the new nodes and measure its canvas.
  // This is independent of packet animation state, so it does not run every frame.
  useEffect(() => {
    if (layoutedNodes.length === 0) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const instance = reactFlowInstanceRef.current;
        if (instance) {
          instance.fitView({
            padding: 0.18,
            duration: 220,
          });
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [
    network.routers,
    network.links,
    layoutedNodes.length,
    topologyGeneration,
  ]);

  // =====================================================
  // PACKET FLOW POSITION
  // Keep packet separate from React Flow nodes so fitView
  // does not recalculate the viewport on every animation frame.
  // =====================================================

  const packetFlowPosition =
    useMemo(() => {

      if (
        ![
          "TRANSMITTING",
          "RECOVERING",
          "DELIVERED",
        ].includes(packetStatus) ||
        packetRoute.length < 2
      ) {
        return null;
      }

      const positions = getCleanLayout(
        network.routers,
        network.links,
        source,
        destination
      );

      const currentRouter =
        packetRoute[
          Math.min(
            packetStep,
            packetRoute.length - 1
          )
        ];

      const nextRouter =
        packetRoute[
          Math.min(
            packetStep + 1,
            packetRoute.length - 1
          )
        ];

      const startPosition =
        positions[currentRouter];

      const endPosition =
        positions[nextRouter];

      if (!startPosition) {
        return null;
      }

      if (
        packetStatus === "DELIVERED" ||
        !endPosition
      ) {
        return {
          x:
            startPosition.x +
            NODE_WIDTH / 2,
          y:
            startPosition.y +
            NODE_HEIGHT / 2,
        };
      }

      const progress =
        packetStatus === "RECOVERING"
          ? 0
          : packetProgress;

      return {
        x:
          startPosition.x +
          NODE_WIDTH / 2 +
          (endPosition.x - startPosition.x) *
            progress,
        y:
          startPosition.y +
          NODE_HEIGHT / 2 +
          (endPosition.y - startPosition.y) *
            progress,
      };

    }, [
      packetStatus,
      packetRoute,
      packetStep,
      packetProgress,
      network.routers,
      network.links,
      source,
      destination,
    ]);

  // =====================================================
  // OVERVIEW POSITIONS
  // =====================================================

  const overviewPositions =
    useMemo(() => {

      if (
        layoutedNodes.length === 0
      ) {
        return {};
      }

      const minX =
        Math.min(
          ...layoutedNodes.map(
            (node) =>
              node.position.x
          )
        );

      const maxX =
        Math.max(
          ...layoutedNodes.map(
            (node) =>
              node.position.x
          )
        );

      const minY =
        Math.min(
          ...layoutedNodes.map(
            (node) =>
              node.position.y
          )
        );

      const maxY =
        Math.max(
          ...layoutedNodes.map(
            (node) =>
              node.position.y
          )
        );

      const rangeX =
        Math.max(
          maxX - minX,
          1
        );

      const rangeY =
        Math.max(
          maxY - minY,
          1
        );

      const positions = {};

      layoutedNodes.forEach(
        (node) => {

          positions[node.id] = {

            left:
              12 +
              ((node.position.x - minX) /
                rangeX) *
                76,

            top:
              12 +
              ((node.position.y - minY) /
                rangeY) *
                76,
          };

        }
      );

      return positions;

    }, [
      layoutedNodes,
    ]);

  // =====================================================
  // NETWORK HEALTH MONITORING
  // =====================================================

  useEffect(() => {

    const intervalId =
      setInterval(() => {
        setHealthTick((previous) => previous + 1);
      }, 4000);

    return () => {
      clearInterval(intervalId);
    };

  }, []);

  const healthData = useMemo(() => {

    const linkTelemetry = {};

    network.links.forEach((link) => {

      linkTelemetry[
        `${link.source}-${link.destination}`
      ] = getSimulatedLinkTelemetry(
        link,
        healthTick
      );

    });

    const activeLinks = network.links.filter(
      (link) => link.active
    );

    const activeRouters = network.routers.filter(
      (router) => router.active
    );

    const routerTelemetry =
      network.routers.reduce((result, router) => {

        result[router.id] =
          getSimulatedRouterTelemetry(
            router,
            network.links,
            linkTelemetry
          );

        return result;

      }, {});

    const activeLinkHealth =
      activeLinks.length > 0
        ? Math.round(
            activeLinks.reduce(
              (sum, link) =>
                sum +
                linkTelemetry[
                  `${link.source}-${link.destination}`
                ].health,
              0
            ) / activeLinks.length
          )
        : 0;

    const activeRouterHealth =
      activeRouters.length > 0
        ? Math.round(
            activeRouters.reduce(
              (sum, router) =>
                sum +
                (routerTelemetry[router.id]?.health || 0),
              0
            ) / activeRouters.length
          )
        : 0;

    const overallHealth =
      activeLinks.length > 0 && activeRouters.length > 0
        ? Math.round(
            activeLinkHealth * 0.65 +
            activeRouterHealth * 0.35
          )
        : activeLinks.length > 0
        ? activeLinkHealth
        : activeRouterHealth;

    const atRiskLinks = activeLinks.filter(
      (link) =>
        linkTelemetry[
          `${link.source}-${link.destination}`
        ].health < 65
    ).length;

    return {
      linkTelemetry,
      routerTelemetry,
      overallHealth,
      overallStatus: getHealthStatus(overallHealth),
      overallClass: getHealthClass(overallHealth),
      atRiskLinks,
    };

  }, [
    network,
    healthTick,
  ]);

  // =====================================================
  // FAULT DIAGNOSIS & SEVERITY
  // =====================================================

  // Resilio uses transparent rule-based analysis here. The goal is to
  // explain what is wrong, how serious it is, what traffic is affected,
  // and what recovery action is recommended. This is intentionally
  // separate from route selection so diagnosis remains explainable.
  const faultDiagnosis = useMemo(() => {

    const failedRouters = network.routers.filter(
      (router) => !router.active
    );

    const failedLinks = network.links.filter(
      (link) => !link.active
    );

    const degradedLinks = network.links.filter((link) => {
      if (!link.active) {
        return false;
      }

      const telemetry =
        healthData.linkTelemetry[
          `${link.source}-${link.destination}`
        ];

      return telemetry && telemetry.health < 65;
    });

    const hasSelectedRoute = route.length > 1;

    const selectedRouteUsesLink = (sourceId, destinationId) => {
      for (let index = 0; index < route.length - 1; index += 1) {
        const first = route[index];
        const second = route[index + 1];

        if (
          (first === sourceId && second === destinationId) ||
          (first === destinationId && second === sourceId)
        ) {
          return true;
        }
      }

      return false;
    };

    const isReachable = (startRouter, targetRouter) => {
      if (!startRouter || !targetRouter) {
        return false;
      }

      const activeRouterIds = new Set(
        network.routers
          .filter((router) => router.active)
          .map((router) => router.id)
      );

      if (
        !activeRouterIds.has(startRouter) ||
        !activeRouterIds.has(targetRouter)
      ) {
        return false;
      }

      const queue = [startRouter];
      const visited = new Set([startRouter]);

      while (queue.length > 0) {
        const current = queue.shift();

        if (current === targetRouter) {
          return true;
        }

        network.links.forEach((link) => {
          if (!link.active) {
            return;
          }

          let neighbour = null;

          if (link.source === current) {
            neighbour = link.destination;
          } else if (link.destination === current) {
            neighbour = link.source;
          }

          if (
            neighbour &&
            activeRouterIds.has(neighbour) &&
            !visited.has(neighbour)
          ) {
            visited.add(neighbour);
            queue.push(neighbour);
          }
        });
      }

      return false;
    };

    const faults = [];

    failedLinks.forEach((link) => {
      const routeImpacted = selectedRouteUsesLink(
        link.source,
        link.destination
      );

      const selectedPathStillReachable = isReachable(
        source,
        destination
      );

      faults.push({
        id: `link-${link.source}-${link.destination}`,
        component: `Link ${link.source} ↔ ${link.destination}`,
        type: 'LINK FAILURE',
        severity: 'CRITICAL',
        severityClass: 'fault-critical',
        summary: `The ${link.source} ↔ ${link.destination} connection is unavailable.`,
        indicators: [
          'Link status: DOWN',
          'Packet loss: 100%',
          'Health score: 0/100',
        ],
        impact: routeImpacted
          ? 'The selected route is directly disrupted by this failure.'
          : selectedPathStillReachable
          ? 'The selected connection is unavailable, but the source and destination remain reachable.'
          : 'The current network has no active path between the selected source and destination.',
        recommendation: selectedPathStillReachable
          ? 'Use a healthy alternate path and continue monitoring the network.'
          : 'Restore this link or add network redundancy before transmitting traffic.',
      });
    });

    failedRouters.forEach((router) => {
      const sourceAffected = router.id === source;
      const destinationAffected = router.id === destination;

      faults.push({
        id: `router-${router.id}`,
        component: `Router ${router.id}`,
        type: 'ROUTER FAILURE',
        severity: 'CRITICAL',
        severityClass: 'fault-critical',
        summary: `Router ${router.id} is unavailable and cannot forward traffic.`,
        indicators: [
          'Router status: DOWN',
          'Forwarding unavailable',
          sourceAffected
            ? 'Selected source is affected'
            : destinationAffected
            ? 'Selected destination is affected'
            : 'Network segment may be isolated',
        ],
        impact:
          sourceAffected || destinationAffected
            ? `The selected ${sourceAffected ? 'source' : 'destination'} router is directly affected.`
            : 'Traffic that depends on this router may need to be rerouted.',
        recommendation: 'Use a healthy router path or restore the failed router before normal traffic resumes.',
      });
    });

    degradedLinks.forEach((link) => {
      const telemetry =
        healthData.linkTelemetry[
          `${link.source}-${link.destination}`
        ];

      faults.push({
        id: `degraded-${link.source}-${link.destination}`,
        component: `Link ${link.source} ↔ ${link.destination}`,
        type: 'LINK DEGRADATION',
        severity: 'HIGH',
        severityClass: 'fault-high',
        summary: `The connection is showing unhealthy operating conditions.`,
        indicators: [
          `Health score: ${telemetry.health}/100`,
          `Congestion: ${telemetry.congestion}%`,
          `Packet loss: ${telemetry.packetLoss}%`,
        ],
        impact: hasSelectedRoute && selectedRouteUsesLink(link.source, link.destination)
          ? 'This degraded link is part of the selected route and may reduce reliability.'
          : 'This link can become a future bottleneck if its condition worsens.',
        recommendation: 'Prefer a healthier route when available and continue monitoring this link.',
      });
    });

    const severityOrder = {
      CRITICAL: 0,
      HIGH: 1,
    };

    faults.sort((first, second) => {
      const firstRank = severityOrder[first.severity] ?? 9;
      const secondRank = severityOrder[second.severity] ?? 9;

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return first.component.localeCompare(second.component);
    });

    return {
      faults: faults.slice(0, 8),
      failedCount: failedRouters.length + failedLinks.length,
      degradedCount: degradedLinks.length,
      overallStatus:
        failedRouters.length + failedLinks.length > 0
          ? 'FAULTS DETECTED'
          : degradedLinks.length > 0
          ? 'ATTENTION REQUIRED'
          : 'SYSTEM HEALTHY',
      overallClass:
        failedRouters.length + failedLinks.length > 0
          ? 'fault-critical'
          : degradedLinks.length > 0
          ? 'fault-high'
          : 'fault-healthy',
    };

  }, [
    network,
    healthData,
    route,
    source,
    destination,
  ]);

  // =====================================================
  // FAILURE RISK ASSESSMENT
  // =====================================================

  // Rule-based early-warning model using the simulator's live telemetry.
  // This is intentionally transparent and explainable; it is not an ML model.
  const riskAssessment = useMemo(() => {

    const assessedLinks = network.links.map((link) => {

      const telemetry =
        healthData.linkTelemetry[
          `${link.source}-${link.destination}`
        ] || {
          latency: 0,
          packetLoss: 100,
          congestion: 100,
          health: 0,
          availability: 0,
        };

      if (!link.active) {
        return {
          id: `risk-${link.source}-${link.destination}`,
          component: `Link ${link.source} ↔ ${link.destination}`,
          severity: "CRITICAL",
          severityClass: "risk-critical",
          score: 100,
          prediction: "Failure already detected.",
          recommendation: "Restore the link or route traffic through a healthy path.",
          telemetry,
        };
      }

      const healthRisk = clamp(100 - telemetry.health, 0, 100);
      const latencyRisk = clamp((telemetry.latency - 10) * 2.5, 0, 100);
      const lossRisk = clamp(telemetry.packetLoss * 15, 0, 100);
      const congestionRisk = clamp(telemetry.congestion, 0, 100);

      const score = Math.round(
        healthRisk * 0.45 +
        congestionRisk * 0.25 +
        lossRisk * 0.20 +
        latencyRisk * 0.10
      );

      const severity =
        score >= 80
          ? "CRITICAL"
          : score >= 60
          ? "HIGH"
          : score >= 40
          ? "MEDIUM"
          : "LOW";

      const severityClass =
        severity === "CRITICAL"
          ? "risk-critical"
          : severity === "HIGH"
          ? "risk-high"
          : severity === "MEDIUM"
          ? "risk-medium"
          : "risk-low";

      const prediction =
        severity === "CRITICAL"
          ? "Strong signs of instability detected."
          : severity === "HIGH"
          ? "The link is showing conditions that may lead to instability."
          : severity === "MEDIUM"
          ? "The link should be monitored for worsening conditions."
          : "No significant near-term instability is indicated.";

      const recommendation =
        severity === "CRITICAL" || severity === "HIGH"
          ? "Prefer a healthier alternate path when available."
          : severity === "MEDIUM"
          ? "Continue monitoring and keep an alternate route ready."
          : "Continue normal operation.";

      return {
        id: `risk-${link.source}-${link.destination}`,
        component: `Link ${link.source} ↔ ${link.destination}`,
        severity,
        severityClass,
        score,
        prediction,
        recommendation,
        telemetry,
      };
    });

    return assessedLinks.sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return first.component.localeCompare(second.component);
    });

  }, [
    network.links,
    healthData,
  ]);

  const riskSummary = useMemo(() => {

    const highRisk = riskAssessment.filter(
      (item) => item.severity === "HIGH" || item.severity === "CRITICAL"
    );

    const critical = riskAssessment.filter(
      (item) => item.severity === "CRITICAL"
    );

    const averageRisk =
      riskAssessment.length > 0
        ? Math.round(
            riskAssessment.reduce(
              (sum, item) => sum + item.score,
              0
            ) / riskAssessment.length
          )
        : 0;

    return {
      highRiskCount: highRisk.length,
      criticalCount: critical.length,
      averageRisk,
      overallStatus:
        critical.length > 0
          ? "CRITICAL RISK"
          : highRisk.length > 0
          ? "HIGH RISK"
          : averageRisk >= 40
          ? "WATCH"
          : "LOW RISK",
      overallClass:
        critical.length > 0
          ? "risk-critical"
          : highRisk.length > 0
          ? "risk-high"
          : averageRisk >= 40
          ? "risk-medium"
          : "risk-low",
    };

  }, [riskAssessment]);

  // =====================================================
  // LOAD NETWORK
  // =====================================================

  const loadNetwork = async () => {

    try {

      const response =
        await fetch(
          `${API_BASE}/network`
        );

      if (!response.ok) {

        throw new Error(
          "Network request failed"
        );
      }

      const data =
        await response.json();

      setNetwork(data);

      const activeRouters =
        data.routers.filter(
          (router) =>
            router.active
        );

      // SOURCE

      if (
        !activeRouters.some(
          (router) =>
            router.id === source
        )
      ) {

        setSource(
          activeRouters.length > 0
            ? activeRouters[0].id
            : ""
        );
      }

      // DESTINATION

      if (
        !activeRouters.some(
          (router) =>
            router.id === destination
        )
      ) {

        setDestination(
          activeRouters.length > 1
            ? activeRouters[
                activeRouters.length - 1
              ].id
            : ""
        );
      }

      // LINK SOURCE

      if (
        !activeRouters.some(
          (router) =>
            router.id === linkSource
        )
      ) {

        setLinkSource(
          activeRouters.length > 0
            ? activeRouters[0].id
            : ""
        );
      }

      // LINK DESTINATION

      if (
        !activeRouters.some(
          (router) =>
            router.id === linkDestination
        )
      ) {

        setLinkDestination(
          activeRouters.length > 1
            ? activeRouters[1].id
            : ""
        );
      }

      // FAILURE ROUTER

      if (
        !activeRouters.some(
          (router) =>
            router.id === failureRouter
        )
      ) {

        setFailureRouter(
          activeRouters.length > 0
            ? activeRouters[0].id
            : ""
        );
      }

      // FAILURE LINK

      const activeLinks =
        data.links.filter(
          (link) =>
            link.active
        );

      const currentFailureLink =
        activeLinks.find(
          (link) =>
            `${link.source}-${link.destination}` ===
            failureLink
        );

      if (
        !currentFailureLink
      ) {

        setFailureLink(
          activeLinks.length > 0
            ? `${activeLinks[0].source}-${activeLinks[0].destination}`
            : ""
        );
      }

      if (
        activeRouters.length > 0
      ) {

        setMessage(
          "Network connected successfully."
        );

        appendNetworkEvent(
          setNetworkEvents,
          "SYSTEM",
          `Network synchronized: ${activeRouters.length} active routers, ${activeLinks.length} active links.`
        );
      }

    } catch (error) {

      console.error(error);

      setMessage(
        "Backend unavailable. Start the Java API server."
      );
    }
  };

  // =====================================================
  // ADD ROUTER
  // =====================================================

  const addRouter = async () => {

    const id =
      newRouterId.trim();

    if (!id) {

      setMessage(
        "Enter a router ID first."
      );

      return;
    }

    try {

      setLoading(true);

      const response =
        await fetch(
          `${API_BASE}/router/add?id=${encodeURIComponent(
            id
          )}`
        );

      const data =
        await response.json();

      if (!response.ok) {

        setMessage(
          data.error ||
          "Unable to add router."
        );

        return;
      }

      setNewRouterId("");

      await loadNetwork();

      setMessage(
        `Router ${id} added successfully.`
      );

      appendNetworkEvent(
        setNetworkEvents,
        "SYSTEM",
        `Router ${id} added successfully.`
      );

    } catch (error) {

      console.error(error);

      setMessage(
        "Unable to connect to backend."
      );

    } finally {

      setLoading(false);
    }
  };

  // =====================================================
  // ADD LINK
  // =====================================================

  const addLink = async () => {

    if (
      !linkSource ||
      !linkDestination
    ) {

      setMessage(
        "Select both routers."
      );

      return;
    }

    if (
      linkSource ===
      linkDestination
    ) {

      setMessage(
        "A router cannot connect to itself."
      );

      return;
    }

    const cost =
      Number(linkCost);

    if (
      !Number.isInteger(cost) ||
      cost <= 0
    ) {

      setMessage(
        "Link cost must be a positive integer."
      );

      return;
    }

    try {

      setLoading(true);

      const response =
        await fetch(
          `${API_BASE}/link/add?source=${encodeURIComponent(
            linkSource
          )}&destination=${encodeURIComponent(
            linkDestination
          )}&cost=${cost}`
        );

      const data =
        await response.json();

      if (!response.ok) {

        setMessage(
          data.error ||
          "Unable to add link."
        );

        return;
      }

      await loadNetwork();

      setMessage(
        `Link ${linkSource} ↔ ${linkDestination} added successfully.`
      );

      appendNetworkEvent(
        setNetworkEvents,
        "SYSTEM",
        `Link ${linkSource} ↔ ${linkDestination} added with cost ${cost}.`
      );

    } catch (error) {

      console.error(error);

      setMessage(
        "Unable to connect to backend."
      );

    } finally {

      setLoading(false);
    }
  };

  // =====================================================
  // UPDATE EXISTING LINK COST
  // =====================================================

  const updateLinkCost = async (link) => {

    const linkKey = `${link.source}-${link.destination}`;
    const cost = Number(
      linkCostDrafts[linkKey] ?? String(link.cost)
    );

    if (!Number.isInteger(cost) || cost <= 0) {
      setMessage("Link cost must be a positive integer.");
      return;
    }

    if (cost === Number(link.cost)) {
      setMessage(`Link ${link.source} ↔ ${link.destination} already has cost ${cost}.`);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_BASE}/link/update-cost?source=${encodeURIComponent(
          link.source
        )}&destination=${encodeURIComponent(
          link.destination
        )}&cost=${cost}`
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Unable to update link cost.");
        return;
      }

      setLinkCostDrafts((previous) => ({
        ...previous,
        [linkKey]: String(cost),
      }));

      await loadNetwork();

      // The selected route may no longer be best after a weight change.
      // Clear stale route recommendations and let Find Route recompute them.
      setRoute([]);
      setRouteCost(0);
      setAdaptiveAnalysis([]);
      setAdaptiveRoute([]);
      setProactivePlan(null);
      setPerformanceComparison(null);

      setMessage(
        `Updated ${link.source} ↔ ${link.destination} cost from ${link.cost} to ${cost}. Click Find Route to recalculate.`
      );

      appendNetworkEvent(
        setNetworkEvents,
        "SYSTEM",
        `Link ${link.source} ↔ ${link.destination} cost changed from ${link.cost} to ${cost}.`
      );

    } catch (error) {
      console.error(error);
      setMessage("Unable to connect to backend while updating link cost.");
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // ADAPTIVE ROUTE ANALYSIS
  // =====================================================

  const getActiveLinkBetween = (firstRouter, secondRouter) => {

    return network.links.find(
      (link) =>
        link.active &&
        ((link.source === firstRouter &&
          link.destination === secondRouter) ||
          (link.source === secondRouter &&
            link.destination === firstRouter))
    ) || null;
  };

  const enumerateCandidateRoutes = (
    startRouter,
    targetRouter
  ) => {

    const activeRouterIds = new Set(
      network.routers
        .filter((router) => router.active)
        .map((router) => router.id)
    );

    if (
      !activeRouterIds.has(startRouter) ||
      !activeRouterIds.has(targetRouter)
    ) {
      return [];
    }

    const adjacency = {};

    activeRouterIds.forEach((routerId) => {
      adjacency[routerId] = [];
    });

    network.links.forEach((link) => {
      if (!link.active) {
        return;
      }

      if (
        activeRouterIds.has(link.source) &&
        activeRouterIds.has(link.destination)
      ) {
        adjacency[link.source].push(link.destination);
        adjacency[link.destination].push(link.source);
      }
    });

    Object.values(adjacency).forEach((neighbors) => {
      neighbors.sort((a, b) => a.localeCompare(b));
    });

    const candidates = [];
    const maximumRoutes = 60;
    const maximumDepth = activeRouterIds.size;

    const dfs = (currentRouter, path, visited) => {

      if (candidates.length >= maximumRoutes) {
        return;
      }

      if (currentRouter === targetRouter) {
        candidates.push(path.slice());
        return;
      }

      if (path.length >= maximumDepth) {
        return;
      }

      for (const neighbour of adjacency[currentRouter] || []) {

        if (visited.has(neighbour)) {
          continue;
        }

        visited.add(neighbour);
        path.push(neighbour);

        dfs(neighbour, path, visited);

        path.pop();
        visited.delete(neighbour);

        if (candidates.length >= maximumRoutes) {
          return;
        }
      }
    };

    dfs(
      startRouter,
      [startRouter],
      new Set([startRouter])
    );

    return candidates;
  };

  const getAdaptiveRouteAnalysis = (
    startRouter,
    targetRouter
  ) => {
    return getAdaptiveRouteAnalysisForNetwork(
      network,
      startRouter,
      targetRouter,
      healthTick
    );
  };

  const getAdaptiveReason = (
    bestRoute,
    analysis
  ) => {

    if (!bestRoute) {
      return "No healthy candidate route is currently available.";
    }

    const lowestCostRoute =
      analysis.reduce((best, current) =>
        !best || current.cost < best.cost
          ? current
          : best,
      null);

    if (
      lowestCostRoute &&
      lowestCostRoute.path.join("→") !==
        bestRoute.path.join("→")
    ) {
      return "Selected for better network health and lower estimated risk than the lowest-cost alternative.";
    }

    if (bestRoute.health >= 85) {
      return "Selected because the path has strong overall link health.";
    }

    if (bestRoute.congestion <= 35) {
      return "Selected because the path has relatively low congestion.";
    }

    if (bestRoute.packetLoss <= 1) {
      return "Selected because the path has low packet loss.";
    }

    return "Selected using Resilio's combined cost and network-health score.";
  };

  // =====================================================
  // FIND ROUTE
  // =====================================================

  const findRoute = async () => {

    if (
      !source ||
      !destination
    ) {

      setMessage(
        "Select source and destination."
      );

      return;
    }

    if (
      source === destination
    ) {

      setMessage(
        "Source and destination must be different."
      );

      return;
    }

    try {

      setLoading(true);

      const response =
        await fetch(
          `${API_BASE}/route?source=${encodeURIComponent(
            source
          )}&destination=${encodeURIComponent(
            destination
          )}`
        );

      const data =
        await response.json();

      if (!response.ok) {

        setMessage(
          data.error ||
          "Route calculation failed."
        );

        return;
      }

      if (
        data.available
      ) {

        const analysis =
          getAdaptiveRouteAnalysis(
            source,
            destination
          );

        if (analysis.length > 0) {

          const bestRoute =
            analysis[0];

          setAdaptiveAnalysis(
            analysis
          );

          setAdaptiveRoute(
            bestRoute.path
          );

          setRoute(
            bestRoute.path
          );

          setRouteCost(
            bestRoute.cost
          );

          const reason =
            getAdaptiveReason(
              bestRoute,
              analysis
            );

          setMessage(
            `Adaptive route selected: ${bestRoute.path.join(
              " → "
            )} (score ${bestRoute.score}/100).`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "ROUTE",
            `Adaptive route selected: ${bestRoute.path.join(" → ")} (cost ${bestRoute.cost}, health ${bestRoute.health}/100, score ${bestRoute.score}/100).`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "SYSTEM",
            `Reason: ${reason}`
          );

        } else {

          setAdaptiveAnalysis(
            []
          );

          setAdaptiveRoute(
            data.path
          );

          setRoute(
            data.path
          );

          setRouteCost(
            data.cost
          );

          setMessage(
            `Route found: ${data.path.join(
              " → "
            )}`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "ROUTE",
            `Route discovered: ${data.path.join(" → ")} (cost ${data.cost}).`
          );
        }

      } else {

        setRoute([]);

        setRouteCost(0);

        setAdaptiveAnalysis([]);
        setAdaptiveRoute([]);

        setMessage(
          `No route available from ${source} to ${destination}.`
        );

        appendNetworkEvent(
          setNetworkEvents,
          "WARN",
          `No route available from ${source} to ${destination}.`
        );
      }

    } catch (error) {

      console.error(error);

      setMessage(
        "Unable to calculate route."
      );

    } finally {

      setLoading(false);
    }
  };

  // =====================================================
  // PROACTIVE RECOVERY
  // =====================================================

  const prepareProactiveRecovery = () => {

    if (!source || !destination || source === destination) {
      setMessage("Select different source and destination routers first.");
      return;
    }

    if (packetActive || healingInProgress) {
      setMessage("Wait for the current packet transmission or recovery to finish before preparing a proactive route.");
      return;
    }

    const candidates = getAdaptiveRouteAnalysis(source, destination);

    if (!candidates.length) {
      setProactivePlan({
        status: "NO_ROUTE",
        message: `No active route is available from ${source} to ${destination}.`,
      });
      setMessage("Proactive recovery could not find an active route to evaluate.");
      return;
    }

    const samePath = (first, second) =>
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((routerId, index) => routerId === second[index]);

    const requestedRouteIsValid =
      route.length >= 2 &&
      route[0] === source &&
      route[route.length - 1] === destination;

    const currentMetrics = requestedRouteIsValid
      ? candidates.find((candidate) => samePath(candidate.path, route)) || candidates[0]
      : candidates[0];

    const currentPath = currentMetrics.path;

    const routeLinks = network.links.filter((link) => {
      if (!link.active) return false;
      for (let index = 0; index < currentPath.length - 1; index += 1) {
        const first = currentPath[index];
        const second = currentPath[index + 1];
        if (
          (link.source === first && link.destination === second) ||
          (link.source === second && link.destination === first)
        ) {
          return true;
        }
      }
      return false;
    });

    if (!routeLinks.length) {
      setProactivePlan({
        status: "NO_ROUTE",
        message: "The current route has no active links available for analysis.",
      });
      setMessage("No active route links were available for proactive analysis.");
      return;
    }

    const linksWithRisk = routeLinks.map((link) => {
      const risk = riskAssessment.find(
        (item) => item.id === `risk-${link.source}-${link.destination}`
      ) || {
        score: 0,
        severity: "LOW",
        severityClass: "risk-low",
        prediction: "No major instability is indicated.",
      };
      return { link, risk };
    }).sort((first, second) => second.risk.score - first.risk.score);

    const atRisk = linksWithRisk[0];
    const riskLink = atRisk.link;

    const usesRiskLink = (path) => {
      for (let index = 0; index < path.length - 1; index += 1) {
        const first = path[index];
        const second = path[index + 1];
        if (
          (riskLink.source === first && riskLink.destination === second) ||
          (riskLink.source === second && riskLink.destination === first)
        ) {
          return true;
        }
      }
      return false;
    };

    const alternatives = candidates.filter(
      (candidate) => !usesRiskLink(candidate.path)
    );

    if (!alternatives.length) {
      setProactivePlan({
        status: "NO_ALTERNATIVE",
        current: currentMetrics,
        currentPath,
        riskLink,
        risk: atRisk.risk,
        alternatives: [],
        message: `No alternate route from ${source} to ${destination} avoids Link ${riskLink.source} ↔ ${riskLink.destination}. Add network redundancy before attempting proactive rerouting.`,
      });
      setMessage(`No alternate route is available to avoid Link ${riskLink.source} ↔ ${riskLink.destination}.`);
      appendNetworkEvent(
        setNetworkEvents,
        "PROACTIVE",
        `Proactive analysis found no alternate route avoiding Link ${riskLink.source} ↔ ${riskLink.destination}.`
      );
      return;
    }

    // Candidates are already ordered by adaptive route score, so the first
    // path here is the strongest alternative that avoids the selected link.
    const alternative = alternatives[0];
    const scoreDifference = alternative.score - currentMetrics.score;
    const linkRiskScore = atRisk.risk.score;

    // Do not recommend a route just because it avoids the highest-risk link.
    // A low-risk link does not justify switching to a clearly worse path.
    // Higher risk can justify a modest score trade-off because the link may
    // become unavailable; critical risk justifies preparing any viable detour.
    const alternativeScoresBetter = scoreDifference > 0;
    const riskJustifiesTradeoff =
      linkRiskScore >= 80 ||
      (linkRiskScore >= 60 && scoreDifference >= -15) ||
      (linkRiskScore >= 40 && scoreDifference >= -5);

    if (!alternativeScoresBetter && !riskJustifiesTradeoff) {
      const messageText =
        `Current route ${currentPath.join(" → ")} remains preferred. ` +
        `Link ${riskLink.source} ↔ ${riskLink.destination} has ${atRisk.risk.severity.toLowerCase()} risk (${linkRiskScore}/100), ` +
        `and the best route that avoids it, ${alternative.path.join(" → ")}, scores ${alternative.score}/100 versus ${currentMetrics.score}/100 for the current route. ` +
        `Switching is not justified, so Resilio will not label that alternative safer. No link was failed and the current route has not been changed.`;

      setProactivePlan({
        status: "NO_IMPROVEMENT",
        current: currentMetrics,
        currentPath,
        riskLink,
        risk: atRisk.risk,
        alternate: null,
        alternatives,
        candidates,
        message: messageText,
      });
      setPerformanceComparison(null);
      setMessage(messageText);
      appendNetworkEvent(
        setNetworkEvents,
        "PROACTIVE",
        `No proactive switch recommended. Current route score ${currentMetrics.score}/100; best detour score ${alternative.score}/100; Link ${riskLink.source} ↔ ${riskLink.destination} risk ${linkRiskScore}/100. Current route unchanged.`
      );
      return;
    }

    const recommendationReason = alternativeScoresBetter
      ? `The alternative scores ${alternative.score}/100, higher than the current route's ${currentMetrics.score}/100, and avoids Link ${riskLink.source} ↔ ${riskLink.destination}.`
      : `Link ${riskLink.source} ↔ ${riskLink.destination} has ${atRisk.risk.severity.toLowerCase()} risk (${linkRiskScore}/100), which justifies preparing this detour despite its route score of ${alternative.score}/100 versus ${currentMetrics.score}/100 for the current route.`;

    const plan = {
      status: "READY",
      current: currentMetrics,
      currentPath,
      riskLink,
      risk: atRisk.risk,
      alternate: alternative,
      alternatives,
      candidates,
      message: `${recommendationReason} Resilio found an available alternative before failure; no link was failed automatically.`,
    };

    setProactivePlan(plan);
    setPerformanceComparison({
      status: "PROPOSED",
      before: currentMetrics,
      after: alternative,
      riskLink: {
        source: riskLink.source,
        destination: riskLink.destination,
      },
      packetStatus: "Not tested yet",
      createdAt: Date.now(),
    });
    setMessage(
      `Proactive route prepared: use ${alternative.path.join(" → ")} to avoid Link ${riskLink.source} ↔ ${riskLink.destination}. ${recommendationReason}`
    );
    appendNetworkEvent(
      setNetworkEvents,
      "PROACTIVE",
      `Proactive alternative prepared: ${alternative.path.join(" → ")} avoids Link ${riskLink.source} ↔ ${riskLink.destination} (risk ${linkRiskScore}/100); the link has not been failed.`
    );
  };

  const applyProactiveRecovery = () => {

    if (!proactivePlan || !proactivePlan.alternate) {
      setMessage("Analyze a safer route first.");
      return;
    }

    if (packetActive || healingInProgress) {
      setMessage("Wait for the current packet transmission or recovery to finish before applying a proactive route.");
      return;
    }

    const chosen = proactivePlan.alternate;
    const routeKey = chosen.path.join("→");
    const reorderedAnalysis = [
      chosen,
      ...(proactivePlan.candidates || []).filter(
        (candidate) => candidate.path.join("→") !== routeKey
      ),
    ];

    setAdaptiveAnalysis(reorderedAnalysis);
    setAdaptiveRoute(chosen.path);
    setRoute(chosen.path);
    setRouteCost(chosen.cost);
    setPacketActive(false);
    setPacketStep(0);
    setPacketProgress(0);
    setPacketRoute([]);
    setPacketStatus("READY");
    setSelfHealingMode(false);
    setHealingInProgress(false);
    setHealingMessage("Proactive route applied. Send a packet to verify delivery on the safer path.");
    setProactivePlan({ ...proactivePlan, status: "APPLIED" });
    setPerformanceComparison((previous) => ({
      status: "APPLIED",
      before: previous?.before || proactivePlan.current,
      after: chosen,
      riskLink: previous?.riskLink || {
        source: proactivePlan.riskLink.source,
        destination: proactivePlan.riskLink.destination,
      },
      packetStatus: "Awaiting packet verification",
      routeAppliedAt: Date.now(),
    }));

    setMessage(
      `Proactive recovery applied: traffic will use ${chosen.path.join(" → ")} while Link ${proactivePlan.riskLink.source} ↔ ${proactivePlan.riskLink.destination} remains active.`
    );
    appendNetworkEvent(
      setNetworkEvents,
      "PROACTIVE",
      `Proactive recovery applied before failure. Route changed to ${chosen.path.join(" → ")} (score ${chosen.score}/100), avoiding Link ${proactivePlan.riskLink.source} ↔ ${proactivePlan.riskLink.destination}; the link remains active.`
    );
  };

  // =====================================================
  // FAIL COMPONENT
  // =====================================================

  const failComponent = async () => {

    try {

      setLoading(true);

      let url = "";

      let failureMessage = "";

      if (
        failureType ===
        "router"
      ) {

        if (!failureRouter) {

          setMessage(
            "Select a router to fail."
          );

          return;
        }

        url =
          `${API_BASE}/fail/router?id=${encodeURIComponent(
            failureRouter
          )}`;

        failureMessage =
          `Router ${failureRouter} failed.`;

      } else {

        if (!failureLink) {

          setMessage(
            "Select a link to fail."
          );

          return;
        }

        const parts =
          failureLink.split("-");

        const sourceId =
          parts[0];

        const destinationId =
          parts.slice(1).join("-");

        url =
          `${API_BASE}/fail/link?source=${encodeURIComponent(
            sourceId
          )}&destination=${encodeURIComponent(
            destinationId
          )}`;

        failureMessage =
          `Link ${sourceId} ↔ ${destinationId} failed.`;
      }

      const response =
        await fetch(url);

      const data =
        await response.json();

      if (!response.ok) {

        setMessage(
          data.error ||
          "Failure simulation failed."
        );

        return;
      }

      await loadNetwork();

      // Recalculate route

      if (
        source &&
        destination
      ) {

        const routeResponse =
          await fetch(
            `${API_BASE}/route?source=${encodeURIComponent(
              source
            )}&destination=${encodeURIComponent(
              destination
            )}`
          );

        const routeData =
          await routeResponse.json();

        if (
          routeData.available
        ) {

          setRoute(
            routeData.path
          );

          setRouteCost(
            routeData.cost
          );

        } else {

          setRoute([]);

          setRouteCost(0);
        }
      }

      setMessage(
        failureMessage
      );

      appendNetworkEvent(
        setNetworkEvents,
        "FAILURE",
        failureMessage
      );

    } catch (error) {

      console.error(error);

      setMessage(
        "Unable to simulate failure."
      );

    } finally {

      setLoading(false);
    }
  };

  // =====================================================
  // SEND PACKET
  // =====================================================

  const sendPacket = () => {

    if (route.length < 2) {
      setMessage(
        "Find a valid route before sending a packet."
      );
      return;
    }

    if (packetActive || healingInProgress) {
      return;
    }

    const nextPacketId = packetId + 1;
    const transmissionRoute = route.slice();

    setPacketId(nextPacketId);
    setPacketRoute(transmissionRoute);
    setOriginalPacketRoute(transmissionRoute);
    setPacketStep(0);
    setPacketProgress(0);
    setPacketStatus("TRANSMITTING");
    setPerformanceComparison((previous) => {
      if (!previous || !["APPLIED", "VERIFIED"].includes(previous.status)) {
        return previous;
      }
      return {
        ...previous,
        status: "APPLIED",
        packetStatus: "TRANSMITTING",
      };
    });
    setSelfHealingMode(false);
    setHealingInProgress(false);
    selfHealFailureInjected.current = false;
    setHealingMessage("Normal packet transmission in progress.");
    setPacketActive(true);

    setMessage(
      `Packet ${nextPacketId} started transmission: ${transmissionRoute.join(
        " → "
      )}`
    );

    appendNetworkEvent(
      setNetworkEvents,
      "PACKET",
      `Packet ${nextPacketId} transmission started via ${transmissionRoute.join(" → ")}.`
    );
  };

  // =====================================================
  // SELF-HEALING PACKET DEMO
  // =====================================================

  const sendSelfHealingPacket = () => {

    if (route.length < 3) {
      setMessage(
        "Self-healing demo needs a route with at least 3 routers."
      );
      return;
    }

    if (packetActive || healingInProgress) {
      return;
    }

    const nextPacketId = packetId + 1;
    const demoRoute =
      adaptiveRoute.length >= 3
        ? adaptiveRoute.slice()
        : route.slice();

    setPacketId(nextPacketId);
    setPacketRoute(demoRoute);
    setOriginalPacketRoute(demoRoute);
    setPacketStep(0);
    setPacketProgress(0);
    setPacketStatus("TRANSMITTING");
    setSelfHealingMode(true);
    setHealingInProgress(false);
    selfHealFailureInjected.current = false;
    setHealingMessage("Monitoring route for failures...");
    setPacketActive(true);

    setMessage(
      `Self-healing demo started: ${demoRoute.join(
        " → "
      )}. Resilio will dynamically select a recoverable failure and use health-aware adaptive routing during recovery.`
    );

    appendNetworkEvent(
      setNetworkEvents,
      "HEALING",
      `Self-healing demo started. Monitoring ${demoRoute.join(" → ")} for a recoverable failure.`
    );
  };

  // =====================================================
  // DYNAMIC SELF-HEALING FAILURE SELECTION
  // =====================================================

  // Check whether a destination is still reachable when one active
  // link is temporarily removed from the topology. This lets the
  // self-healing demo choose a failure dynamically instead of always
  // hardcoding a particular link such as B-D.
  const canReachAfterRemovingLink = (
    startRouter,
    targetRouter,
    excludedSource,
    excludedDestination
  ) => {

    const activeRouterIds = new Set(
      network.routers
        .filter((router) => router.active)
        .map((router) => router.id)
    );

    if (
      !activeRouterIds.has(startRouter) ||
      !activeRouterIds.has(targetRouter)
    ) {
      return false;
    }

    const queue = [startRouter];
    const visited = new Set([startRouter]);

    while (queue.length > 0) {

      const current = queue.shift();

      if (current === targetRouter) {
        return true;
      }

      for (const link of network.links) {

        if (!link.active) {
          continue;
        }

        const isExcludedLink =
          (link.source === excludedSource &&
            link.destination === excludedDestination) ||
          (link.source === excludedDestination &&
            link.destination === excludedSource);

        if (isExcludedLink) {
          continue;
        }

        let neighbour = null;

        if (link.source === current) {
          neighbour = link.destination;
        } else if (link.destination === current) {
          neighbour = link.source;
        }

        if (
          neighbour &&
          activeRouterIds.has(neighbour) &&
          !visited.has(neighbour)
        ) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    return false;
  };

  // Select a route link that is active and whose failure still leaves
  // a path from the packet's current router to the destination.
  // Candidates are considered in route order, so the immediate next
  // hop is preferred when it has a valid alternate path.
  const chooseSelfHealingFailureCandidate = (
    currentRouter,
    targetRouter,
    currentRoute,
    currentStep
  ) => {

    for (
      let index = currentStep + 1;
      index < currentRoute.length - 1;
      index++
    ) {

      const candidateSource = currentRoute[index];
      const candidateDestination = currentRoute[index + 1];

      const link = network.links.find(
        (networkLink) =>
          networkLink.active &&
          ((networkLink.source === candidateSource &&
            networkLink.destination === candidateDestination) ||
            (networkLink.source === candidateDestination &&
              networkLink.destination === candidateSource))
      );

      if (!link) {
        continue;
      }

      const alternateAvailable =
        canReachAfterRemovingLink(
          currentRouter,
          targetRouter,
          link.source,
          link.destination
        );

      if (alternateAvailable) {
        return {
          source: link.source,
          destination: link.destination,
          cost: link.cost,
        };
      }
    }

    return null;
  };

  // =====================================================
  // PACKET ANIMATION + SELF-HEALING
  // =====================================================

  useEffect(() => {

    if (
      !packetActive ||
      packetRoute.length < 2
    ) {
      return;
    }

    const hopDuration = 1200;
    const currentRoute = packetRoute.slice();
    const currentStep = packetStep;
    const packetNumber = packetId;
    let animationFrame = null;
    let cancelled = false;
    const startTime = performance.now();

    const animate = async (currentTime) => {

      if (cancelled) {
        return;
      }

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / hopDuration, 1);

      setPacketProgress(progress);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }

      // After the packet reaches its first router, choose a suitable
      // active link dynamically. The selected link must have an alternate
      // path available after failure, so the demo cannot intentionally
      // choose a dead-end link just to force a failure.
      if (
        selfHealingMode &&
        !selfHealFailureInjected.current &&
        currentStep === 0 &&
        currentRoute.length >= 3
      ) {

        const currentRouter = currentRoute[1];

        const failureCandidate =
          chooseSelfHealingFailureCandidate(
            currentRouter,
            destination,
            currentRoute,
            currentStep
          );

        if (!failureCandidate) {
          setPacketStep(currentStep + 1);
          setPacketProgress(0);
          setPacketStatus("FAILED");
          setPacketActive(false);
          setHealingInProgress(false);
          setHealingMessage(
            `No recoverable link failure was found from ${currentRouter} to ${destination}. Add network redundancy or choose a different route.`
          );
          setMessage(
            `Self-healing demo stopped: no safe failure candidate was available from ${currentRouter} to ${destination}.`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "WARN",
            `No safe failure candidate was available from ${currentRouter} to ${destination}.`
          );

          return;
        }

        const failedRouter =
          failureCandidate.destination;

        // Mark the injected failure immediately. React state updates are
        // asynchronous, so a ref is used to prevent the effect from
        // triggering a second failure when the recovered route is set.
        selfHealFailureInjected.current = true;

        setPacketStep(1);
        setPacketProgress(0);
        setPacketStatus("RECOVERING");
        setPacketActive(false);
        setHealingInProgress(true);
        setHealingMessage(
          `Resilio selected a recoverable failure dynamically: Link ${failureCandidate.source} ↔ ${failureCandidate.destination}`
        );
        setMessage(
          `⚠ Dynamic failure selected: Link ${failureCandidate.source} ↔ ${failureCandidate.destination}. Resilio is detecting the failure...`
        );

        appendNetworkEvent(
          setNetworkEvents,
          "FAILURE",
          `Dynamic failure selected: Link ${failureCandidate.source} ↔ ${failureCandidate.destination}.`
        );

        appendNetworkEvent(
          setNetworkEvents,
          "HEALING",
          `Failure detector activated at ${currentRouter}.`
        );

        try {
          const failResponse = await fetch(
            `${API_BASE}/fail/link?source=${encodeURIComponent(
              failureCandidate.source
            )}&destination=${encodeURIComponent(
              failureCandidate.destination
            )}`
          );
          const failData = await failResponse.json();

          if (!failResponse.ok) {
            throw new Error(
              failData.error ||
              "Unable to simulate the link failure."
            );
          }

          const networkResponse = await fetch(
            `${API_BASE}/network`
          );
          const networkData = await networkResponse.json();

          if (!networkResponse.ok) {
            throw new Error(
              "Unable to refresh the network after failure."
            );
          }

          setNetwork(networkData);

          setHealingMessage(
            `Link ${failureCandidate.source} ↔ ${failureCandidate.destination} failed. Recalculating route...`
          );
          setMessage(
            `⚠ Link ${failureCandidate.source} ↔ ${failureCandidate.destination} failed. Recalculating the best available route...`
          );

          const routeResponse = await fetch(
            `${API_BASE}/route?source=${encodeURIComponent(
              currentRouter
            )}&destination=${encodeURIComponent(
              destination
            )}`
          );
          const routeData = await routeResponse.json();

          if (
            !routeResponse.ok ||
            !routeData.available ||
            !Array.isArray(routeData.path) ||
            routeData.path.length < 2
          ) {
            throw new Error(
              `No alternate route available from ${currentRouter} to ${destination}.`
            );
          }

          const recoveredAnalysis =
            getAdaptiveRouteAnalysisForNetwork(
              networkData,
              currentRouter,
              destination,
              healthTick
            );

          const adaptiveRecoveredRoute =
            recoveredAnalysis[0]?.path || routeData.path;

          const adaptiveRecoveredCost =
            recoveredAnalysis[0]?.cost ?? routeData.cost;

          const adaptiveRecoveredScore =
            recoveredAnalysis[0]?.score ?? null;

          const adaptiveRecoveredHealth =
            recoveredAnalysis[0]?.health ?? null;

          setAdaptiveAnalysis(recoveredAnalysis);
          setAdaptiveRoute(adaptiveRecoveredRoute);
          setRoute(adaptiveRecoveredRoute);
          setRouteCost(adaptiveRecoveredCost);
          setPacketRoute(adaptiveRecoveredRoute);
          setPacketStep(0);
          setPacketProgress(0);
          setHealingInProgress(false);
          setRecoveryCount((count) => count + 1);
          setHealingMessage(
            recoveredAnalysis[0]
              ? `Health-aware recovery selected: ${adaptiveRecoveredRoute.join(
                  " → "
                )}`
              : `Alternate route found: ${adaptiveRecoveredRoute.join(
                  " → "
                )}`
          );
          setPacketStatus("TRANSMITTING");
          setPacketActive(true);

          setMessage(
            recoveredAnalysis[0]
              ? `✓ Failure detected. Resilio selected ${adaptiveRecoveredRoute.join(
                  " → "
                )} using health-aware scoring (score ${adaptiveRecoveredScore}/100). Packet ${packetNumber} is continuing.`
              : `✓ Failure detected. Alternate route found: ${adaptiveRecoveredRoute.join(
                  " → "
                )}. Packet ${packetNumber} is continuing.`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "ROUTE",
            recoveredAnalysis[0]
              ? `Adaptive recovery route selected: ${adaptiveRecoveredRoute.join(
                  " → "
                )} (cost ${adaptiveRecoveredCost}, health ${adaptiveRecoveredHealth}/100, score ${adaptiveRecoveredScore}/100).`
              : `Alternate route found: ${adaptiveRecoveredRoute.join(
                  " → "
                )} (cost ${adaptiveRecoveredCost}).`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "HEALING",
            `Packet ${packetNumber} rerouted successfully using Resilio's health-aware recovery decision.`
          );

        } catch (error) {

          console.error(error);
          setHealingInProgress(false);
          setPacketActive(false);
          setPacketStatus("FAILED");
          setHealingMessage(
            error.message ||
            "Self-healing failed."
          );
          setMessage(
            `Self-healing failed: ${
              error.message ||
              "No alternate route available."
            }`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "WARN",
            `Self-healing failed: ${error.message || "No alternate route available."}`
          );
        }

        return;
      }

      if (
        currentStep <
        currentRoute.length - 2
      ) {
        setPacketStep(currentStep + 1);
        setPacketProgress(0);
      } else {
        // The final hop has completed. Move the packet state to the
        // destination router before marking it as delivered so the visual
        // packet and the Current Router field both finish at D (or the
        // selected destination), not at the previous router.
        setPacketStep(currentRoute.length - 1);
        setPacketProgress(1);
        setPacketActive(false);
        setHealingInProgress(false);
        setPacketStatus("DELIVERED");
        setPerformanceComparison((previous) => {
          if (!previous || !["APPLIED", "VERIFIED"].includes(previous.status)) {
            return previous;
          }
          const expectedPath = previous.after?.path || [];
          const matchesAppliedRoute =
            expectedPath.length === currentRoute.length &&
            expectedPath.every((routerId, index) => routerId === currentRoute[index]);
          if (!matchesAppliedRoute) {
            return previous;
          }
          return {
            ...previous,
            status: "VERIFIED",
            packetStatus: "DELIVERED",
            deliveredPacketId: packetNumber,
            deliveredRoute: currentRoute.slice(),
            deliveryRecordedAt: Date.now(),
          };
        });

        if (selfHealingMode) {
          setHealingMessage(
            `Recovery complete. Packet delivered via ${currentRoute.join(
              " → "
            )}`
          );
          setMessage(
            `✓ Packet ${packetNumber} delivered successfully after self-healing via ${currentRoute.join(
              " → "
            )}`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "SUCCESS",
            `Packet ${packetNumber} delivered successfully after self-healing via ${currentRoute.join(" → ")}.`
          );
        } else {
          setMessage(
            `Packet ${packetNumber} delivered successfully via ${currentRoute.join(
              " → "
            )}`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "SUCCESS",
            `Packet ${packetNumber} delivered successfully via ${currentRoute.join(" → ")}.`
          );
        }
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };

  }, [
    packetActive,
    packetStep,
    packetRoute,
    packetId,
    selfHealingMode,
    destination,
  ]);

  // =====================================================
  // RESET NETWORK
  // =====================================================

  const resetNetwork = async () => {

    try {

      setLoading(true);

      const response =
        await fetch(
          `${API_BASE}/reset`
        );

      const data =
        await response.json();

      if (!response.ok) {

        setMessage(
          data.error ||
          "Reset failed."
        );

        return;
      }

      setRoute([]);

      setRouteCost(0);

      setAdaptiveAnalysis([]);

      setAdaptiveRoute([]);

      setProactivePlan(null);
      setPerformanceComparison(null);
      setLinkCostDrafts({});

      setPacketActive(false);

      setPacketStep(0);

      setPacketProgress(0);

      setPacketStatus(
        "READY"
      );

      setPacketRoute([]);

      setOriginalPacketRoute([]);

      setSelfHealingMode(false);

      selfHealFailureInjected.current = false;

      setHealingInProgress(false);

      setHealingMessage(
        "Ready for packet transmission."
      );

      setRecoveryCount(0);

      setNetworkEvents([
        {
          id: `${Date.now()}-reset`,
          time: new Date().toLocaleTimeString([], {
            hour12: false,
          }),
          type: "SYSTEM",
          text: "Network reset successfully. All default routers and links restored.",
        },
      ]);

      await loadNetwork();

      // Re-create the graph canvas after the default network has been loaded.
      // This prevents React Flow occasionally keeping a stale/blank viewport.
      setTopologyGeneration((generation) => generation + 1);

      setMessage(
        "Network reset successfully."
      );

    } catch (error) {

      console.error(error);

      setMessage(
        "Unable to reset network."
      );

    } finally {

      setLoading(false);
    }
  };

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {

    loadNetwork();

  }, []);

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="app">

      {/* ==========================================
          HEADER
      ========================================== */}

      <header className="topbar">

        <div className="brand-lockup">

          <img
            src="/resilio-header-logo.png"
            alt="Resilio logo"
            className="brand-logo"
            draggable="false"
          />

          <p>
            Intelligent Network Fault Analysis & Adaptive Recovery System
          </p>

        </div>

        <div className="system-status">

          <span className="status-dot"></span>

          {network.routers.length > 0
            ? "System Online"
            : "Connecting..."}

        </div>

      </header>

      <main className="dashboard">

        {/* ==========================================
            TOPOLOGY
        ========================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h2>
                Network Topology
              </h2>

              <p>
                Clean automatically arranged live network
              </p>

            </div>

            <button
              className="primary-button"
              onClick={loadNetwork}
              disabled={loading}
            >
              Refresh Network
            </button>

          </div>

          <div className="topology-placeholder flow-container">

            {layoutedNodes.length === 0 ? (

              <div className="empty-message">
                No routers available.
              </div>

            ) : (

              <ReactFlow
                key={topologyGeneration}
                nodes={layoutedNodes}
                edges={layoutedEdges}
                onInit={(instance) => {
                  reactFlowInstanceRef.current = instance;
                  // Wait until the canvas and measured node bounds are ready.
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      if (reactFlowInstanceRef.current === instance) {
                        instance.fitView({
                          padding: 0.18,
                          duration: 220,
                        });
                      }
                    });
                  });
                }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={true}
                zoomOnScroll={true}
                zoomOnPinch={true}
              >

                <Background />

                <Controls />

                {/* ========================================
                    PACKET ANIMATION OVERLAY
                    Screen-positioned so the packet stays
                    visible above the React Flow canvas without
                    changing the network layout or fitView.
                ======================================== */}

                <PacketScreenOverlay
                  position={packetFlowPosition}
                  active={packetActive}
                  status={packetStatus}
                />

                {/* ========================================
                    NETWORK OVERVIEW
                ======================================== */}

                <div className="network-overview">

                  <div className="overview-title">
                    NETWORK
                  </div>

                  <div className="overview-canvas">

                    <svg
                      className="overview-svg"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >

                      {network.links.map(
                        (link) => {

                          const start =
                            overviewPositions[
                              link.source
                            ];

                          const end =
                            overviewPositions[
                              link.destination
                            ];

                          if (
                            !start ||
                            !end
                          ) {
                            return null;
                          }

                          const routeEdge =
                            link.active &&
                            isRouteEdge(
                              link.source,
                              link.destination
                            );

                          return (
                            <line
                              key={`${link.source}-${link.destination}`}
                              x1={
                                start.left
                              }
                              y1={
                                start.top
                              }
                              x2={
                                end.left
                              }
                              y2={
                                end.top
                              }
                              stroke={
                                !link.active
                                  ? "#ef4444"
                                  : routeEdge
                                  ? "#22c55e"
                                  : "#64748b"
                              }
                              strokeWidth={
                                routeEdge
                                  ? 1.8
                                  : 1
                              }
                              strokeDasharray={
                                !link.active
                                  ? "4 3"
                                  : "0"
                              }
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        }
                      )}

                    </svg>

                    {layoutedNodes.map(
                      (node) => {

                        const position =
                          overviewPositions[
                            node.id
                          ];

                        if (
                          !position
                        ) {
                          return null;
                        }

                        const router =
                          network.routers.find(
                            (item) =>
                              item.id ===
                              node.id
                          );

                        if (
                          !router
                        ) {
                          return null;
                        }

                        let nodeColor =
                          "#64748b";

                        if (
                          !router.active
                        ) {

                          nodeColor =
                            "#ef4444";

                        } else if (
                          router.id ===
                          source
                        ) {

                          nodeColor =
                            "#22c55e";

                        } else if (
                          router.id ===
                          destination
                        ) {

                          nodeColor =
                            "#a78bfa";

                        } else if (
                          route.includes(
                            router.id
                          )
                        ) {

                          nodeColor =
                            "#38bdf8";
                        }

                        return (
                          <div
                            key={router.id}
                            className="overview-node"
                            style={{
                              left:
                                `${position.left}%`,
                              top:
                                `${position.top}%`,
                              background:
                                nodeColor,
                            }}
                          >
                            {router.id}
                          </div>
                        );
                      }
                    )}

                  </div>

                </div>

              </ReactFlow>

            )}

          </div>

          <div className="graph-legend">

            <span>
              <i className="legend-source"></i>
              Source
            </span>

            <span>
              <i className="legend-destination"></i>
              Destination
            </span>

            <span>
              <i className="legend-route"></i>
              Active Route
            </span>

            <span>
              <i className="legend-failed"></i>
              Failed
            </span>

          </div>

        </section>

        {/* ==========================================
            ADD ROUTER
        ========================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h2>
                Add Router
              </h2>

              <p>
                Create a new network node
              </p>

            </div>

          </div>

          <div className="add-router-container">

            <input
              type="text"
              value={newRouterId}
              onChange={(event) =>
                setNewRouterId(
                  event.target.value
                )
              }
              onKeyDown={(event) => {

                if (
                  event.key ===
                  "Enter"
                ) {
                  addRouter();
                }

              }}
              placeholder="Enter router ID"
              maxLength={20}
            />

            <button
              className="primary-button"
              onClick={addRouter}
              disabled={loading}
            >
              + Add Router
            </button>

          </div>

        </section>

        {/* ==========================================
            ADD LINK
        ========================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h2>
                Add Link
              </h2>

              <p>
                Create a connection between routers
              </p>

            </div>

          </div>

          <div className="link-form-grid">

            <div className="control-group">

              <label>
                From Router
              </label>

              <select
                value={linkSource}
                onChange={(event) =>
                  setLinkSource(
                    event.target.value
                  )
                }
              >

                <option value="">
                  Select router
                </option>

                {network.routers
                  .filter(
                    (router) =>
                      router.active
                  )
                  .map(
                    (router) => (

                      <option
                        key={router.id}
                        value={router.id}
                      >
                        Router {router.id}
                      </option>

                    )
                  )}

              </select>

            </div>

            <div className="control-group">

              <label>
                To Router
              </label>

              <select
                value={linkDestination}
                onChange={(event) =>
                  setLinkDestination(
                    event.target.value
                  )
                }
              >

                <option value="">
                  Select router
                </option>

                {network.routers
                  .filter(
                    (router) =>
                      router.active
                  )
                  .map(
                    (router) => (

                      <option
                        key={router.id}
                        value={router.id}
                      >
                        Router {router.id}
                      </option>

                    )
                  )}

              </select>

            </div>

            <div className="control-group">

              <label>
                Link Cost
              </label>

              <input
                type="number"
                min="1"
                step="1"
                value={linkCost}
                onChange={(event) =>
                  setLinkCost(
                    event.target.value
                  )
                }
              />

            </div>

            <button
              className="primary-button"
              onClick={addLink}
              disabled={loading}
            >
              + Add Link
            </button>

          </div>

        </section>

        {/* ==========================================
            FAILURE SIMULATION
        ========================================== */}

        <section className="panel failure-panel">

          <div className="panel-header">

            <div>

              <h2>
                Failure Simulation
              </h2>

              <p>
                Simulate router or link failures
              </p>

            </div>

          </div>

          <div className="failure-form">

            <div className="control-group">

              <label>
                Failure Type
              </label>

              <select
                value={failureType}
                onChange={(event) =>
                  setFailureType(
                    event.target.value
                  )
                }
              >

                <option value="link">
                  Link Failure
                </option>

                <option value="router">
                  Router Failure
                </option>

              </select>

            </div>

            {failureType === "link" ? (

              <div className="control-group">

                <label>
                  Select Link
                </label>

                <select
                  value={failureLink}
                  onChange={(event) =>
                    setFailureLink(
                      event.target.value
                    )
                  }
                >

                  <option value="">
                    Select link
                  </option>

                  {network.links
                    .filter(
                      (link) =>
                        link.active
                    )
                    .map(
                      (link) => {

                        const value =
                          `${link.source}-${link.destination}`;

                        return (
                          <option
                            key={value}
                            value={value}
                          >
                            {link.source}
                            {" ↔ "}
                            {link.destination}
                            {" (Cost: "}
                            {link.cost}
                            {")"}
                          </option>
                        );
                      }
                    )}

                </select>

              </div>

            ) : (

              <div className="control-group">

                <label>
                  Select Router
                </label>

                <select
                  value={failureRouter}
                  onChange={(event) =>
                    setFailureRouter(
                      event.target.value
                    )
                  }
                >

                  <option value="">
                    Select router
                  </option>

                  {network.routers
                    .filter(
                      (router) =>
                        router.active
                    )
                    .map(
                      (router) => (

                        <option
                          key={router.id}
                          value={router.id}
                        >
                          Router {router.id}
                        </option>

                      )
                    )}

                </select>

              </div>

            )}

            <button
              className="failure-button"
              onClick={failComponent}
              disabled={
                loading ||
                packetActive ||
                healingInProgress
              }
            >
              Simulate Failure
            </button>

          </div>

        </section>

        {/* ==========================================
            ROUTING CONTROL
        ========================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h2>
                Routing Control
              </h2>

              <p>
                Find the best available route
              </p>

            </div>

          </div>

          <div className="control-grid">

            <div className="control-group">

              <label>
                Source Router
              </label>

              <select
                value={source}
                onChange={(event) =>
                  setSource(
                    event.target.value
                  )
                }
              >

                <option value="">
                  Select source
                </option>

                {network.routers
                  .filter(
                    (router) =>
                      router.active
                  )
                  .map(
                    (router) => (

                      <option
                        key={router.id}
                        value={router.id}
                      >
                        Router {router.id}
                      </option>

                    )
                  )}

              </select>

            </div>

            <div className="control-group">

              <label>
                Destination Router
              </label>

              <select
                value={destination}
                onChange={(event) =>
                  setDestination(
                    event.target.value
                  )
                }
              >

                <option value="">
                  Select destination
                </option>

                {network.routers
                  .filter(
                    (router) =>
                      router.active
                  )
                  .map(
                    (router) => (

                      <option
                        key={router.id}
                        value={router.id}
                      >
                        Router {router.id}
                      </option>

                    )
                  )}

              </select>

            </div>

            <div className="routing-buttons">

              <button
                className="send-button"
                onClick={findRoute}
                disabled={
                  loading ||
                  packetActive
                }
              >
                Find Route
              </button>

              <button
                className="packet-button"
                onClick={sendPacket}
                disabled={
                  loading ||
                  packetActive ||
                  healingInProgress ||
                  route.length < 2
                }
              >
                {packetActive && !selfHealingMode
                  ? "Packet Transmitting..."
                  : "Send Packet"}
              </button>

              <button
                className="self-heal-button"
                onClick={sendSelfHealingPacket}
                disabled={
                  loading ||
                  packetActive ||
                  healingInProgress ||
                  route.length < 3
                }
              >
                Self-Heal Demo
              </button>

            </div>

          </div>

          <div className="packet-status-panel">

            <div className="packet-status-header">

              <span>
                Packet Simulation
              </span>

              <span
                className={
                  packetStatus === "DELIVERED"
                    ? "packet-delivered"
                    : packetStatus === "TRANSMITTING"
                    ? "packet-transmitting"
                    : packetStatus === "RECOVERING"
                    ? "packet-recovering"
                    : packetStatus === "FAILED"
                    ? "packet-failed"
                    : "packet-ready"
                }
              >
                {packetStatus}
              </span>

            </div>

            <div className="packet-details">

              <span>
                Packet ID: {
                  packetId > 0
                    ? `#${packetId}`
                    : "—"
                }
              </span>

              <span>
                Route: {
                  packetRoute.length > 0
                    ? packetRoute.join(" → ")
                    : route.length > 0
                    ? route.join(" → ")
                    : "Not selected"
                }
              </span>

              {(packetActive ||
                healingInProgress ||
                packetStatus === "DELIVERED") &&
                packetRoute.length > 0 && (
                  <span>
                    Current Router: {
                      packetRoute[
                        Math.min(
                          packetStep,
                          packetRoute.length - 1
                        )
                      ]
                    }
                  </span>
                )}

              {selfHealingMode && (
                <span>
                  Recoveries: {recoveryCount}
                </span>
              )}

            </div>

            <div className="packet-healing-message">
              {healingMessage}
            </div>

          </div>

          {adaptiveAnalysis.length > 0 && (

            <div className="adaptive-route-panel">

              <div className="adaptive-route-header">

                <div>
                  <h3>Adaptive Route Analysis</h3>
                  <p>
                    Resilio evaluates route cost and live simulated network health.
                  </p>
                </div>

                <span className="adaptive-badge">
                  HEALTH-AWARE
                </span>

              </div>

              <div className="adaptive-route-summary">

                <div className="adaptive-recommended-card">
                  <span>Recommended Route</span>
                  <strong>
                    {adaptiveRoute.length > 0
                      ? adaptiveRoute.join(" → ")
                      : "—"}
                  </strong>
                  <small>
                    {adaptiveAnalysis[0]?.score ?? 0}/100 route score •{" "}
                    {adaptiveAnalysis[0]?.risk ?? "—"} risk
                  </small>
                </div>

                <div className="adaptive-reason-card">
                  <span>Why Resilio selected it</span>
                  <strong>
                    {getAdaptiveReason(
                      adaptiveAnalysis[0],
                      adaptiveAnalysis
                    )}
                  </strong>
                </div>

              </div>

              <div className="adaptive-route-list">

                {adaptiveAnalysis.slice(0, 6).map((candidate, index) => (

                  <div
                    className={`adaptive-route-row ${
                      index === 0
                        ? "adaptive-route-row-best"
                        : ""
                    }`}
                    key={`adaptive-${candidate.path.join("-")}`}
                  >

                    <div className="adaptive-route-main">
                      <div className="adaptive-route-title">
                        <strong>
                          {candidate.path.join(" → ")}
                        </strong>
                        {index === 0 && (
                          <span className="adaptive-best-pill">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <span>
                        Cost {candidate.cost} • Health {candidate.health}/100 • Risk {candidate.risk}
                      </span>
                    </div>

                    <div className="adaptive-route-metrics">
                      <span>
                        Latency
                        <strong>{candidate.latency} ms</strong>
                      </span>
                      <span>
                        Loss
                        <strong>{candidate.packetLoss}%</strong>
                      </span>
                      <span>
                        Congestion
                        <strong>{candidate.congestion}%</strong>
                      </span>
                      <span>
                        Score
                        <strong>{candidate.score}/100</strong>
                      </span>
                    </div>

                  </div>

                ))}

              </div>

            </div>
          )}

          <div className="reset-area">

            <button
              className="reset-button"
              onClick={resetNetwork}
              disabled={loading}
            >
              Reset Network
            </button>

          </div>

        </section>

        {/* ==========================================
            STATISTICS
        ========================================== */}

        <section className="stats-grid">

          <div className="stat-card">

            <span>
              Active Routers
            </span>

            <strong>
              {
                network.routers.filter(
                  (router) =>
                    router.active
                ).length
              }
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Active Links
            </span>

            <strong>
              {
                network.links.filter(
                  (link) =>
                    link.active
                ).length
              }
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Current Route Cost
            </span>

            <strong>
              {routeCost}
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Self-Healing Recoveries
            </span>

            <strong>
              {recoveryCount}
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Network Health
            </span>

            <strong>
              {healthData.overallHealth}/100
            </strong>

          </div>

          <div className="stat-card">

            <span>
              At-Risk Links
            </span>

            <strong>
              {healthData.atRiskLinks}
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Detected Faults
            </span>

            <strong>
              {faultDiagnosis.failedCount}
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Backend Status
            </span>

            <strong className="online-text">
              {network.routers.length > 0
                ? "ONLINE"
                : "OFFLINE"}
            </strong>

          </div>

        </section>

        {/* ==========================================
            NETWORK HEALTH MONITOR
        ========================================== */}

        <section className="panel health-panel">

          <div className="panel-header">

            <div>

              <h2>
                Network Health Monitor
              </h2>

              <p>
                Simulated live telemetry for network condition analysis
              </p>

            </div>

            <div
              className={`health-status-pill ${healthData.overallClass}`}
            >
              {healthData.overallStatus}
            </div>

          </div>

          <div className="health-dashboard">

            <div className="health-overall-card">

              <div className="health-score-ring">

                <div className="health-score-value">
                  {healthData.overallHealth}
                </div>

                <div className="health-score-label">
                  / 100
                </div>

              </div>

              <div className="health-overall-copy">

                <strong>
                  Overall Network Health
                </strong>

                <span>
                  Resilio combines link and router condition scores
                  to create a single network-health view.
                </span>

              </div>

            </div>

            <div className="health-metric-grid">

              <div className="health-mini-card">
                <span>Monitored Links</span>
                <strong>
                  {network.links.length}
                </strong>
              </div>

              <div className="health-mini-card">
                <span>Healthy Links</span>
                <strong>
                  {network.links.filter(
                    (link) =>
                      link.active &&
                      healthData.linkTelemetry[
                        `${link.source}-${link.destination}`
                      ]?.health >= 85
                  ).length}
                </strong>
              </div>

              <div className="health-mini-card">
                <span>Warning Links</span>
                <strong>
                  {network.links.filter(
                    (link) =>
                      link.active &&
                      healthData.linkTelemetry[
                        `${link.source}-${link.destination}`
                      ]?.health >= 65 &&
                      healthData.linkTelemetry[
                        `${link.source}-${link.destination}`
                      ]?.health < 85
                  ).length}
                </strong>
              </div>

              <div className="health-mini-card">
                <span>Critical / Failed</span>
                <strong>
                  {network.links.filter(
                    (link) =>
                      !link.active ||
                      healthData.linkTelemetry[
                        `${link.source}-${link.destination}`
                      ]?.health < 65
                  ).length}
                </strong>
              </div>

            </div>

          </div>

          <div className="health-link-list">

            {network.links.length === 0 ? (

              <div className="health-empty">
                No links available for health monitoring.
              </div>

            ) : (

              network.links.map((link) => {

                const telemetry =
                  healthData.linkTelemetry[
                    `${link.source}-${link.destination}`
                  ];

                return (

                  <div
                    className="health-link-row"
                    key={`health-${link.source}-${link.destination}`}
                  >

                    <div className="health-link-name">
                      <strong>
                        {link.source} ↔ {link.destination}
                      </strong>
                      <span>
                        Cost: {link.cost}
                      </span>
                    </div>

                    <div className="health-telemetry-grid">

                      <span>
                        Latency
                        <strong>
                          {telemetry.latency} ms
                        </strong>
                      </span>

                      <span>
                        Packet Loss
                        <strong>
                          {telemetry.packetLoss}%
                        </strong>
                      </span>

                      <span>
                        Congestion
                        <strong>
                          {telemetry.congestion}%
                        </strong>
                      </span>

                      <span>
                        Health
                        <strong>
                          {telemetry.health}/100
                        </strong>
                      </span>

                    </div>

                    <div className="health-progress-wrap">

                      <div className="health-progress-track">
                        <div
                          className={`health-progress-fill ${telemetry.healthClass}`}
                          style={{
                            width: `${telemetry.health}%`,
                          }}
                        />
                      </div>

                      <span
                        className={`health-status-text ${telemetry.healthClass}`}
                      >
                        {telemetry.status}
                      </span>

                    </div>

                  </div>

                );

              })

            )}

          </div>

          <div className="health-disclaimer">
            * Telemetry values are simulated for the network simulator and
            are used to demonstrate health-aware analysis.
          </div>

        </section>

        {/* ==========================================
            FAULT DIAGNOSIS & SEVERITY
        ========================================== */}

        <section className="panel fault-diagnosis-panel">

          <div className="panel-header">

            <div>

              <h2>
                Fault Diagnosis & Severity
              </h2>

              <p>
                Explainable analysis of failures and abnormal network conditions
              </p>

            </div>

            <div
              className={`fault-status-pill ${faultDiagnosis.overallClass}`}
            >
              {faultDiagnosis.overallStatus}
            </div>

          </div>

          {faultDiagnosis.faults.length === 0 ? (

            <div className="fault-healthy-card">

              <div className="fault-healthy-icon">✓</div>

              <div>
                <strong>
                  No active faults detected
                </strong>

                <span>
                  Resilio is not detecting any failed or critically degraded network component.
                </span>
              </div>

            </div>

          ) : (

            <div className="fault-list">

              {faultDiagnosis.faults.map((fault) => (

                <article
                  className={`fault-card ${fault.severityClass}`}
                  key={fault.id}
                >

                  <div className="fault-card-header">

                    <div>
                      <span className="fault-type">
                        {fault.type}
                      </span>
                      <h3>
                        {fault.component}
                      </h3>
                      <p>
                        {fault.summary}
                      </p>
                    </div>

                    <span
                      className={`fault-severity ${fault.severityClass}`}
                    >
                      {fault.severity}
                    </span>

                  </div>

                  <div className="fault-detail-grid">

                    <div>
                      <span>Detected indicators</span>
                      <ul>
                        {fault.indicators.map((indicator) => (
                          <li key={indicator}>
                            {indicator}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span>Impact</span>
                      <p>
                        {fault.impact}
                      </p>
                    </div>

                    <div>
                      <span>Recommended action</span>
                      <p>
                        {fault.recommendation}
                      </p>
                    </div>

                  </div>

                </article>

              ))}

            </div>

          )}

          <div className="fault-diagnosis-note">
            Diagnosis is rule-based and uses the simulator's current topology and simulated telemetry.
          </div>

        </section>

        {/* ==========================================
            FAILURE RISK ASSESSMENT
        ========================================== */}

        <section className="panel risk-assessment-panel">

          <div className="panel-header">

            <div>
              <h2>Failure Risk Assessment</h2>
              <p>
                Early-warning analysis based on simulated network conditions
              </p>
            </div>

            <div
              className={`risk-status-pill ${riskSummary.overallClass}`}
            >
              {riskSummary.overallStatus}
            </div>

          </div>

          <div className="risk-summary-grid">

            <div className="risk-summary-card">
              <span>Average Risk</span>
              <strong>{riskSummary.averageRisk}/100</strong>
            </div>

            <div className="risk-summary-card">
              <span>High / Critical Links</span>
              <strong>{riskSummary.highRiskCount}</strong>
            </div>

            <div className="risk-summary-card">
              <span>Critical Conditions</span>
              <strong>{riskSummary.criticalCount}</strong>
            </div>

          </div>

          {riskAssessment.length === 0 ? (
            <div className="risk-empty-card">
              No links are available for risk assessment.
            </div>
          ) : (
            <div className="risk-list">

              {riskAssessment.map((item) => (
                <article
                  className={`risk-card ${item.severityClass}`}
                  key={item.id}
                >

                  <div className="risk-card-top">

                    <div>
                      <span className="risk-component-label">
                        MONITORED LINK
                      </span>
                      <h3>{item.component}</h3>
                      <p>{item.prediction}</p>
                    </div>

                    <div className={`risk-score-badge ${item.severityClass}`}>
                      <strong>{item.score}</strong>
                      <span>/100</span>
                      <em>{item.severity} RISK</em>
                    </div>

                  </div>

                  <div className="risk-metric-grid">

                    <div>
                      <span>Health</span>
                      <strong>{item.telemetry.health}/100</strong>
                    </div>

                    <div>
                      <span>Latency</span>
                      <strong>{item.telemetry.latency} ms</strong>
                    </div>

                    <div>
                      <span>Packet Loss</span>
                      <strong>{item.telemetry.packetLoss}%</strong>
                    </div>

                    <div>
                      <span>Congestion</span>
                      <strong>{item.telemetry.congestion}%</strong>
                    </div>

                  </div>

                  <div className="risk-recommendation">
                    <span>Recommendation</span>
                    <p>{item.recommendation}</p>
                  </div>

                </article>
              ))}

            </div>
          )}

          <div className="risk-assessment-note">
            * Risk is calculated using transparent rule-based scoring from simulated telemetry; it is intended for early-warning demonstration, not real-world failure prediction.
          </div>

        </section>

        {/* ==========================================
            PROACTIVE RECOVERY
        ========================================== */}

        <section className="panel proactive-recovery-panel">

          <div className="panel-header">
            <div>
              <h2>Proactive Recovery</h2>
              <p>Prepare a safer route before an active link completely fails</p>
            </div>
            <span className={`proactive-status-pill ${
              proactivePlan?.status === "APPLIED"
                ? "proactive-status-applied"
                : proactivePlan?.status === "READY"
                ? "proactive-status-ready"
                : proactivePlan?.status === "NO_ALTERNATIVE" || proactivePlan?.status === "NO_ROUTE"
                ? "proactive-status-blocked"
                : "proactive-status-idle"
            }`}>
              {proactivePlan?.status === "APPLIED"
                ? "ROUTE APPLIED"
                : proactivePlan?.status === "READY"
                ? "SAFER ROUTE READY"
                : proactivePlan?.status === "NO_ALTERNATIVE"
                ? "NO ALTERNATE PATH"
                : proactivePlan?.status === "NO_ROUTE"
                ? "ROUTE UNAVAILABLE"
                : proactivePlan?.status === "NO_IMPROVEMENT"
                ? "CURRENT ROUTE PREFERRED"
                : "READY TO ANALYZE"}
            </span>
          </div>

          <p className="proactive-intro">
            Resilio examines the current route, identifies its highest-risk active link using simulated telemetry, and searches for an available route that avoids that link. This is a recommendation first; no failure is injected automatically.
          </p>

          {proactivePlan?.status === "READY" || proactivePlan?.status === "APPLIED" ? (
            <div className="proactive-plan-grid">

              <article className="proactive-plan-card proactive-current-card">
                <span className="proactive-eyebrow">CURRENT ROUTE</span>
                <h3>{proactivePlan.currentPath.join(" → ")}</h3>
                <div className="proactive-route-metrics">
                  <span>Cost <strong>{proactivePlan.current.cost}</strong></span>
                  <span>Score <strong>{proactivePlan.current.score}/100</strong></span>
                </div>
                <div className="proactive-risk-link">
                  <div>
                    <span>Route link to avoid</span>
                    <strong>{proactivePlan.riskLink.source} ↔ {proactivePlan.riskLink.destination}</strong>
                  </div>
                  <span className={`proactive-risk-tag ${proactivePlan.risk.severityClass}`}>
                    {proactivePlan.risk.severity} · {proactivePlan.risk.score}/100
                  </span>
                </div>
              </article>

              <article className="proactive-plan-card proactive-alternative-card">
                <span className="proactive-eyebrow">RECOMMENDED SAFER ROUTE</span>
                <h3>{proactivePlan.alternate.path.join(" → ")}</h3>
                <div className="proactive-route-metrics">
                  <span>Cost <strong>{proactivePlan.alternate.cost}</strong></span>
                  <span>Health <strong>{proactivePlan.alternate.health}/100</strong></span>
                  <span>Score <strong>{proactivePlan.alternate.score}/100</strong></span>
                </div>
                <div className="proactive-telemetry-grid">
                  <div><span>Latency</span><strong>{proactivePlan.alternate.latency} ms</strong></div>
                  <div><span>Packet loss</span><strong>{proactivePlan.alternate.packetLoss}%</strong></div>
                  <div><span>Congestion</span><strong>{proactivePlan.alternate.congestion}%</strong></div>
                </div>
              </article>

            </div>
          ) : (
            <div className="proactive-empty-state">
              {proactivePlan?.message || "Select a source and destination, find a route, then analyze a safer alternative. The system will keep every link active during planning."}
            </div>
          )}

          {proactivePlan?.message && proactivePlan.status !== "NO_IMPROVEMENT" && (
            <div className={`proactive-result-message ${proactivePlan.status === "NO_ALTERNATIVE" || proactivePlan.status === "NO_ROUTE" ? "proactive-result-warning" : ""}`}>
              {proactivePlan.status === "APPLIED"
                ? `Proactive route applied successfully. Link ${proactivePlan.riskLink.source} ↔ ${proactivePlan.riskLink.destination} remains active.`
                : proactivePlan.message}
            </div>
          )}

          <div className="proactive-actions">
            <button
              className="primary-button proactive-analyze-button"
              onClick={prepareProactiveRecovery}
              disabled={loading || packetActive || healingInProgress}
            >
              Analyze Safer Route
            </button>
            <button
              className="primary-button proactive-apply-button"
              onClick={applyProactiveRecovery}
              disabled={
                loading || packetActive || healingInProgress ||
                !proactivePlan?.alternate || proactivePlan?.status === "APPLIED"
              }
            >
              {proactivePlan?.status === "APPLIED" ? "Proactive Route Applied" : "Apply Proactive Recovery"}
            </button>
          </div>

          <div className="proactive-note">
            Risk scores are rule-based and use simulated link telemetry. Proactive recovery changes the selected route without forcing a link failure.
          </div>

        </section>

        {/* ==========================================
            PERFORMANCE ANALYSIS
        ========================================== */}

        <section className="panel performance-analysis-panel">

          <div className="panel-header">
            <div>
              <h2>Performance Analysis</h2>
              <p>Compare the original route with the proactive alternative</p>
            </div>
            <span className={`performance-status-pill ${
              performanceComparison?.status === "VERIFIED"
                ? "performance-status-verified"
                : performanceComparison?.status === "APPLIED"
                ? "performance-status-applied"
                : performanceComparison?.status === "PROPOSED"
                ? "performance-status-proposed"
                : "performance-status-idle"
            }`}>
              {performanceComparison?.status === "VERIFIED"
                ? "PACKET VERIFIED"
                : performanceComparison?.status === "APPLIED"
                ? "ROUTE APPLIED"
                : performanceComparison?.status === "PROPOSED"
                ? "COMPARISON READY"
                : "AWAITING ANALYSIS"}
            </span>
          </div>

          {!performanceComparison ? (
            <div className="performance-empty-state">
              Run <strong>Analyze Safer Route</strong> in the Proactive Recovery section to create a before-and-after comparison.
              After applying the route, use <strong>Send Packet</strong> to verify delivery on the selected alternative.
            </div>
          ) : !performanceComparison.after ? (
            <div className="performance-empty-state">
              {performanceComparison.message || "No alternative route is available to compare yet."}
            </div>
          ) : (
            <>
              <div className="performance-route-summary-grid">
                <article className="performance-route-summary performance-route-before">
                  <span className="performance-eyebrow">BASELINE ROUTE</span>
                  <h3>{performanceComparison.before?.path?.join(" → ") || "—"}</h3>
                  <p>Cost {performanceComparison.before?.cost ?? "—"} · Health {performanceComparison.before?.health ?? "—"}/100 · Score {performanceComparison.before?.score ?? "—"}/100</p>
                </article>
                <article className="performance-route-summary performance-route-after">
                  <span className="performance-eyebrow">PROACTIVE ROUTE</span>
                  <h3>{performanceComparison.after.path?.join(" → ") || "—"}</h3>
                  <p>Cost {performanceComparison.after.cost ?? "—"} · Health {performanceComparison.after.health ?? "—"}/100 · Score {performanceComparison.after.score ?? "—"}/100</p>
                </article>
              </div>

              <div className="performance-table-wrap">
                <table className="performance-comparison-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Baseline</th>
                      <th>Proactive Route</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "cost", label: "Route cost", unit: "", lowerBetter: true },
                      { key: "health", label: "Network health", unit: "/100", lowerBetter: false },
                      { key: "latency", label: "Average latency", unit: " ms", lowerBetter: true },
                      { key: "packetLoss", label: "Average packet loss", unit: "%", lowerBetter: true },
                      { key: "congestion", label: "Average congestion", unit: "%", lowerBetter: true },
                      { key: "score", label: "Adaptive score", unit: "/100", lowerBetter: false },
                    ].map((metric) => {
                      const beforeValue = Number(performanceComparison.before?.[metric.key] ?? 0);
                      const afterValue = Number(performanceComparison.after?.[metric.key] ?? 0);
                      const delta = Number((afterValue - beforeValue).toFixed(1));
                      const improved = delta === 0 ? null : (metric.lowerBetter ? delta < 0 : delta > 0);
                      const valueText = (value) => `${Number.isInteger(value) ? value : value.toFixed(1)}${metric.unit}`;
                      const changeText = delta === 0
                        ? "No change"
                        : `${delta > 0 ? "+" : ""}${delta}${metric.unit} · ${improved ? "improved" : "increased"}`;
                      return (
                        <tr key={metric.key}>
                          <td>{metric.label}</td>
                          <td>{valueText(beforeValue)}</td>
                          <td>{valueText(afterValue)}</td>
                          <td className={improved === null ? "performance-neutral" : improved ? "performance-improved" : "performance-degraded"}>{changeText}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={`performance-delivery-result ${performanceComparison.status === "VERIFIED" ? "performance-delivery-success" : ""}`}>
                <div>
                  <span className="performance-eyebrow">PACKET DELIVERY CHECK</span>
                  <strong>{performanceComparison.status === "VERIFIED" ? `Packet #${performanceComparison.deliveredPacketId} delivered successfully` : performanceComparison.status === "APPLIED" ? "Send a packet to verify the proactive route" : "Recommendation prepared; route not applied yet"}</strong>
                  <p>{performanceComparison.status === "VERIFIED"
                    ? `Verified delivery through ${performanceComparison.deliveredRoute?.join(" → ") || performanceComparison.after.path.join(" → ")}.`
                    : performanceComparison.status === "APPLIED"
                    ? "The route comparison is available. Delivery is recorded only after the packet reaches the destination on this exact route."
                    : "These metrics compare the current route with the proposed alternative. Apply the recommendation to change the selected route."}</p>
                </div>
                <span className="performance-delivery-badge">{performanceComparison.packetStatus || "Not tested"}</span>
              </div>
            </>
          )}

          <div className="performance-note">
            Metrics are calculated from the simulator's rule-based, simulated telemetry and route candidates. They demonstrate relative route characteristics; they are not measurements from a physical network.
          </div>

        </section>

        {/* ==========================================
            NETWORK LINKS
        ========================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h2>
                Network Links
              </h2>

              <p>
                View connection status and edit link costs
              </p>

            </div>

          </div>

          <div className="link-list">

            {network.links.map(
              (link) => {
                const linkKey = `${link.source}-${link.destination}`;

                return (
                  <div
                    className="link-item cost-edit-item"
                    key={linkKey}
                  >
                    <span className="cost-edit-connection">
                      {link.source}
                      {" ↔ "}
                      {link.destination}
                    </span>

                    <span className="cost-edit-current">
                      Current cost: <strong>{link.cost}</strong>
                    </span>

                    <span
                      className={
                        link.active
                          ? "link-active"
                          : "link-failed"
                      }
                    >
                      {link.active ? "ACTIVE" : "FAILED"}
                    </span>

                    <div className="cost-edit-controls">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={linkCostDrafts[linkKey] ?? String(link.cost)}
                        onChange={(event) =>
                          setLinkCostDrafts((previous) => ({
                            ...previous,
                            [linkKey]: event.target.value,
                          }))
                        }
                        aria-label={`New cost for link ${link.source} to ${link.destination}`}
                        title={`Enter a positive integer cost for ${link.source} ↔ ${link.destination}`}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="cost-edit-button"
                        onClick={() => updateLinkCost(link)}
                        disabled={loading || !link.active}
                        title={!link.active ? "Recover the link before editing its cost" : "Update this link cost"}
                      >
                        Update Cost
                      </button>
                    </div>
                  </div>
                );
              }
            )}

            {network.links.length === 0 && (
              <p className="empty-message">No links are available to edit.</p>
            )}

          </div>

        </section>

        {/* ==========================================
            NETWORK EVENTS
        ========================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h2>
                Network Events
              </h2>

              <p>
                Current system activity
              </p>

            </div>

          </div>

          <div className="event-log">

            {networkEvents.length === 0 ? (

              <div className="event event-empty">

                <span className="event-time">
                  RESILIO
                </span>

                <span>
                  {message}
                </span>

              </div>

            ) : (

              networkEvents.map(
                (event) => (

                  <div
                    className={`event event-${event.type.toLowerCase()}`}
                    key={event.id}
                  >

                    <span className="event-time">
                      {event.time}
                    </span>

                    <span className="event-type">
                      {event.type}
                    </span>

                    <span className="event-message">
                      {event.text}
                    </span>

                  </div>

                )
              )

            )}

          </div>

        </section>

      </main>

    </div>
  );
}

export default App;