package com.netheal.recovery;

import com.netheal.graph.NetworkGraph;
import com.netheal.model.Link;
import com.netheal.model.Router;

import java.util.ArrayList;
import java.util.List;

public class FailureDetector {

    private final NetworkGraph network;

    public FailureDetector(NetworkGraph network) {
        this.network = network;
    }

    public List<Router> getFailedRouters() {

        List<Router> failedRouters = new ArrayList<>();

        for (Router router : network.getRouters()) {
            if (!router.isActive()) {
                failedRouters.add(router);
            }
        }

        return failedRouters;
    }

    public List<Link> getFailedLinks() {

        List<Link> failedLinks = new ArrayList<>();

        for (Link link : network.getLinks()) {
            if (!link.isActive()) {
                failedLinks.add(link);
            }
        }

        return failedLinks;
    }

    public void displayFailures() {

        System.out.println("\n===== FAILURE DETECTION =====");

        List<Router> failedRouters = getFailedRouters();
        List<Link> failedLinks = getFailedLinks();

        if (failedRouters.isEmpty()) {
            System.out.println("Failed Routers : None");
        } else {
            System.out.println("Failed Routers:");

            for (Router router : failedRouters) {
                System.out.println(
                        "  Router " + router.getId() + " -> FAILED"
                );
            }
        }

        if (failedLinks.isEmpty()) {
            System.out.println("Failed Links   : None");
        } else {
            System.out.println("Failed Links:");

            for (Link link : failedLinks) {
                System.out.println(
                        "  " + link.getSource().getId()
                                + " <-> "
                                + link.getDestination().getId()
                                + " -> FAILED"
                );
            }
        }
    }
}