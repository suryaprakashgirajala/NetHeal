package com.netheal.api;

import com.netheal.graph.NetworkGraph;
import com.netheal.model.Link;
import com.netheal.model.Router;
import com.netheal.routing.AStarRouter;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class NetHealApiServer {

    // Use the hosting platform's assigned port when deployed; default to 8080 locally.
    private static final int PORT = Integer.parseInt(
            System.getenv().getOrDefault("PORT", "8080")
    );

    private static NetworkGraph network;

    public static void main(String[] args) throws Exception {

        // Create default network
        network = createNetwork();

        // Create HTTP server
        HttpServer server =
                HttpServer.create(
                        new InetSocketAddress(PORT),
                        0
                );

        // ==========================================
        // API ENDPOINTS
        // ==========================================

        server.createContext(
                "/api/network",
                NetHealApiServer::handleNetwork
        );

        // Switch between the built-in small and large topology presets.
        server.createContext(
                "/api/topology",
                NetHealApiServer::handleTopologyPreset
        );

        server.createContext(
                "/api/route",
                NetHealApiServer::handleRoute
        );

        server.createContext(
                "/api/fail/link",
                NetHealApiServer::handleFailLink
        );

        server.createContext(
                "/api/fail/router",
                NetHealApiServer::handleFailRouter
        );

        server.createContext(
                "/api/recover",
                NetHealApiServer::handleRecover
        );

        server.createContext(
                "/api/reset",
                NetHealApiServer::handleReset
        );

        // Dynamic router creation
        server.createContext(
                "/api/router/add",
                NetHealApiServer::handleAddRouter
        );

        // Remove a router and all links connected to it.
        server.createContext(
                "/api/router/remove",
                NetHealApiServer::handleRemoveRouter
        );

        // Dynamic link creation
        server.createContext(
                "/api/link/add",
                NetHealApiServer::handleAddLink
        );

        // Remove an existing connection.
        server.createContext(
                "/api/link/remove",
                NetHealApiServer::handleRemoveLink
        );

        // Update the cost/weight of an existing link
        server.createContext(
                "/api/link/update-cost",
                NetHealApiServer::handleUpdateLinkCost
        );

        server.setExecutor(null);

        System.out.println("=================================");
        System.out.println("       RESILIO API SERVER");
        System.out.println("=================================");
        System.out.println(
                "Server running at:"
        );
        System.out.println(
                "http://localhost:" + PORT
        );

        server.start();
    }

    // =========================================================
    // LOAD TOPOLOGY PRESET
    // =========================================================

    private static void handleTopologyPreset(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendResponse(exchange, 204, "");
            return;
        }

        Map<String, String> params = getQueryParameters(exchange.getRequestURI());
        String size = params.get("size");

        if ("small".equalsIgnoreCase(size)) {
            network = createSmallNetwork();
            sendResponse(exchange, 200,
                    "{\"success\":true,\"size\":\"small\",\"routerCount\":4,\"linkCount\":4,\"message\":\"Small topology loaded\"}");
            return;
        }

        if ("large".equalsIgnoreCase(size)) {
            network = createNetwork();
            sendResponse(exchange, 200,
                    "{\"success\":true,\"size\":\"large\",\"routerCount\":16,\"linkCount\":25,\"message\":\"Large topology loaded\"}");
            return;
        }

        sendResponse(exchange, 400,
                "{\"error\":\"size must be either small or large\"}");
    }

    // =========================================================
    // NETWORK ENDPOINT
    // =========================================================

    private static void handleNetwork(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        StringBuilder json =
                new StringBuilder();

        json.append("{");

        // ==========================================
        // ROUTERS
        // ==========================================

        json.append("\"routers\":[");

        List<Router> routers =
                network.getRouters();

        for (int i = 0; i < routers.size(); i++) {

            Router router =
                    routers.get(i);

            json.append("{")
                    .append("\"id\":\"")
                    .append(router.getId())
                    .append("\",")
                    .append("\"active\":")
                    .append(router.isActive())
                    .append("}");

            if (i < routers.size() - 1) {
                json.append(",");
            }
        }

        json.append("],");

        // ==========================================
        // LINKS
        // ==========================================

        json.append("\"links\":[");

        List<Link> links =
                network.getLinks();

        for (int i = 0; i < links.size(); i++) {

            Link link =
                    links.get(i);

            json.append("{")
                    .append("\"source\":\"")
                    .append(link.getSource().getId())
                    .append("\",")
                    .append("\"destination\":\"")
                    .append(link.getDestination().getId())
                    .append("\",")
                    .append("\"cost\":")
                    .append(link.getCost())
                    .append(",")
                    .append("\"active\":")
                    .append(link.isActive())
                    .append("}");

            if (i < links.size() - 1) {
                json.append(",");
            }
        }

        json.append("]");

        json.append("}");

        sendResponse(
                exchange,
                200,
                json.toString()
        );
    }

    // =========================================================
    // ROUTING ENDPOINT
    // =========================================================

    private static void handleRoute(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        Map<String, String> params =
                getQueryParameters(
                        exchange.getRequestURI()
                );

        String source =
                params.get("source");

        String destination =
                params.get("destination");

        if (source == null ||
                destination == null) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"source and destination are required\"}"
            );

            return;
        }

        Router sourceRouter =
                network.getRouter(source);

        Router destinationRouter =
                network.getRouter(destination);

        if (sourceRouter == null ||
                destinationRouter == null) {

            sendResponse(
                    exchange,
                    404,
                    "{\"error\":\"Source or destination router not found\"}"
            );

            return;
        }

        List<String> path =
                AStarRouter.findShortestPath(
                        network,
                        source,
                        destination
                );

        int cost = 0;

        if (!path.isEmpty()) {

            cost =
                    AStarRouter.calculatePathCost(
                            network,
                            path
                    );
        }

        String json =
                "{"
                        + "\"source\":\""
                        + source
                        + "\","
                        + "\"destination\":\""
                        + destination
                        + "\","
                        + "\"path\":["
                        + convertListToJson(path)
                        + "],"
                        + "\"cost\":"
                        + cost
                        + ","
                        + "\"available\":"
                        + !path.isEmpty()
                        + "}";

        sendResponse(
                exchange,
                200,
                json
        );
    }

    // =========================================================
    // FAIL LINK
    // =========================================================

    private static void handleFailLink(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        Map<String, String> params =
                getQueryParameters(
                        exchange.getRequestURI()
                );

        String source =
                params.get("source");

        String destination =
                params.get("destination");

        if (source == null ||
                destination == null) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"source and destination are required\"}"
            );

            return;
        }

        Link link =
                network.getLink(
                        source,
                        destination
                );

        if (link == null) {

            sendResponse(
                    exchange,
                    404,
                    "{\"error\":\"Link not found\"}"
            );

            return;
        }

        link.fail();

        String json =
                "{"
                        + "\"success\":true,"
                        + "\"message\":\"Link "
                        + source
                        + "-"
                        + destination
                        + " failed\""
                        + "}";

        sendResponse(
                exchange,
                200,
                json
        );
    }

    // =========================================================
    // FAIL ROUTER
    // =========================================================

    private static void handleFailRouter(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        Map<String, String> params =
                getQueryParameters(
                        exchange.getRequestURI()
                );

        String id =
                params.get("id");

        if (id == null ||
                id.isBlank()) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"router id is required\"}"
            );

            return;
        }

        Router router =
                network.getRouter(id);

        if (router == null) {

            sendResponse(
                    exchange,
                    404,
                    "{\"error\":\"Router not found\"}"
            );

            return;
        }

        router.fail();

        String json =
                "{"
                        + "\"success\":true,"
                        + "\"message\":\"Router "
                        + id
                        + " failed\""
                        + "}";

        sendResponse(
                exchange,
                200,
                json
        );
    }

    // =========================================================
    // RECOVER / FIND NEW ROUTE
    // =========================================================

    private static void handleRecover(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        Map<String, String> params =
                getQueryParameters(
                        exchange.getRequestURI()
                );

        String source =
                params.get("source");

        String destination =
                params.get("destination");

        if (source == null ||
                destination == null) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"source and destination are required\"}"
            );

            return;
        }

        long start =
                System.nanoTime();

        List<String> route =
                AStarRouter.findShortestPath(
                        network,
                        source,
                        destination
                );

        long end =
                System.nanoTime();

        long recoveryTime =
                (end - start) / 1_000_000;

        int cost = 0;

        if (!route.isEmpty()) {

            cost =
                    AStarRouter.calculatePathCost(
                            network,
                            route
                    );
        }

        String json =
                "{"
                        + "\"success\":"
                        + !route.isEmpty()
                        + ","
                        + "\"path\":["
                        + convertListToJson(route)
                        + "],"
                        + "\"cost\":"
                        + cost
                        + ","
                        + "\"recoveryTimeMs\":"
                        + recoveryTime
                        + "}";

        sendResponse(
                exchange,
                200,
                json
        );
    }

    // =========================================================
    // RESET NETWORK
    // =========================================================

    private static void handleReset(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        Map<String, String> params = getQueryParameters(exchange.getRequestURI());
        String size = params.get("size");
        boolean small = "small".equalsIgnoreCase(size);
        network = small ? createSmallNetwork() : createNetwork();

        sendResponse(
                exchange,
                200,
                "{\"success\":true,\"size\":\""
                        + (small ? "small" : "large")
                        + "\",\"message\":\"Network reset\"}"
        );
    }

    // =========================================================
    // ADD ROUTER
    // =========================================================

    private static void handleAddRouter(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        Map<String, String> params =
                getQueryParameters(
                        exchange.getRequestURI()
                );

        String id =
                params.get("id");

        if (id == null ||
                id.isBlank()) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"router id is required\"}"
            );

            return;
        }

        if (network.getRouter(id) != null) {

            sendResponse(
                    exchange,
                    409,
                    "{\"error\":\"Router already exists\"}"
            );

            return;
        }

        Router router =
                new Router(id);

        network.addRouter(router);

        String json =
                "{"
                        + "\"success\":true,"
                        + "\"message\":\"Router "
                        + id
                        + " added\","
                        + "\"router\":{"
                        + "\"id\":\""
                        + id
                        + "\","
                        + "\"active\":true"
                        + "}"
                        + "}";

        sendResponse(
                exchange,
                200,
                json
        );
    }

    // =========================================================
    // REMOVE ROUTER
    // =========================================================

    private static void handleRemoveRouter(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendResponse(exchange, 204, "");
            return;
        }

        Map<String, String> params = getQueryParameters(exchange.getRequestURI());
        String id = params.get("id");
        if (id == null || id.isBlank()) {
            sendResponse(exchange, 400,
                    "{\"error\":\"router id is required\"}");
            return;
        }

        Router router = network.getRouter(id);
        if (router == null) {
            sendResponse(exchange, 404,
                    "{\"error\":\"Router not found\"}");
            return;
        }

        if (network.getRouters().size() <= 2) {
            sendResponse(exchange, 409,
                    "{\"error\":\"At least two routers must remain in the network\"}");
            return;
        }

        int previousLinkCount = network.getLinks().size();
        network.removeRouter(id);
        int removedLinks = previousLinkCount - network.getLinks().size();

        sendResponse(exchange, 200,
                "{\"success\":true,\"router\":\"" + id
                        + "\",\"removedLinks\":" + removedLinks
                        + ",\"routerCount\":" + network.getRouters().size()
                        + ",\"linkCount\":" + network.getLinks().size()
                        + ",\"message\":\"Router removed with its connected links\"}");
    }

    // =========================================================
    // ADD LINK
    // =========================================================

    private static void handleAddLink(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {

            sendResponse(
                    exchange,
                    204,
                    ""
            );

            return;
        }

        Map<String, String> params =
                getQueryParameters(
                        exchange.getRequestURI()
                );

        String source =
                params.get("source");

        String destination =
                params.get("destination");

        String costText =
                params.get("cost");

        // Check required parameters
        if (source == null ||
                destination == null ||
                costText == null) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"source, destination and cost are required\"}"
            );

            return;
        }

        // Find source router
        Router sourceRouter =
                network.getRouter(source);

        // Find destination router
        Router destinationRouter =
                network.getRouter(destination);

        if (sourceRouter == null ||
                destinationRouter == null) {

            sendResponse(
                    exchange,
                    404,
                    "{\"error\":\"Source or destination router not found\"}"
            );

            return;
        }

        // Prevent self-loop
        if (source.equals(destination)) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"A router cannot connect to itself\"}"
            );

            return;
        }

        // Parse cost
        int cost;

        try {

            cost =
                    Integer.parseInt(costText);

        } catch (NumberFormatException e) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Cost must be a valid integer\"}"
            );

            return;
        }

        // Cost must be positive
        if (cost <= 0) {

            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Cost must be greater than zero\"}"
            );

            return;
        }

        // Check duplicate link
        if (network.getLink(
                source,
                destination
        ) != null) {

            sendResponse(
                    exchange,
                    409,
                    "{\"error\":\"Link already exists\"}"
            );

            return;
        }

        // Create link
        Link link =
                new Link(
                        sourceRouter,
                        destinationRouter,
                        cost
                );

        // Add link to network
        network.addLink(link);

        String json =
                "{"
                        + "\"success\":true,"
                        + "\"message\":\"Link "
                        + source
                        + "-"
                        + destination
                        + " added\","
                        + "\"link\":{"
                        + "\"source\":\""
                        + source
                        + "\","
                        + "\"destination\":\""
                        + destination
                        + "\","
                        + "\"cost\":"
                        + cost
                        + ","
                        + "\"active\":true"
                        + "}"
                        + "}";

        sendResponse(
                exchange,
                200,
                json
        );
    }

    // =========================================================
    // REMOVE LINK
    // =========================================================

    private static void handleRemoveLink(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendResponse(exchange, 204, "");
            return;
        }

        Map<String, String> params = getQueryParameters(exchange.getRequestURI());
        String source = params.get("source");
        String destination = params.get("destination");

        if (source == null || source.isBlank()
                || destination == null || destination.isBlank()) {
            sendResponse(exchange, 400,
                    "{\"error\":\"source and destination are required\"}");
            return;
        }

        Link link = network.getLink(source, destination);
        if (link == null) {
            sendResponse(exchange, 404,
                    "{\"error\":\"Link not found\"}");
            return;
        }

        network.removeLink(source, destination);
        sendResponse(exchange, 200,
                "{\"success\":true,\"source\":\"" + source
                        + "\",\"destination\":\"" + destination
                        + "\",\"linkCount\":" + network.getLinks().size()
                        + ",\"message\":\"Link removed\"}");
    }

    // =========================================================
    // UPDATE EXISTING LINK COST
    // =========================================================

    private static void handleUpdateLinkCost(
            HttpExchange exchange) throws IOException {

        addCorsHeaders(exchange);

        if ("OPTIONS".equalsIgnoreCase(
                exchange.getRequestMethod())) {
            sendResponse(exchange, 204, "");
            return;
        }

        Map<String, String> params =
                getQueryParameters(exchange.getRequestURI());

        String source = params.get("source");
        String destination = params.get("destination");
        String costText = params.get("cost");

        if (source == null || source.isBlank()
                || destination == null || destination.isBlank()
                || costText == null || costText.isBlank()) {
            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"source, destination and cost are required\"}"
            );
            return;
        }

        Link link = network.getLink(source, destination);
        if (link == null) {
            sendResponse(
                    exchange,
                    404,
                    "{\"error\":\"Link not found\"}"
            );
            return;
        }

        final int cost;
        try {
            cost = Integer.parseInt(costText);
        } catch (NumberFormatException e) {
            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Cost must be a valid integer\"}"
            );
            return;
        }

        if (cost <= 0) {
            sendResponse(
                    exchange,
                    400,
                    "{\"error\":\"Cost must be greater than zero\"}"
            );
            return;
        }

        int previousCost = link.getCost();
        link.setCost(cost);

        String json = "{"
                + "\"success\":true,"
                + "\"message\":\"Link cost updated\","
                + "\"previousCost\":" + previousCost + ","
                + "\"cost\":" + cost
                + "}";

        sendResponse(exchange, 200, json);
    }

    // =========================================================
    // CREATE DEFAULT NETWORK
    // =========================================================

    private static NetworkGraph createSmallNetwork() {
        NetworkGraph graph = new NetworkGraph();
        Map<String, Router> routers = new HashMap<>();

        for (String id : List.of("A", "B", "C", "D")) {
            Router router = new Router(id);
            routers.put(id, router);
            graph.addRouter(router);
        }

        connect(graph, routers, "A", "B", 2);
        connect(graph, routers, "A", "C", 4);
        connect(graph, routers, "B", "D", 3);
        connect(graph, routers, "C", "D", 1);
        return graph;
    }

    private static NetworkGraph createNetwork() {

        NetworkGraph graph = new NetworkGraph();
        Map<String, Router> routers = new HashMap<>();

        // Create routers A-P in a predictable insertion order. NetworkGraph
        // uses LinkedHashMap so the frontend dropdowns and default endpoints
        // consistently list A first and P last.
        for (char label = 'A'; label <= 'P'; label++) {
            String id = String.valueOf(label);
            Router router = new Router(id);
            routers.put(id, router);
            graph.addRouter(router);
        }

        // 25 bidirectional links with several alternative paths from A to P.
        // The original Review 1 links A-B, A-C, B-D and C-D are retained.
        connect(graph, routers, "A", "B", 2);
        connect(graph, routers, "A", "C", 4);
        connect(graph, routers, "B", "D", 3);
        connect(graph, routers, "C", "D", 1);
        connect(graph, routers, "A", "E", 3);
        connect(graph, routers, "B", "F", 2);
        connect(graph, routers, "C", "G", 2);
        connect(graph, routers, "D", "E", 2);
        connect(graph, routers, "D", "H", 4);
        connect(graph, routers, "E", "F", 2);
        connect(graph, routers, "E", "I", 2);
        connect(graph, routers, "F", "I", 2);
        connect(graph, routers, "F", "J", 3);
        connect(graph, routers, "G", "J", 2);
        connect(graph, routers, "G", "K", 4);
        connect(graph, routers, "H", "L", 3);
        connect(graph, routers, "I", "K", 3);
        connect(graph, routers, "I", "M", 2);
        connect(graph, routers, "J", "M", 2);
        connect(graph, routers, "K", "N", 3);
        connect(graph, routers, "L", "M", 2);
        connect(graph, routers, "L", "O", 4);
        connect(graph, routers, "M", "P", 3);
        connect(graph, routers, "N", "P", 2);
        connect(graph, routers, "O", "P", 2);

        return graph;
    }

    private static void connect(
            NetworkGraph graph,
            Map<String, Router> routers,
            String sourceId,
            String destinationId,
            int cost) {

        Router source = routers.get(sourceId);
        Router destination = routers.get(destinationId);
        if (source == null || destination == null) {
            throw new IllegalArgumentException(
                    "Unknown router in default topology: "
                            + sourceId + "-" + destinationId);
        }
        graph.addLink(new Link(source, destination, cost));
    }

    // =========================================================
    // QUERY PARAMETERS
    // =========================================================

    private static Map<String, String>
    getQueryParameters(URI uri) {

        Map<String, String> result =
                new HashMap<>();

        String query =
                uri.getRawQuery();

        if (query == null ||
                query.isEmpty()) {

            return result;
        }

        for (String pair :
                query.split("&")) {

            String[] parts =
                    pair.split("=", 2);

            String key =
                    URLDecoder.decode(
                            parts[0],
                            StandardCharsets.UTF_8
                    );

            String value =
                    parts.length > 1
                            ? URLDecoder.decode(
                            parts[1],
                            StandardCharsets.UTF_8
                    )
                            : "";

            result.put(
                    key,
                    value
            );
        }

        return result;
    }

    // =========================================================
    // JSON ARRAY HELPER
    // =========================================================

    private static String convertListToJson(
            List<String> values) {

        StringBuilder result =
                new StringBuilder();

        for (int i = 0;
             i < values.size();
             i++) {

            result.append("\"")
                    .append(values.get(i))
                    .append("\"");

            if (i < values.size() - 1) {
                result.append(",");
            }
        }

        return result.toString();
    }

    // =========================================================
    // CORS
    // =========================================================

    private static void addCorsHeaders(
            HttpExchange exchange) {

        exchange.getResponseHeaders()
                .set(
                        "Access-Control-Allow-Origin",
                        "*"
                );

        exchange.getResponseHeaders()
                .set(
                        "Access-Control-Allow-Methods",
                        "GET, OPTIONS"
                );

        exchange.getResponseHeaders()
                .set(
                        "Access-Control-Allow-Headers",
                        "Content-Type"
                );
    }

    // =========================================================
    // RESPONSE
    // =========================================================

    private static void sendResponse(
            HttpExchange exchange,
            int status,
            String response) throws IOException {

        byte[] bytes =
                response.getBytes(
                        StandardCharsets.UTF_8
                );

        exchange.getResponseHeaders()
                .set(
                        "Content-Type",
                        "application/json"
                );

        exchange.sendResponseHeaders(
                status,
                bytes.length
        );

        try (OutputStream output =
                     exchange.getResponseBody()) {

            output.write(bytes);
        }
    }
}