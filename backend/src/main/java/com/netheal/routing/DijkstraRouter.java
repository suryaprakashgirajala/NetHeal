package com.netheal.routing;

import com.netheal.graph.NetworkGraph;
import com.netheal.model.Link;
import com.netheal.model.Router;

import java.util.*;

public class DijkstraRouter {

    public static List<String> findShortestPath(
            NetworkGraph network,
            String sourceId,
            String destinationId) {

        Map<String, Integer> distances = new HashMap<>();
        Map<String, String> previous = new HashMap<>();

        PriorityQueue<Node> queue =
                new PriorityQueue<>(Comparator.comparingInt(n -> n.distance));

        // Initialize distances
        for (Router router : network.getRouters()) {
            distances.put(router.getId(), Integer.MAX_VALUE);
        }

        distances.put(sourceId, 0);
        queue.add(new Node(sourceId, 0));

        while (!queue.isEmpty()) {

            Node current = queue.poll();

            String currentId = current.routerId;

            // Ignore outdated queue entries
            if (current.distance > distances.get(currentId)) {
                continue;
            }

            // Stop when destination is reached
            if (currentId.equals(destinationId)) {
                break;
            }

            Router currentRouter = network.getRouter(currentId);

            // Ignore failed routers
            if (!currentRouter.isActive()) {
                continue;
            }

            for (Link link : network.getLinks()) {

                // Ignore failed links
                if (!link.isActive()) {
                    continue;
                }

                Router neighbor = null;

                if (link.getSource().getId().equals(currentId)) {
                    neighbor = link.getDestination();
                } else if (link.getDestination().getId().equals(currentId)) {
                    neighbor = link.getSource();
                }

                if (neighbor == null || !neighbor.isActive()) {
                    continue;
                }

                String neighborId = neighbor.getId();

                int newDistance =
                        distances.get(currentId) + link.getCost();

                if (newDistance < distances.get(neighborId)) {

                    distances.put(neighborId, newDistance);
                    previous.put(neighborId, currentId);

                    queue.add(
                            new Node(neighborId, newDistance)
                    );
                }
            }
        }

        // Destination unreachable
        if (distances.get(destinationId) == null ||
                distances.get(destinationId) == Integer.MAX_VALUE) {

            return new ArrayList<>();
        }

        // Reconstruct path
        LinkedList<String> path = new LinkedList<>();

        String current = destinationId;

        while (current != null) {
            path.addFirst(current);
            current = previous.get(current);
        }

        return path;
    }
    public static int calculatePathCost(
        NetworkGraph network,
        List<String> path) {

    if (path == null || path.size() < 2) {
        return 0;
    }

    int totalCost = 0;

    for (int i = 0; i < path.size() - 1; i++) {

        String currentId = path.get(i);
        String nextId = path.get(i + 1);

        for (Link link : network.getLinks()) {

            boolean matchingLink =
                    (link.getSource().getId().equals(currentId)
                            && link.getDestination().getId().equals(nextId))
                    ||
                    (link.getSource().getId().equals(nextId)
                            && link.getDestination().getId().equals(currentId));

            if (matchingLink && link.isActive()) {
                totalCost += link.getCost();
                break;
            }
        }
    }

    return totalCost;
}

    private static class Node {

        String routerId;
        int distance;

        Node(String routerId, int distance) {
            this.routerId = routerId;
            this.distance = distance;
        }
    }
}