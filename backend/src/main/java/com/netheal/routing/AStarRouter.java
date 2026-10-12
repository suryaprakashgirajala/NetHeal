package com.netheal.routing;

import com.netheal.graph.NetworkGraph;
import com.netheal.model.Link;
import com.netheal.model.Router;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

/**
 * A* path finder for the Resilio network simulator.
 *
 * The graph uses positive link costs. Since the current simulator does not
 * assign geographic coordinates to routers, the heuristic is topology-based:
 * shortest hop count to the destination (ignoring weights) multiplied by the
 * minimum active link cost. This is an admissible lower bound on the remaining
 * path cost, so A* remains optimal for the weighted graph.
 */
public final class AStarRouter {

    private AStarRouter() {
        // Utility class.
    }

    private static final class State {
        private final String routerId;
        private final int gScore;
        private final int fScore;

        private State(String routerId, int gScore, int fScore) {
            this.routerId = routerId;
            this.gScore = gScore;
            this.fScore = fScore;
        }
    }

    private static final class Neighbor {
        private final String routerId;
        private final int cost;

        private Neighbor(String routerId, int cost) {
            this.routerId = routerId;
            this.cost = cost;
        }
    }

    /**
     * Finds the lowest-cost active path from source to destination using A*.
     * Failed/inactive routers and links are ignored.
     */
    public static List<String> findShortestPath(
            NetworkGraph network,
            String source,
            String destination) {

        if (network == null || source == null || destination == null) {
            return Collections.emptyList();
        }

        Router sourceRouter = network.getRouter(source);
        Router destinationRouter = network.getRouter(destination);

        if (sourceRouter == null
                || destinationRouter == null
                || !sourceRouter.isActive()
                || !destinationRouter.isActive()) {
            return Collections.emptyList();
        }

        if (source.equals(destination)) {
            return Collections.singletonList(source);
        }

        Map<String, List<Neighbor>> adjacency = buildAdjacency(network);
        if (!adjacency.containsKey(source) || !adjacency.containsKey(destination)) {
            return Collections.emptyList();
        }

        int minimumActiveLinkCost = findMinimumActiveLinkCost(network);
        if (minimumActiveLinkCost == Integer.MAX_VALUE) {
            return Collections.emptyList();
        }

        // Precompute an unweighted hop-distance-to-goal map for an admissible
        // and consistent heuristic: h(n) = hopDistance(n, goal) * minEdgeCost.
        Map<String, Integer> hopDistance = computeHopDistances(
                adjacency,
                destination
        );

        Map<String, Integer> gScore = new HashMap<>();
        Map<String, String> cameFrom = new HashMap<>();
        Set<String> closed = new HashSet<>();

        PriorityQueue<State> open = new PriorityQueue<>(
                Comparator.comparingInt((State s) -> s.fScore)
                        .thenComparingInt(s -> s.gScore)
                        .thenComparing(s -> s.routerId)
        );

        gScore.put(source, 0);
        int startHeuristic = heuristic(source, hopDistance, minimumActiveLinkCost);
        open.add(new State(source, 0, startHeuristic));

        while (!open.isEmpty()) {
            State current = open.poll();

            Integer bestKnownG = gScore.get(current.routerId);
            if (bestKnownG == null || current.gScore != bestKnownG) {
                continue; // Stale queue entry.
            }

            if (current.routerId.equals(destination)) {
                return reconstructPath(cameFrom, destination);
            }

            if (!closed.add(current.routerId)) {
                continue;
            }

            List<Neighbor> neighbors = adjacency.getOrDefault(
                    current.routerId,
                    Collections.emptyList()
            );

            for (Neighbor neighbor : neighbors) {
                if (closed.contains(neighbor.routerId)) {
                    continue;
                }

                int tentativeG = safeAdd(current.gScore, neighbor.cost);
                int oldG = gScore.getOrDefault(neighbor.routerId, Integer.MAX_VALUE);

                if (tentativeG < oldG) {
                    cameFrom.put(neighbor.routerId, current.routerId);
                    gScore.put(neighbor.routerId, tentativeG);

                    int h = heuristic(
                            neighbor.routerId,
                            hopDistance,
                            minimumActiveLinkCost
                    );

                    open.add(new State(
                            neighbor.routerId,
                            tentativeG,
                            safeAdd(tentativeG, h)
                    ));
                }
            }
        }

        return Collections.emptyList();
    }

    /**
     * Calculates the total link cost of a route.
     */
    public static int calculatePathCost(
            NetworkGraph network,
            List<String> path) {

        if (network == null || path == null || path.size() < 2) {
            return 0;
        }

        int total = 0;

        for (int i = 0; i < path.size() - 1; i++) {
            Link link = findLink(
                    network,
                    path.get(i),
                    path.get(i + 1)
            );

            if (link == null) {
                return 0;
            }

            total = safeAdd(total, link.getCost());
        }

        return total;
    }

    public static String getAlgorithmName() {
        return "A* Search";
    }

    private static Map<String, List<Neighbor>> buildAdjacency(
            NetworkGraph network) {

        Map<String, List<Neighbor>> adjacency = new HashMap<>();

        for (Router router : network.getRouters()) {
            if (router != null && router.isActive()) {
                adjacency.put(router.getId(), new ArrayList<>());
            }
        }

        for (Link link : network.getLinks()) {
            if (link == null || !link.isActive()) {
                continue;
            }

            Router source = link.getSource();
            Router destination = link.getDestination();

            if (source == null || destination == null
                    || !source.isActive() || !destination.isActive()) {
                continue;
            }

            String sourceId = source.getId();
            String destinationId = destination.getId();

            if (!adjacency.containsKey(sourceId)
                    || !adjacency.containsKey(destinationId)) {
                continue;
            }

            // NetHeal models its links as bidirectional.
            adjacency.get(sourceId).add(
                    new Neighbor(destinationId, link.getCost())
            );
            adjacency.get(destinationId).add(
                    new Neighbor(sourceId, link.getCost())
            );
        }

        return adjacency;
    }

    private static int findMinimumActiveLinkCost(NetworkGraph network) {
        int minimum = Integer.MAX_VALUE;

        for (Link link : network.getLinks()) {
            if (link == null || !link.isActive()) {
                continue;
            }

            Router source = link.getSource();
            Router destination = link.getDestination();

            if (source == null || destination == null
                    || !source.isActive() || !destination.isActive()) {
                continue;
            }

            int cost = link.getCost();
            if (cost > 0 && cost < minimum) {
                minimum = cost;
            }
        }

        return minimum;
    }

    private static Map<String, Integer> computeHopDistances(
            Map<String, List<Neighbor>> adjacency,
            String destination) {

        Map<String, Integer> distance = new HashMap<>();
        ArrayDeque<String> queue = new ArrayDeque<>();

        distance.put(destination, 0);
        queue.add(destination);

        while (!queue.isEmpty()) {
            String current = queue.removeFirst();
            int nextDistance = distance.get(current) + 1;

            for (Neighbor neighbor : adjacency.getOrDefault(
                    current,
                    Collections.emptyList())) {
                if (!distance.containsKey(neighbor.routerId)) {
                    distance.put(neighbor.routerId, nextDistance);
                    queue.addLast(neighbor.routerId);
                }
            }
        }

        return distance;
    }

    private static int heuristic(
            String routerId,
            Map<String, Integer> hopDistance,
            int minimumActiveLinkCost) {

        Integer hops = hopDistance.get(routerId);
        if (hops == null) {
            return 0;
        }

        return safeMultiply(hops, minimumActiveLinkCost);
    }

    private static List<String> reconstructPath(
            Map<String, String> cameFrom,
            String destination) {

        List<String> reversed = new ArrayList<>();
        String current = destination;

        while (current != null) {
            reversed.add(current);
            current = cameFrom.get(current);
        }

        Collections.reverse(reversed);
        return reversed;
    }

    private static Link findLink(
            NetworkGraph network,
            String a,
            String b) {

        for (Link link : network.getLinks()) {
            if (link == null) {
                continue;
            }

            String sourceId = link.getSource().getId();
            String destinationId = link.getDestination().getId();

            boolean sameDirection = sourceId.equals(a)
                    && destinationId.equals(b);
            boolean reverseDirection = sourceId.equals(b)
                    && destinationId.equals(a);

            if (sameDirection || reverseDirection) {
                return link;
            }
        }

        return null;
    }

    private static int safeAdd(int a, int b) {
        if (b > 0 && a > Integer.MAX_VALUE - b) {
            return Integer.MAX_VALUE;
        }
        return a + b;
    }

    private static int safeMultiply(int a, int b) {
        if (a == 0 || b == 0) {
            return 0;
        }
        if (a > Integer.MAX_VALUE / b) {
            return Integer.MAX_VALUE;
        }
        return a * b;
    }
}
