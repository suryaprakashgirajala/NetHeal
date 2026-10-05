package com.netheal.api;

import com.netheal.graph.NetworkGraph;
import com.netheal.model.Link;
import com.netheal.model.Router;
import com.netheal.routing.DijkstraRouter;

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

    private static final int PORT = 8080;

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

        // Dynamic link creation
        server.createContext(
                "/api/link/add",
                NetHealApiServer::handleAddLink
        );

        server.setExecutor(null);

        System.out.println("=================================");
        System.out.println("       NETHEAL API SERVER");
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
                DijkstraRouter.findShortestPath(
                        network,
                        source,
                        destination
                );

        int cost = 0;

        if (!path.isEmpty()) {

            cost =
                    DijkstraRouter.calculatePathCost(
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
                DijkstraRouter.findShortestPath(
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
                    DijkstraRouter.calculatePathCost(
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

        network =
                createNetwork();

        sendResponse(
                exchange,
                200,
                "{\"success\":true,\"message\":\"Network reset\"}"
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
    // CREATE DEFAULT NETWORK
    // =========================================================

    private static NetworkGraph createNetwork() {

        NetworkGraph graph =
                new NetworkGraph();

        Router A =
                new Router("A");

        Router B =
                new Router("B");

        Router C =
                new Router("C");

        Router D =
                new Router("D");

        graph.addRouter(A);
        graph.addRouter(B);
        graph.addRouter(C);
        graph.addRouter(D);

        graph.addLink(
                new Link(
                        A,
                        B,
                        2
                )
        );

        graph.addLink(
                new Link(
                        A,
                        C,
                        4
                )
        );

        graph.addLink(
                new Link(
                        B,
                        D,
                        3
                )
        );

        graph.addLink(
                new Link(
                        C,
                        D,
                        1
                )
        );

        return graph;
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