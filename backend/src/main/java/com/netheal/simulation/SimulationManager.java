package com.netheal.simulation;

import com.netheal.graph.NetworkGraph;
import com.netheal.metrics.NetworkMetrics;
import com.netheal.model.Link;
import com.netheal.model.Router;
import com.netheal.recovery.FailureDetector;
import com.netheal.recovery.SelfHealingEngine;
import com.netheal.routing.DijkstraRouter;

import java.util.List;

public class SimulationManager {

    public void runAlternateRouteScenario() {

        printHeader(
                "SCENARIO 1",
                "ALTERNATE ROUTE AVAILABLE"
        );

        NetworkGraph network = createRedundantNetwork();

        NetworkMetrics metrics =
                new NetworkMetrics();

        FailureDetector detector =
                new FailureDetector(network);

        SelfHealingEngine healing =
                new SelfHealingEngine(
                        network,
                        detector,
                        metrics
                );

        PacketSimulator simulator =
                new PacketSimulator(
                        network,
                        metrics
                );

        String source = "A";
        String destination = "D";

        List<String> initialRoute =
                DijkstraRouter.findShortestPath(
                        network,
                        source,
                        destination
                );

        System.out.println(
                "\nInitial Route : "
                        + String.join(
                                " -> ",
                                initialRoute
                        )
        );

        Packet packet1 =
                new Packet(
                        1,
                        source,
                        destination
                );

        simulator.sendPacket(packet1);

        Link AB = network.getLink("A", "B");

        System.out.println(
                "\n>>> FAILING LINK A-B <<<"
        );

        AB.fail();

        detector.displayFailures();

        List<String> recoveredRoute =
                healing.recoverRoute(
                        source,
                        destination,
                        initialRoute
                );

        Packet packet2 =
                new Packet(
                        2,
                        source,
                        destination
                );

        simulator.sendPacket(packet2);

        System.out.println(
                "\nRecovered Route : "
                        + String.join(
                                " -> ",
                                recoveredRoute
                        )
        );

        metrics.displayMetrics();
    }

    public void runNoAlternateRouteScenario() {

        printHeader(
                "SCENARIO 2",
                "NO ALTERNATE ROUTE"
        );

        NetworkGraph network =
                createLinearNetwork();

        NetworkMetrics metrics =
                new NetworkMetrics();

        FailureDetector detector =
                new FailureDetector(network);

        SelfHealingEngine healing =
                new SelfHealingEngine(
                        network,
                        detector,
                        metrics
                );

        PacketSimulator simulator =
                new PacketSimulator(
                        network,
                        metrics
                );

        String source = "A";
        String destination = "D";

        List<String> initialRoute =
                DijkstraRouter.findShortestPath(
                        network,
                        source,
                        destination
                );

        System.out.println(
                "\nInitial Route : "
                        + String.join(
                                " -> ",
                                initialRoute
                        )
        );

        Packet packet1 =
                new Packet(
                        1,
                        source,
                        destination
                );

        simulator.sendPacket(packet1);

        Link BC = network.getLink("B", "C");

        System.out.println(
                "\n>>> FAILING LINK B-C <<<"
        );

        BC.fail();

        detector.displayFailures();

        List<String> recoveredRoute =
                healing.recoverRoute(
                        source,
                        destination,
                        initialRoute
                );

        Packet packet2 =
                new Packet(
                        2,
                        source,
                        destination
                );

        simulator.sendPacket(packet2);

        System.out.println(
                "\n===== SCENARIO 2 RESULT ====="
        );

        if (recoveredRoute.isEmpty()) {

            System.out.println(
                    "Recovery Result : FAILED"
            );

            System.out.println(
                    "Reason          : No alternate route"
            );

        } else {

            System.out.println(
                    "Recovered Route : "
                            + String.join(
                                    " -> ",
                                    recoveredRoute
                            )
            );
        }

        System.out.println(
                "Packet 1 Status : "
                        + packet1.getStatus()
        );

        System.out.println(
                "Packet 2 Status : "
                        + packet2.getStatus()
        );

        metrics.displayMetrics();
    }

    public void runMultipleRoutesScenario() {

        printHeader(
                "SCENARIO 3",
                "MULTIPLE ROUTES"
        );

        NetworkGraph network =
                createMultipleRouteNetwork();

        NetworkMetrics metrics =
                new NetworkMetrics();

        FailureDetector detector =
                new FailureDetector(network);

        SelfHealingEngine healing =
                new SelfHealingEngine(
                        network,
                        detector,
                        metrics
                );

        PacketSimulator simulator =
                new PacketSimulator(
                        network,
                        metrics
                );

        String source = "A";
        String destination = "D";

        List<String> initialRoute =
                DijkstraRouter.findShortestPath(
                        network,
                        source,
                        destination
                );

        int initialCost =
                DijkstraRouter.calculatePathCost(
                        network,
                        initialRoute
                );

        System.out.println(
                "\nSelected Route : "
                        + String.join(
                                " -> ",
                                initialRoute
                        )
        );

        System.out.println(
                "Route Cost     : "
                        + initialCost
        );

        Packet packet1 =
                new Packet(
                        1,
                        source,
                        destination
                );

        simulator.sendPacket(packet1);

        Link AB = network.getLink("A", "B");

        System.out.println(
                "\n>>> FAILING LINK A-B <<<"
        );

        AB.fail();

        detector.displayFailures();

        List<String> recoveredRoute =
                healing.recoverRoute(
                        source,
                        destination,
                        initialRoute
                );

        if (!recoveredRoute.isEmpty()) {

            int recoveredCost =
                    DijkstraRouter.calculatePathCost(
                            network,
                            recoveredRoute
                    );

            System.out.println(
                    "\n===== ROUTE COMPARISON ====="
            );

            System.out.println(
                    "Original Route  : "
                            + String.join(
                                    " -> ",
                                    initialRoute
                            )
            );

            System.out.println(
                    "Original Cost   : "
                            + initialCost
            );

            System.out.println(
                    "Recovered Route : "
                            + String.join(
                                    " -> ",
                                    recoveredRoute
                            )
            );

            System.out.println(
                    "Recovered Cost  : "
                            + recoveredCost
            );
        }

        Packet packet2 =
                new Packet(
                        2,
                        source,
                        destination
                );

        simulator.sendPacket(packet2);

        System.out.println(
                "\n===== SCENARIO 3 RESULT ====="
        );

        System.out.println(
                "Packet 1 Status : "
                        + packet1.getStatus()
        );

        System.out.println(
                "Packet 2 Status : "
                        + packet2.getStatus()
        );

        metrics.displayMetrics();
    }

    // =========================================================
    // NETWORK CREATION METHODS
    // =========================================================

    private NetworkGraph createRedundantNetwork() {

        NetworkGraph network =
                new NetworkGraph();

        Router A = new Router("A");
        Router B = new Router("B");
        Router C = new Router("C");
        Router D = new Router("D");

        network.addRouter(A);
        network.addRouter(B);
        network.addRouter(C);
        network.addRouter(D);

        network.addLink(
                new Link(A, B, 2)
        );

        network.addLink(
                new Link(A, C, 4)
        );

        network.addLink(
                new Link(B, D, 3)
        );

        network.addLink(
                new Link(C, D, 1)
        );

        return network;
    }

    private NetworkGraph createLinearNetwork() {

        NetworkGraph network =
                new NetworkGraph();

        Router A = new Router("A");
        Router B = new Router("B");
        Router C = new Router("C");
        Router D = new Router("D");

        network.addRouter(A);
        network.addRouter(B);
        network.addRouter(C);
        network.addRouter(D);

        network.addLink(
                new Link(A, B, 2)
        );

        network.addLink(
                new Link(B, C, 3)
        );

        network.addLink(
                new Link(C, D, 2)
        );

        return network;
    }

    private NetworkGraph createMultipleRouteNetwork() {

        NetworkGraph network =
                new NetworkGraph();

        Router A = new Router("A");
        Router B = new Router("B");
        Router C = new Router("C");
        Router D = new Router("D");

        network.addRouter(A);
        network.addRouter(B);
        network.addRouter(C);
        network.addRouter(D);

        // Route 1: A -> B -> D = 4
        network.addLink(
                new Link(A, B, 2)
        );

        network.addLink(
                new Link(B, D, 2)
        );

        // Route 2: A -> C -> D = 5
        network.addLink(
                new Link(A, C, 4)
        );

        network.addLink(
                new Link(C, D, 1)
        );

        return network;
    }

    private void printHeader(
            String scenario,
            String description) {

        System.out.println("\n\n");

        System.out.println(
                "=============================================="
        );

        System.out.println(
                "          NETHEAL - " + scenario
        );

        System.out.println(
                "          " + description
        );

        System.out.println(
                "=============================================="
        );
    }
}