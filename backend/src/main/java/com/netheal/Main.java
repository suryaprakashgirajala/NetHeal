package com.netheal;

import com.netheal.graph.NetworkGraph;
import com.netheal.model.Link;
import com.netheal.model.Router;
import com.netheal.routing.DijkstraRouter;
import com.netheal.simulation.Packet;
import com.netheal.simulation.PacketSimulator;
import com.netheal.recovery.SelfHealingEngine;
import com.netheal.recovery.FailureDetector;
import com.netheal.metrics.NetworkMetrics;

import java.util.List;

public class Main {

    public static void main(String[] args) {

        // Run all three scenarios
        runAlternateRouteScenario();

        runNoAlternateRouteScenario();

        runMultipleRoutesScenario();
    }

    // =========================================================
    // SCENARIO 1: ALTERNATE ROUTE AVAILABLE
    // =========================================================

    private static void runAlternateRouteScenario() {

        System.out.println("\n\n");
        System.out.println("==============================================");
        System.out.println("      NETHEAL - SCENARIO 1");
        System.out.println("      ALTERNATE ROUTE AVAILABLE");
        System.out.println("==============================================");

        NetworkGraph network = new NetworkGraph();

        // Create routers
        Router A = new Router("A");
        Router B = new Router("B");
        Router C = new Router("C");
        Router D = new Router("D");

        // Add routers
        network.addRouter(A);
        network.addRouter(B);
        network.addRouter(C);
        network.addRouter(D);

        // Create links
        Link AB = new Link(A, B, 2);
        Link AC = new Link(A, C, 4);
        Link BD = new Link(B, D, 3);
        Link CD = new Link(C, D, 1);

        network.addLink(AB);
        network.addLink(AC);
        network.addLink(BD);
        network.addLink(CD);

        // Create system components
        NetworkMetrics metrics = new NetworkMetrics();

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

        // Find initial route
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

        System.out.println(
                "Initial Cost  : "
                        + DijkstraRouter.calculatePathCost(
                                network,
                                initialRoute
                        )
        );

        // Send packet before failure
        Packet packet1 =
                new Packet(
                        1,
                        source,
                        destination
                );

        simulator.sendPacket(packet1);

        // Fail A-B
        System.out.println(
                "\n>>> FAILING LINK A-B <<<"
        );

        AB.fail();

        detector.displayFailures();

        // Self-healing
        List<String> recoveredRoute =
                healing.recoverRoute(
                        source,
                        destination,
                        initialRoute
                );

        // Send packet after recovery
        Packet packet2 =
                new Packet(
                        2,
                        source,
                        destination
                );

        simulator.sendPacket(packet2);

        // Result
        System.out.println(
                "\n===== SCENARIO 1 RESULT ====="
        );

        System.out.println(
                "Recovered Route : "
                        + String.join(
                                " -> ",
                                recoveredRoute
                        )
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
    // SCENARIO 2: NO ALTERNATE ROUTE
    // =========================================================

    private static void runNoAlternateRouteScenario() {

        System.out.println("\n\n");
        System.out.println("==============================================");
        System.out.println("      NETHEAL - SCENARIO 2");
        System.out.println("      NO ALTERNATE ROUTE");
        System.out.println("==============================================");

        NetworkGraph network = new NetworkGraph();

        // Create routers
        Router A = new Router("A");
        Router B = new Router("B");
        Router C = new Router("C");
        Router D = new Router("D");

        // Add routers
        network.addRouter(A);
        network.addRouter(B);
        network.addRouter(C);
        network.addRouter(D);

        // Linear network:
        // A -> B -> C -> D

        Link AB = new Link(A, B, 2);
        Link BC = new Link(B, C, 3);
        Link CD = new Link(C, D, 2);

        network.addLink(AB);
        network.addLink(BC);
        network.addLink(CD);

        // Create system components
        NetworkMetrics metrics = new NetworkMetrics();

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

        // Find initial route
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

        System.out.println(
                "Initial Cost  : "
                        + DijkstraRouter.calculatePathCost(
                                network,
                                initialRoute
                        )
        );

        // Send packet before failure
        Packet packet1 =
                new Packet(
                        1,
                        source,
                        destination
                );

        simulator.sendPacket(packet1);

        // Fail middle link B-C
        System.out.println(
                "\n>>> FAILING LINK B-C <<<"
        );

        BC.fail();

        detector.displayFailures();

        // Attempt recovery
        List<String> recoveredRoute =
                healing.recoverRoute(
                        source,
                        destination,
                        initialRoute
                );

        // Send packet after failure
        Packet packet2 =
                new Packet(
                        2,
                        source,
                        destination
                );

        simulator.sendPacket(packet2);

        // Result
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

    // =========================================================
    // SCENARIO 3: MULTIPLE ROUTES
    // =========================================================

    private static void runMultipleRoutesScenario() {

        System.out.println("\n\n");
        System.out.println("==============================================");
        System.out.println("      NETHEAL - SCENARIO 3");
        System.out.println("      MULTIPLE ROUTES");
        System.out.println("==============================================");

        NetworkGraph network = new NetworkGraph();

        // Create routers
        Router A = new Router("A");
        Router B = new Router("B");
        Router C = new Router("C");
        Router D = new Router("D");

        // Add routers
        network.addRouter(A);
        network.addRouter(B);
        network.addRouter(C);
        network.addRouter(D);

        /*
         * Route 1:
         * A -> B -> D
         * Cost = 2 + 2 = 4
         *
         * Route 2:
         * A -> C -> D
         * Cost = 4 + 1 = 5
         */

        Link AB = new Link(A, B, 2);
        Link BD = new Link(B, D, 2);

        Link AC = new Link(A, C, 4);
        Link CD = new Link(C, D, 1);

        network.addLink(AB);
        network.addLink(BD);
        network.addLink(AC);
        network.addLink(CD);

        // Create system components
        NetworkMetrics metrics = new NetworkMetrics();

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

        // ==============================================
        // FIND BEST INITIAL ROUTE
        // ==============================================

        System.out.println(
                "\n===== INITIAL ROUTING ====="
        );

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
                "Selected Route : "
                        + String.join(
                                " -> ",
                                initialRoute
                        )
        );

        System.out.println(
                "Route Cost     : "
                        + initialCost
        );

        // ==============================================
        // SEND PACKET BEFORE FAILURE
        // ==============================================

        Packet packet1 =
                new Packet(
                        1,
                        source,
                        destination
                );

        simulator.sendPacket(packet1);

        // ==============================================
        // FAIL BEST ROUTE
        // ==============================================

        System.out.println(
                "\n>>> FAILING LINK A-B <<<"
        );

        AB.fail();

        detector.displayFailures();

        // ==============================================
        // SELF-HEALING
        // ==============================================

        List<String> recoveredRoute =
                healing.recoverRoute(
                        source,
                        destination,
                        initialRoute
                );

        // ==============================================
        // ROUTE COMPARISON
        // ==============================================

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

        // ==============================================
        // SEND PACKET AFTER RECOVERY
        // ==============================================

        Packet packet2 =
                new Packet(
                        2,
                        source,
                        destination
                );

        simulator.sendPacket(packet2);

        // ==============================================
        // FINAL RESULT
        // ==============================================

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
}