package com.netheal.simulation;

import com.netheal.graph.NetworkGraph;
import com.netheal.metrics.NetworkMetrics;
import com.netheal.routing.DijkstraRouter;

import java.util.List;

public class PacketSimulator {

    private final NetworkGraph network;
    private final NetworkMetrics metrics;

    public PacketSimulator(
            NetworkGraph network,
            NetworkMetrics metrics) {

        this.network = network;
        this.metrics = metrics;
    }

    public void sendPacket(Packet packet) {

        metrics.recordPacketSent();

        System.out.println("\n===== PACKET TRANSMISSION =====");

        System.out.println(
                "Packet ID    : " + packet.getId()
        );

        System.out.println(
                "Source       : " + packet.getSource()
        );

        System.out.println(
                "Destination  : " + packet.getDestination()
        );

        List<String> path =
                DijkstraRouter.findShortestPath(
                        network,
                        packet.getSource(),
                        packet.getDestination()
                );

        if (path.isEmpty()) {

            packet.setStatus("FAILED");

            metrics.recordPacketFailed();

            System.out.println(
                    "Status       : FAILED"
            );

            System.out.println(
                    "Reason       : No available route"
            );

            return;
        }

        packet.setStatus("IN_TRANSIT");

        System.out.println(
                "Route        : "
                        + String.join(" -> ", path)
        );

        System.out.println("\nPacket journey:");

        for (String router : path) {

            System.out.println(
                    "  Packet "
                            + packet.getId()
                            + " -> Router "
                            + router
            );
        }

        packet.setStatus("DELIVERED");

        metrics.recordPacketDelivered();

        System.out.println(
                "\nStatus       : DELIVERED"
        );
    }
}