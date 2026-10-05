package com.netheal.graph;

import com.netheal.model.Link;
import com.netheal.model.Router;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class NetworkGraph {

    private final Map<String, Router> routers;
    private final List<Link> links;

    public NetworkGraph() {
        routers = new HashMap<>();
        links = new ArrayList<>();
    }

    public void addRouter(Router router) {
        routers.put(router.getId(), router);
    }

    public void addLink(Link link) {
        links.add(link);
    }

    public Router getRouter(String id) {
        return routers.get(id);
    }

    public List<Router> getRouters() {
        return new ArrayList<>(routers.values());
    }

    public List<Link> getLinks() {
        return new ArrayList<>(links);
    }

    public Link getLink(String router1, String router2) {

        for (Link link : links) {

            boolean forward =
                    link.getSource().getId().equals(router1)
                            && link.getDestination().getId().equals(router2);

            boolean reverse =
                    link.getSource().getId().equals(router2)
                            && link.getDestination().getId().equals(router1);

            if (forward || reverse) {
                return link;
            }
        }

        return null;
    }

    public void displayNetwork() {

        System.out.println("\n===== NETWORK TOPOLOGY =====");

        System.out.println("\nRouters:");

        for (Router router : routers.values()) {
            System.out.println(router);
        }

        System.out.println("\nLinks:");

        for (Link link : links) {
            System.out.println(link);
        }
    }
}