# Resilio

**Intelligent Network Fault Analysis and Adaptive Recovery System**

Resilio is an educational network-simulation project that visualizes a network topology, calculates routes with the A* search algorithm, simulates router/link failures, and demonstrates adaptive recovery decisions. It combines a React-based interactive dashboard with a Java HTTP API.

> **Simulation note:** Link/router health telemetry (such as latency, packet loss, congestion, and health scores) is simulated by the application. Risk assessment is rule-based; this project does not claim to collect telemetry from physical routers or use a trained machine-learning model.

## Features

- **Interactive network topology:** View routers and connections in a React Flow graph.
- **A* route calculation:** Find a lowest-cost available path using active links and positive link weights.
- **Editable link costs:** Change the cost of an existing connection from the dashboard and recalculate routes.
- **Failure simulation:** Mark a link or router as failed and observe the impact on connectivity.
- **Recovery and rerouting:** Find an alternative route after a simulated failure.
- **Proactive recovery analysis:** Compare the current route with an alternative while considering simulated link-health metrics.
- **Health and fault analysis:** Display simulated latency, packet loss, congestion, health, and rule-based risk information.
- **Packet animation and performance views:** Visualize a packet travelling along a selected route and inspect the application's route/performance summaries.
- **Dynamic topology controls:** Add routers and links, with costs assigned to newly created links.
- **Reset and refresh controls:** Restore or refresh the demonstration topology.

## Technology Stack

- **Frontend:** React, Vite, JavaScript, CSS, `@xyflow/react`
- **Backend:** Java, built-in `com.sun.net.httpserver.HttpServer`
- **Routing:** A* search with a topology-based admissible heuristic
- **Development tools:** Node.js/npm, JDK, Git

## Project Structure

```text
NetHeal/
├── backend/
│   └── src/main/java/com/netheal/
│       ├── api/                 # HTTP API server
│       ├── graph/               # Network graph representation
│       ├── model/               # Router and Link models
│       ├── recovery/            # Self-healing/recovery logic
│       ├── routing/             # A* route finding
│       └── simulation/          # Packet/network simulation
├── frontend/
│   ├── public/                  # Resilio logo and browser icon
│   └── src/                     # React application and styles
└── README.md
```

The local folder/repository may still be named `NetHeal`; the current application branding is **Resilio**.

## Prerequisites

Install the following before running the project:

- A Java Development Kit (JDK) with `javac` and `java` available in PowerShell.
- Node.js and npm.
- Git (optional, for version control).

Verify installations:

```powershell
java -version
javac -version
node --version
npm --version
```

## Run the Application on Windows

Run the backend and frontend in **two separate PowerShell terminals**.

### 1. Start the Java backend

From the project root:

```powershell
cd backend
if (Test-Path ".\out") { Remove-Item ".\out" -Recurse -Force }
New-Item -ItemType Directory -Path ".\out"
javac -d out (Get-ChildItem -Recurse -Filter *.java | ForEach-Object FullName)
java -cp out com.netheal.api.NetHealApiServer
```

The API server runs at `http://localhost:8080`.

### 2. Start the React frontend

Open a second PowerShell terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

Keep both terminals running while using the application. If port `8080` is already occupied, stop the old backend process before starting another one.

## Default Demonstration Network

The default topology contains four routers and four bidirectional links:

| Link | Initial cost |
|---|---:|
| A–B | 2 |
| A–C | 4 |
| B–D | 3 |
| C–D | 1 |

For source A and destination D, the initial route costs are:

- A → B → D = 2 + 3 = **5**
- A → C → D = 4 + 1 = **5**

Changing the A–B cost to 10 makes A → B → D cost 13, while A → C → D remains cost 5. Route selection can also be affected by active/failed links and, in health-aware/proactive analyses, simulated link-health metrics.

## API Overview

The Java server exposes local API routes used by the frontend. The main routes include:

| Endpoint | Purpose |
|---|---|
| `GET /api/network` | Read the current routers, links, costs, and statuses |
| `GET /api/route?source=A&destination=D` | Calculate a route and its cost |
| `GET /api/fail/link?source=A&destination=B` | Simulate failure of a link |
| `GET /api/fail/router?id=B` | Simulate failure of a router |
| `GET /api/recover?source=A&destination=D` | Find an available route for recovery |
| `GET /api/reset` | Recreate the default network |
| `GET /api/router/add?id=E` | Add a router |
| `GET /api/link/add?source=A&destination=E&cost=2` | Add a link with a positive cost |
| `GET /api/link/update-cost?source=A&destination=B&cost=10` | Update an existing link's positive cost |

These endpoints are intended for local project demonstration, not exposed as a production or internet-facing service.

## A* Routing Approach

Resilio uses A* search to prioritize candidate routers using `f(n) = g(n) + h(n)`, where:

- `g(n)` is the known accumulated link cost from the source to the current router.
- `h(n)` estimates the remaining cost to the destination.

Since the simulation does not assign geographic coordinates to routers, the implementation uses a topology-based heuristic: the minimum active-link cost multiplied by the unweighted minimum hop distance to the destination. This is intended as an admissible lower bound when link costs are positive. Inactive links and routers are excluded from route search.

## Suggested Test Workflow

1. Start the backend and frontend.
2. Confirm the default topology is visible.
3. Choose source A and destination D, then find a route.
4. Change A–B's cost from 2 to 10 and update the cost.
5. Find the route again and confirm that the new cost is used.
6. Simulate a link failure, then confirm the application finds an alternative route when one is available.
7. Try Proactive Recovery and review its recommendation alongside the displayed cost and simulated health metrics.
8. Reset the network and confirm the topology remains visible.

## Limitations

- The project is a simulator; the default topology and telemetry are not sourced from a real network.
- Health values and risk scores are simulated/rule-based and depend on the application's current logic.
- This is a local educational prototype. Do not expose its unauthenticated API server to an untrusted network.

## Future Improvements

Possible extensions include integration with real telemetry sources, configurable routing policies, automated unit/integration tests, authentication for API operations, and exportable experiment reports.

## License

No license is specified yet. Add a license file before redistributing the project under open-source terms.
