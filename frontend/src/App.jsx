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

  // Prevent the self-healing demo from injecting more than one
  // automatic failure during a single packet transmission. The actual
  // failed link is selected dynamically from the live topology.
  const selfHealFailureInjected = useRef(false);

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

      } else {

        setRoute([]);

        setRouteCost(0);

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
    const demoRoute = route.slice();

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
      )}. Resilio will dynamically select a recoverable link failure.`
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

          const recoveredRoute = routeData.path;

          setRoute(recoveredRoute);
          setRouteCost(routeData.cost);
          setPacketRoute(recoveredRoute);
          setPacketStep(0);
          setPacketProgress(0);
          setHealingInProgress(false);
          setRecoveryCount((count) => count + 1);
          setHealingMessage(
            `Alternate route found: ${recoveredRoute.join(
              " → "
            )}`
          );
          setPacketStatus("TRANSMITTING");
          setPacketActive(true);

          setMessage(
            `✓ Failure detected. Alternate route found: ${recoveredRoute.join(
              " → "
            )}. Packet ${packetNumber} is continuing.`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "ROUTE",
            `Alternate route found: ${recoveredRoute.join(" → ")} (cost ${routeData.cost}).`
          );

          appendNetworkEvent(
            setNetworkEvents,
            "HEALING",
            `Packet ${packetNumber} rerouted successfully. Continuing transmission.`
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

        <div>

          <h1>
            Resilio
          </h1>

          <p>
            Intelligent Self-Healing Network Simulator
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
                nodes={layoutedNodes}
                edges={layoutedEdges}
                fitView
                fitViewOptions={{
                  padding: 0.18,
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
            NETWORK LINKS
        ========================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h2>
                Network Links
              </h2>

              <p>
                Current connection status
              </p>

            </div>

          </div>

          <div className="link-list">

            {network.links.map(
              (link) => (

                <div
                  className="link-item"
                  key={`${link.source}-${link.destination}`}
                >

                  <span>
                    {link.source}
                    {" ↔ "}
                    {link.destination}
                  </span>

                  <span>
                    Cost: {link.cost}
                  </span>

                  <span
                    className={
                      link.active
                        ? "link-active"
                        : "link-failed"
                    }
                  >
                    {link.active
                      ? "ACTIVE"
                      : "FAILED"}
                  </span>

                </div>

              )
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